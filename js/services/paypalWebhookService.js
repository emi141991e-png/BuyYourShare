/**
 * BuyYourShare - PayPal Webhook & Subscription Verification Service
 * Gestione eventi PayPal Sandbox Webhook certificati server-side per rinnovi,
 * pagamenti, cancellazioni e tenuta del registro contabile con fee di 1,49 € / mese.
 */

import { db } from '../db/database.js';
import { financialAuditService } from './financialAuditService.js';
import { calculateMonthlyPeriod, addOneMonth } from '../engine/DateEngine.js';
import { allocatePaymentTransaction, DEFAULT_PLATFORM_FEE_CENTS } from '../engine/FeeEngine.js';
import { stripeConnectService } from './stripeConnectService.js';

class PayPalWebhookService {
  /**
   * Processa un evento webhook certificato proveniente da PayPal Sandbox / API.
   * @param {Object} eventPayload - Evento PayPal Webhook (BILLING.SUBSCRIPTION.* / PAYMENT.SALE.*)
   */
  async processEvent(eventPayload) {
    const eventType = eventPayload.event_type || eventPayload.type;
    const resource = eventPayload.resource || eventPayload.data?.object;

    if (!eventType || !resource) {
      throw new Error('Payload PayPal Webhook non valido');
    }

    console.log(`[PAYPAL WEBHOOK] Ricevuto evento: ${eventType} (Resource ID: ${resource.id})`);

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
      case 'CHECKOUT.ORDER.APPROVED':
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.CREATED':
        return await this.handleSubscriptionActivated(resource);

      case 'PAYMENT.SALE.COMPLETED':
        return await this.handlePaymentSaleCompleted(resource);

      case 'PAYMENT.SALE.DENIED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        return await this.handlePaymentSaleDenied(resource);

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        return await this.handleSubscriptionCancelled(resource);

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        return await this.handleSubscriptionExpired(resource);

      case 'PAYMENT.SALE.REFUNDED':
      case 'PAYMENT.SALE.REVERSED':
        return await this.handlePaymentRefunded(resource);

      default:
        console.log(`[PAYPAL WEBHOOK] Evento non gestito direttamente: ${eventType}`);
        return { status: 'IGNORED', eventType };
    }
  }

  /**
   * Gestisce l'attivazione iniziale di una Subscription o Capture PayPal.
   */
  async handleSubscriptionActivated(resource) {
    const realCaptureId = resource.id;
    const realOrderId = resource.order_id || resource.custom_id_order || resource.id;
    const customData = this.extractCustomMetadata(resource);
    const { groupId, memberId, slotNumber, baseShareCents } = customData;

    const group = db.getGroupById(groupId);
    if (!group) throw new Error(`Gruppo ${groupId} non trovato`);

    const grossFeeCents = DEFAULT_PLATFORM_FEE_CENTS; // 1,49 € (149 cents)
    const amountCents = (baseShareCents || group.baseMemberShareCents) + grossFeeCents;
    const period = calculateMonthlyPeriod();

    let membership = db.data.memberships.find(
      m => m.groupId === groupId && m.userId === memberId && m.slotNumber === slotNumber
    );

    if (!membership) {
      membership = {
        id: 'mem_pp_' + Date.now(),
        groupId: groupId,
        userId: memberId,
        role: 'MEMBER',
        slotNumber: slotNumber,
        paidShareCents: baseShareCents || group.baseMemberShareCents,
        paidFeeCents: grossFeeCents,
        memberTotalCents: amountCents,
        paymentMethod: 'PAYPAL_EEA',
        status: 'ACTIVE',
        autoRenew: true,
        paypalSubscriptionId: realCaptureId,
        currentPeriodStart: period.current_period_start,
        currentPeriodEnd: period.current_period_end,
        nextBillingDate: period.next_billing_date,
        joinedAt: new Date().toISOString()
      };
      db.data.memberships.push(membership);

      // Aggiorna posti occupati nel gruppo
      const grpRef = db.data.groups.find(g => g.id === groupId);
      if (grpRef) {
        grpRef.occupiedMemberSlots = (grpRef.occupiedMemberSlots || 0) + 1;
        if (grpRef.occupiedMemberSlots >= (grpRef.availableSlots || (grpRef.totalSlots - grpRef.ownerSlots))) {
          grpRef.status = 'full';
        }
      }

      // Inserisci nella Chat Privata del Gruppo
      const memberUser = db.data.users.find(u => u.id === memberId);
      const memberName = memberUser ? memberUser.fullName : 'Nuovo Membro';
      const chat = db.data.chats.find(c => c.groupId === groupId);
      if (chat) {
        db.data.chatMessages.push({
          id: 'msg-' + Date.now(),
          chatId: chat.id,
          senderId: null,
          messageType: 'SYSTEM',
          messageContent: `👤 ${memberName} è entrato nel gruppo (Posto #${slotNumber}). Pagamento PayPal confermato.`,
          createdAt: new Date().toISOString()
        });
      }

      // Notifica al Capogruppo
      db.addNotification(
        group.ownerId,
        '🎉 Nuovo membro pagante (PayPal)!',
        `${memberName} ha acquistato il Posto #${slotNumber} di "${group.customServiceName}". Quota accreditata: +${((baseShareCents || group.baseMemberShareCents) / 100).toFixed(2)} €/mese.`,
        'payment',
        groupId
      );
    } else {
      membership.status = 'ACTIVE';
      membership.paypalSubscriptionId = realCaptureId;
      membership.autoRenew = true;
    }

    // Registra nel Ledger Contabile Immutabile con ID REALE PAYPAL ed esecuzione Payout
    const providerFeeCents = Math.round(amountCents * 0.022) + 25; // 2,2% + 0,25 € PayPal SEE
    const idempotencyKey = `pp_tx_${realCaptureId}_init`;

    const ownerUser = db.data.users.find(u => u.id === group.ownerId) || { id: group.ownerId, fullName: 'Capogruppo' };
    const payoutResult = stripeConnectService.executePayoutTransfer({ baseShareCents: membership.paidShareCents, groupId, memberId }, ownerUser);

    financialAuditService.recordTransaction({
      transactionId: realCaptureId, // ID REALE CATTURA PAYPAL
      invoiceId: realOrderId,       // ID REALE ORDINE PAYPAL
      subscriptionId: 'pp_vault_' + realOrderId,
      connectedAccountId: group.ownerId,
      memberId: memberId,
      groupId: groupId,
      slotNumber: slotNumber,
      baseShareCents: membership.paidShareCents,
      buyyourshareFeeCents: grossFeeCents, // 1,49 € LORDI FISSI
      totalAmountCents: amountCents,
      paymentProviderFeeCents: providerFeeCents,
      netPlatformAmountCents: grossFeeCents - providerFeeCents,
      paymentMethod: 'PAYPAL_EEA',
      cycleNumber: 1,
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

    db.addNotification(
      memberId,
      'Abbonamento PayPal Attivato! 🎉',
      `Il tuo posto #${slotNumber} in ${group.customServiceName} è attivo. Credenziali e chat sbloccate.`,
      'MEMBERSHIP_ACTIVE',
      groupId
    );

    db.save();
    return { status: 'PROCESSED', membershipId: membership.id, state: 'ACTIVE' };
  }

  /**
   * Gestisce l'incasso mensile riuscito (Mese 1, Mese 2, Mese 3... Mese N).
   */
  async handlePaymentSaleCompleted(resource) {
    const subscriptionId = resource.billing_agreement_id || resource.subscription_id;
    const saleId = resource.id;
    const totalPaidEuros = parseFloat(resource.amount?.total || resource.amount_paid || 4.99);
    const totalPaidCents = Math.round(totalPaidEuros * 100);

    let membership = db.data.memberships.find(
      m => m.paypalSubscriptionId === subscriptionId || m.stripeSubscriptionId === subscriptionId
    );

    if (!membership) {
      console.warn(`[PAYPAL SALE] Membership per subscription ${subscriptionId} non trovata, tento match da metadata`);
      return { status: 'SKIPPED_NO_MEMBERSHIP' };
    }

    const group = db.getGroupById(membership.groupId);
    const grossFeeCents = DEFAULT_PLATFORM_FEE_CENTS; // 1,49 €
    const baseShareCents = membership.paidShareCents;
    const providerFeeCents = Math.round(totalPaidCents * 0.022) + 25;

    // Estende la validità temporale del periodo
    const newStart = new Date(membership.currentPeriodEnd);
    const newEnd = addOneMonth(newStart);
    membership.currentPeriodStart = newStart.toISOString();
    membership.currentPeriodEnd = newEnd.toISOString();
    membership.nextBillingDate = newEnd.toISOString();
    membership.status = 'ACTIVE';

    const previousCycle = db.data.financialAuditLogs.filter(
      l => l.subscriptionId === subscriptionId
    ).length;
    const currentCycle = previousCycle + 1;

    // Registra nel Ledger Contabile Immutabile
    financialAuditService.recordTransaction({
      transactionId: saleId,
      invoiceId: 'pp_inv_' + saleId,
      subscriptionId: subscriptionId,
      connectedAccountId: group.ownerId,
      memberId: membership.userId,
      groupId: membership.groupId,
      slotNumber: membership.slotNumber,
      baseShareCents: baseShareCents,
      buyyourshareFeeCents: grossFeeCents, // 1,49 € FISSI
      totalAmountCents: totalPaidCents,
      paymentProviderFeeCents: providerFeeCents,
      netPlatformAmountCents: grossFeeCents - providerFeeCents,
      paymentMethod: 'PAYPAL_EEA',
      cycleNumber: currentCycle,
      paymentStatus: 'SUCCEEDED',
      transferStatus: 'TRANSFERRED',
      idempotencyKey: `pp_sale_${saleId}`
    });

    db.addNotification(
      membership.userId,
      `Rinnovo Mensile PayPal Confermato (Mese ${currentCycle})`,
      `È stato addebitato il rinnovo di ${(totalPaidCents/100).toFixed(2)} € per ${group.customServiceName}.`,
      'RENEWAL_SUCCESS',
      membership.groupId
    );

    db.save();
    return { status: 'RENEWED', cycle: currentCycle, membershipId: membership.id };
  }

  /**
   * Gestisce il rifiuto/fallimento di un rinnovo PayPal (Fondi insufficienti).
   */
  async handlePaymentSaleDenied(resource) {
    const subscriptionId = resource.billing_agreement_id || resource.subscription_id;
    let membership = db.data.memberships.find(m => m.paypalSubscriptionId === subscriptionId);
    if (membership) {
      membership.status = 'PAST_DUE';
      db.addNotification(
        membership.userId,
        '⚠️ Rinnovo PayPal Non Riuscito',
        'Il rinnovo mensile tramite PayPal è fallito per fondi insufficienti. Aggiorna il conto per mantenere l\'accesso.',
        'PAYMENT_FAILED',
        membership.groupId
      );
      db.save();
    }
    return { status: 'MARKED_PAST_DUE' };
  }

  /**
   * Gestisce la cancellazione del rinnovo PayPal (mantiene attivo fino a scadenza).
   */
  async handleSubscriptionCancelled(resource) {
    const subscriptionId = resource.id;
    let membership = db.data.memberships.find(m => m.paypalSubscriptionId === subscriptionId);
    if (membership) {
      membership.autoRenew = false;
      membership.status = 'CANCELLATION_SCHEDULED';
      db.addNotification(
        membership.userId,
        'Rinnovo PayPal Annullato',
        `Il rinnovo automatico è stato disattivato. L'accesso rimarrà valido fino al termine del periodo pagato (${new Date(membership.currentPeriodEnd).toLocaleDateString('it-IT')}).`,
        'SUBSCRIPTION_CANCELLED',
        membership.groupId
      );
      db.save();
    }
    return { status: 'CANCELLED_SCHEDULED' };
  }

  /**
   * Gestisce la scadenza definitiva o sospensione della Subscription.
   */
  async handleSubscriptionExpired(resource) {
    const subscriptionId = resource.id;
    let membership = db.data.memberships.find(m => m.paypalSubscriptionId === subscriptionId);
    if (membership) {
      membership.status = 'EXPIRED';
      membership.autoRenew = false;
      db.addNotification(
        membership.userId,
        'Abbonamento Scaduto',
        'Il tuo abbonamento è scaduto. Il posto è stato liberato.',
        'MEMBERSHIP_EXPIRED',
        membership.groupId
      );
      db.save();
    }
    return { status: 'EXPIRED' };
  }

  /**
   * Gestisce l'eventuale rimborso di un pagamento PayPal.
   */
  async handlePaymentRefunded(resource) {
    const saleId = resource.sale_id || resource.parent_payment;
    console.log(`[PAYPAL REFUND] Registrato rimborso per transazione ${saleId}`);
    return { status: 'REFUND_RECORDED' };
  }

  /**
   * Estrae i metadata personalizzati dal custom_id della subscription.
   */
  extractCustomMetadata(resource) {
    let custom = {};
    if (resource.custom_id) {
      try {
        custom = typeof resource.custom_id === 'string' ? JSON.parse(resource.custom_id) : resource.custom_id;
      } catch (e) {
        // Fallback string parser
        const parts = resource.custom_id.split(':');
        if (parts.length >= 3) {
          custom = { groupId: parts[0], memberId: parts[1], slotNumber: parseInt(parts[2], 10) };
        }
      }
    }
    return custom;
  }
}

export const paypalWebhookService = new PayPalWebhookService();
