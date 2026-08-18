/**
 * BuyYourShare - Multi-Gateway Checkout & Subscription Service
 * Instradamento e verifica server-side certificata sia per Stripe Connect che per PayPal Sandbox
 * Collegato alle REST API del Backend Server
 */

import { db } from '../db/database.js';
import { DEFAULT_PLATFORM_FEE_CENTS } from '../engine/FeeEngine.js';

class StripeCheckoutService {
  /**
   * Crea i dati per una sessione di Checkout ricorrente.
   */
  createCheckoutSession(groupId, memberUser, slotNumber, paymentMethod = 'CARD_EEA') {
    const group = db.getGroupById(groupId);
    if (!group) throw new Error('Gruppo non trovato');
    
    const slotsInfo = group.slotsInfo;
    const targetSlot = slotsInfo.slots.find(s => s.slotNumber === slotNumber);
    if (!targetSlot || targetSlot.isOccupied || targetSlot.isOwnerSlot) {
      throw new Error('Questo posto non è disponibile per l\'acquisto');
    }

    const sessionId = (paymentMethod === 'PAYPAL_EEA' ? 'pp_sess_' : 'cs_test_') + Date.now();
    const subscriptionId = (paymentMethod === 'PAYPAL_EEA' ? 'I-PP_' : 'sub_test_') + Date.now();
    const invoiceId = (paymentMethod === 'PAYPAL_EEA' ? 'pp_inv_' : 'in_test_') + Date.now();
    const feeCents = DEFAULT_PLATFORM_FEE_CENTS; // 149 centesimi (1,49 €)

    return {
      sessionId,
      subscriptionId,
      invoiceId,
      groupId,
      groupName: group.customServiceName,
      planName: group.planName,
      slotNumber: targetSlot.slotNumber,
      baseShareCents: targetSlot.baseShareCents,
      platformFeeCents: feeCents, // 1,49 € LORDA FISSA
      totalAmountCents: targetSlot.baseShareCents + feeCents,
      memberId: memberUser.id,
      memberEmail: memberUser.email,
      memberName: memberUser.fullName,
      ownerId: group.ownerId,
      paymentMethod: paymentMethod
    };
  }

  /**
   * Recupera il Plan ID reale (P-...) e Client ID da PayPal tramite il server.
   */
  async getPayPalPlan(serviceName, amountCents = 499) {
    const resp = await fetch(`/api/checkout/paypal/plan?serviceName=${encodeURIComponent(serviceName)}&amountCents=${amountCents}`);
    const data = await resp.json();
    if (!resp.ok || !data.success) {
      throw new Error(data.message || 'Impossibile recuperare il piano PayPal.');
    }
    return {
      planId: data.planId,
      clientId: data.clientId,
      amountCents: data.amountCents
    };
  }

  /**
   * Attiva server-side la vera PayPal Subscription (I-...) e invia il payout reale.
   */
  async activatePayPalSubscription(subscriptionId, sessionData) {
    const token = localStorage.getItem('buyyourshare_session_token') || ('bys_demo_token_' + sessionData.memberId);
    try {
      const resp = await fetch('/api/checkout/paypal/subscription-activate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-user-id': sessionData.memberId,
          'x-session-token': token
        },
        body: JSON.stringify({
          subscriptionId: subscriptionId,
          sessionData: sessionData
        })
      });

      const resData = await resp.json();
      if (!resp.ok || !resData.success) {
        const errorMsg = resData.message || resData.error || `Errore HTTP ${resp.status} durante l'attivazione della Subscription PayPal.`;
        return { success: false, error: errorMsg, details: resData };
      }

      this._syncLocalMembership(sessionData, resData, 'PAYPAL_EEA');
      return { success: true, result: resData };
    } catch (netErr) {
      console.error('[ACTIVATE NETWORK ERROR]', netErr);
      return { success: false, error: netErr.message || 'Errore di connessione con il server BuyYourShare' };
    }
  }

  /**
   * Esegue la verifica server-side autentica del pagamento chiamando il Backend Server.
   */
  async processTestPayment(sessionData, scenarioType = 'success', paymentMethod = 'CARD_EEA') {
    const token = localStorage.getItem('buyyourshare_session_token') || ('bys_demo_token_' + sessionData.memberId);

    // ==========================================
    // CANALE PAYPAL SANDBOX (SERVER-SIDE CAPTURE)
    // ==========================================
    if (paymentMethod === 'PAYPAL_EEA') {
      if (scenarioType === 'decline' || !sessionData.paypalCaptureId) {
        return { success: false, error: 'Il conto PayPal ha rifiutato l\'addebito o la cattura non è stata completata.' };
      }

      try {
        const resp = await fetch('/api/checkout/paypal/capture', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-user-id': sessionData.memberId,
            'x-session-token': token
          },
          body: JSON.stringify({
            orderId: sessionData.paypalOrderId || sessionData.subscriptionId,
            captureId: sessionData.paypalCaptureId,
            sessionData: sessionData
          })
        });

        const resData = await resp.json();
        if (!resp.ok) {
          return { success: false, error: resData.message || 'Errore durante la cattura PayPal.' };
        }

        // Sincronizzazione locale client immediata
        this._syncLocalMembership(sessionData, resData, 'PAYPAL_EEA');

        return { success: true, result: resData };
      } catch (err) {
        console.error('[CHECKOUT ERROR]', err);
        return { success: false, error: err.message || 'Errore di connessione con il server' };
      }
    }

    // ==========================================
    // CANALE STRIPE CONNECT (SERVER-SIDE CARD)
    // ==========================================
    try {
      const resp = await fetch('/api/checkout/stripe/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-user-id': sessionData.memberId,
          'x-session-token': token
        },
        body: JSON.stringify({
          sessionData,
          testScenario: scenarioType
        })
      });

      const resData = await resp.json();
      if (!resp.ok) {
        return { success: false, error: resData.message || 'La carta è stata rifiutata dal circuito bancario.' };
      }

      // Sincronizzazione locale client immediata
      this._syncLocalMembership(sessionData, resData, 'CARD_EEA');

      return { success: true, result: resData };
    } catch (err) {
      console.error('[STRIPE ERROR]', err);
      return { success: false, error: err.message || 'Errore di connessione con il server' };
    }
  }

  _syncLocalMembership(sessionData, resData, paymentMethod) {
    if (resData.auditLog) {
      const exists = db.data.financialAuditLogs.some(l => l.idempotencyKey === resData.auditLog.idempotencyKey);
      if (!exists) {
        db.data.financialAuditLogs.push(resData.auditLog);
      }
    }

    let localMem = db.data.memberships.find(m => 
      (resData.membershipId && m.id === resData.membershipId) || 
      (m.groupId === sessionData.groupId && m.slotNumber === sessionData.slotNumber)
    );

    if (!localMem) {
      localMem = {
        id: resData.membershipId || ('mem_' + Date.now()),
        groupId: sessionData.groupId,
        userId: sessionData.memberId,
        role: 'MEMBER',
        slotNumber: sessionData.slotNumber,
        paidShareCents: sessionData.baseShareCents,
        paidFeeCents: sessionData.platformFeeCents,
        memberTotalCents: sessionData.totalAmountCents,
        paymentMethod: paymentMethod,
        status: 'ACTIVE',
        autoRenew: true,
        paypalSubscriptionId: sessionData.paypalCaptureId || null,
        stripeSubscriptionId: sessionData.subscriptionId || null,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        joinedAt: new Date().toISOString()
      };
      db.data.memberships.push(localMem);
    } else {
      localMem.status = 'ACTIVE';
    }

    let localGroup = db.data.groups.find(g => g.id === sessionData.groupId);
    if (localGroup) {
      const activeCount = db.data.memberships.filter(m => m.groupId === sessionData.groupId && m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')).length;
      localGroup.occupiedMemberSlots = activeCount;
      if (activeCount >= localGroup.availableSlots) {
        localGroup.status = 'full';
      }
    }

    db.save();
  }
}

export const stripeCheckoutService = new StripeCheckoutService();
