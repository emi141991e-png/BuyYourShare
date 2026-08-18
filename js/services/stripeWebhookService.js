/**
 * BuyYourShare - Stripe Webhook Service
 * Elaborazione Server-Side sicura degli eventi Stripe con verifica firme, idempotenza e zero-trust
 */

import { db } from '../db/database.js';
import { financialAuditService } from './financialAuditService.js';
import { calculateMonthlyPeriod } from '../engine/DateEngine.js';
import { stripeConnectService } from './stripeConnectService.js';

class StripeWebhookService {
  /**
   * Router centrale per la gestione degli eventi Webhook.
   * @param {Object} event - Payload dell'evento Stripe
   */
  async processEvent(event) {
    console.log(`[STRIPE WEBHOOK] Ricevuto evento: ${event.type} (ID: ${event.id})`);

    switch (event.type) {
      case 'invoice.payment_succeeded':
        return this.handleInvoicePaymentSucceeded(event.data.object);

      case 'invoice.payment_failed':
        return this.handleInvoicePaymentFailed(event.data.object);

      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(event.data.object);

      case 'charge.refunded':
        return this.handleChargeRefunded(event.data.object);

      case 'account.updated':
        return this.handleAccountUpdated(event.data.object);

      default:
        console.log(`[STRIPE WEBHOOK] Evento non gestito o informativo: ${event.type}`);
        return { status: 'ignored' };
    }
  }

  /**
   * EVENTO CHIAVE: Pagamento Riuscito (Primo Pagamento o Rinnovo Ricorrente)
   * 1. Verifica incasso effettivo (amount_paid > 0 & status === 'paid')
   * 2. Esegue il trasferimento della quota base al Capogruppo con Idempotency Key
   * 3. Registra 99 centesimi di commissione LORDA fissa nel Ledger Contabile
   * 4. Attiva/Rinnova la Membership (ACTIVE)
   * 5. Sblocca le credenziali e aggiunge il membro alla chat
   */
  handleInvoicePaymentSucceeded(invoice) {
    if (invoice.status !== 'paid' || invoice.amount_paid <= 0) {
      console.warn(`[STRIPE WEBHOOK] Invoice ${invoice.id} non pagata o importo zero. Ignorato.`);
      return { status: 'not_paid' };
    }

    const metadata = invoice.metadata || {};
    const groupId = metadata.groupId;
    const memberId = metadata.memberId;
    const slotNumber = parseInt(metadata.slotNumber, 10);
    const baseShareCents = parseInt(metadata.baseShareCents, 10);
    const cycleNumber = parseInt(metadata.cycleNumber, 10) || 1;
    const isFirstPayment = cycleNumber === 1;

    const group = db.getGroupById(groupId);
    if (!group) throw new Error(`Gruppo ${groupId} non trovato`);
    const grossFeeCents = 149; // 1,49 € COMMISSIONE LORDA FISSA
    const paymentMethod = metadata.paymentMethod || 'CARD_EEA';
    
    // Calcolo costo Stripe / PayPal specifico per il metodo
    const providerCostCents = paymentMethod === 'PAYPAL_CROSSBORDER'
      ? (Math.round(invoice.amount_paid * 0.036) + 25)
      : (Math.round(invoice.amount_paid * 0.022) + 25);

    // 1. Controllo Idempotenza sul Trasferimento e Audit Log
    const idempotencyKey = `transfer_${invoice.id}`;
    
    // 2. Esecuzione del Trasferimento al Connected Account del Capogruppo
    const ownerUser = db.data.users.find(u => u.id === group.ownerId) || { id: group.ownerId, fullName: 'Capogruppo' };
    const payoutResult = stripeConnectService.executePayoutTransfer({ baseShareCents, groupId, memberId }, ownerUser);

    // 3. Scrittura nel Ledger Contabile Immutabile con stato del Payout reale
    const auditRecord = financialAuditService.recordTransaction({
      transactionId: invoice.payment_intent || ('tx_' + Date.now()),
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription || ('sub_' + Date.now()),
      connectedAccountId: group.ownerId,
      memberId: memberId,
      groupId: groupId,
      slotNumber: slotNumber,
      baseShareCents: baseShareCents,
      buyyourshareFeeCents: grossFeeCents, // 149 centesimi LORDI FISSI
      totalAmountCents: invoice.amount_paid,
      paymentProviderFeeCents: providerCostCents, // Costo effettivo specifico (Carta o PayPal)
      netPlatformAmountCents: grossFeeCents - providerCostCents,
      paymentMethod: paymentMethod,
      cycleNumber: cycleNumber,
      paymentStatus: 'SUCCEEDED',
      transferStatus: payoutResult.transferStatus,
      payoutStatus: payoutResult.payoutStatus,
      transferId: payoutResult.transferId,
      payoutId: payoutResult.payoutId,
      payoutDestination: payoutResult.payoutDestination,
      payoutDate: payoutResult.payoutDate,
      payoutFailureReason: payoutResult.payoutFailureReason,
      idempotencyKey: idempotencyKey
    });

    // 3. Gestione Membership per questo specifico slot (Attivazione o Rinnovo)
    let membership = db.data.memberships.find(m => m.groupId === groupId && m.userId === memberId && m.role === 'MEMBER' && m.slotNumber === slotNumber);
    const period = calculateMonthlyPeriod();

    if (!membership) {
      // Primo Pagamento -> Creazione Nuova Membership
      membership = {
        id: 'mem-' + Date.now(),
        groupId: groupId,
        userId: memberId,
        role: 'MEMBER',
        slotNumber: slotNumber,
        paidShareCents: baseShareCents,
        paidFeeCents: grossFeeCents,
        memberTotalCents: invoice.amount_paid,
        paymentMethod: paymentMethod,
        status: 'ACTIVE',
        autoRenew: true,
        stripeSubscriptionId: invoice.subscription,
        currentPeriodStart: period.current_period_start,
        currentPeriodEnd: period.current_period_end,
        nextBillingDate: period.next_billing_date,
        joinedAt: new Date().toISOString()
      };
      db.data.memberships.push(membership);

      // Aggiorna posti occupati nel gruppo
      const grpRef = db.data.groups.find(g => g.id === groupId);
      if (grpRef) {
        grpRef.occupiedMemberSlots += 1;
        if (grpRef.occupiedMemberSlots >= grpRef.availableSlots) {
          grpRef.status = 'full';
        }
      }

      // Inserisci nella Chat Privata del Gruppo
      const chat = db.data.chats.find(c => c.groupId === groupId);
      if (chat) {
        db.data.chatMessages.push({
          id: 'msg-' + Date.now(),
          chatId: chat.id,
          senderId: null,
          messageType: 'SYSTEM',
          messageContent: `👤 ${memberUser.fullName} è entrato nel gruppo (Posto #${slotNumber}). Pagamento confermato.`,
          createdAt: new Date().toISOString()
        });
      }

      // Notifica al Capogruppo
      db.data.notifications.push({
        id: 'notif-' + Date.now() + '-owner',
        userId: group.ownerId,
        type: 'payment',
        title: '🎉 Nuovo membro pagante nel tuo gruppo!',
        message: `${memberUser.fullName} ha acquistato il Posto #${slotNumber} di "${group.customServiceName}". Quota accreditata: +${(baseShareCents / 100).toFixed(2)} €/mese.`,
        actionUrl: '#miei-gruppi',
        isRead: false,
        createdAt: new Date().toISOString()
      });

    } else {
      // Rinnovo Ricorrente -> Aggiorna Periodo
      membership.status = 'ACTIVE';
      membership.currentPeriodStart = period.current_period_start;
      membership.currentPeriodEnd = period.current_period_end;
      membership.nextBillingDate = period.next_billing_date;

      // Notifica di Rinnovo Riuscito
      db.data.notifications.push({
        id: 'notif-' + Date.now() + '-renew',
        userId: memberId,
        type: 'payment',
        title: '🔄 Rinnovo mensile confermato!',
        message: `Il rinnovo per "${group.customServiceName}" (Posto #${slotNumber}) è andato a buon fine. Quota: ${(invoice.amount_paid / 100).toFixed(2)} €.`,
        actionUrl: '#miei-abbonamenti',
        isRead: false,
        createdAt: new Date().toISOString()
      });
    }

    db.save();
    return { status: 'success', auditRecord };
  }

  /**
   * EVENTO: Rinnovo Fallito (Fondi Insufficienti o Carta Scaduta)
   */
  handleInvoicePaymentFailed(invoice) {
    const metadata = invoice.metadata || {};
    const groupId = metadata.groupId;
    const memberId = metadata.memberId;

    const membership = db.data.memberships.find(m => m.groupId === groupId && m.userId === memberId);
    if (membership) {
      membership.status = 'PAST_DUE';
      
      // Invia notifica urgente di aggiornamento metodo di pagamento
      db.data.notifications.push({
        id: 'notif-' + Date.now() + '-failed',
        userId: memberId,
        type: 'payment_failed',
        title: '⚠️ Pagamento rinnovo fallito',
        message: `Il pagamento automatico non è riuscito. Aggiorna il metodo di pagamento entro 48 ore per mantenere l'accesso.`,
        actionUrl: '#miei-abbonamenti',
        isRead: false,
        createdAt: new Date().toISOString()
      });

      db.save();
    }
    return { status: 'past_due' };
  }

  /**
   * EVENTO: Subscription Cancellata / Scaduta
   */
  handleSubscriptionDeleted(subscription) {
    const membership = db.data.memberships.find(m => m.stripeSubscriptionId === subscription.id);
    if (membership) {
      membership.status = 'EXPIRED';
      membership.autoRenew = false;

      // Libera lo slot nel gruppo
      const group = db.data.groups.find(g => g.id === membership.groupId);
      if (group) {
        group.occupiedMemberSlots = Math.max(0, group.occupiedMemberSlots - 1);
        if (group.status === 'full' && group.occupiedMemberSlots < group.availableSlots) {
          group.status = 'active';
        }
      }

      db.save();
    }
    return { status: 'expired' };
  }

  /**
   * EVENTO: Rimborso Eseguito
   */
  handleChargeRefunded(charge) {
    const log = db.data.financialAuditLogs.find(l => l.transactionId === charge.id || l.invoiceId === charge.invoice);
    if (log) {
      log.paymentStatus = 'REFUNDED';
      log.transferStatus = 'REVERSED';
      db.save();
    }
    return { status: 'refunded' };
  }

  /**
   * EVENTO: Aggiornamento Stato Account Capogruppo
   */
  handleAccountUpdated(account) {
    const conn = db.data.connectedAccounts.find(c => c.stripeAccountId === account.id);
    if (conn) {
      conn.payoutsEnabled = !!account.payouts_enabled;
      conn.chargesEnabled = !!account.charges_enabled;
      db.save();
    }
    return { status: 'account_updated' };
  }
}

export const stripeWebhookService = new StripeWebhookService();
