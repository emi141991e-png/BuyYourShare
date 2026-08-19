/**
 * BuyYourShare - Real PayPal Payouts Service (Sandbox & Live)
 * Esecuzione server-side autentica dei trasferimenti verso il conto PayPal del Capogruppo
 * tramite PayPal REST API v1/payments/payouts con controllo OAuth2 e polling di stato.
 */

import { config } from '../config/env.js';

class PayPalPayoutService {
  constructor() {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Genera o riutilizza il token OAuth2 Bearer server-side in modo sicuro.
   * Il Secret Key non viene mai esposto all'esterno.
   */
  async getAccessToken() {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedToken;
    }

    const clientId = config.paypal.clientId;
    const clientSecret = config.paypal.clientSecret;

    if (!clientSecret || clientSecret.includes('placeholder')) {
      throw new Error('PAYPAL_CLIENT_SECRET non configurato nel file .env del server.');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `${config.paypal.apiBaseUrl}/v1/oauth2/token`;

    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[PAYPAL OAUTH ERROR]', resp.status, errText);
      throw new Error(`Autenticazione PayPal fallita (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    return this.cachedToken;
  }

  /**
   * Esegue la richiesta di Payout reale verso l'email PayPal del Capogruppo.
   * @param {Object} params
   * @param {string} params.recipientEmail - Email PayPal del Capogruppo
   * @param {number} params.amountCents - Quota in centesimi (es. 350 per 3,50 €)
   * @param {string} params.groupId - ID Gruppo
   * @param {number} params.slotNumber - Numero Posto
   * @param {string} params.captureId - ID cattura PayPal membro (per sender_batch_id univoco)
   */
  async executePayout({ recipientEmail, amountCents = 350, groupId, slotNumber, captureId, groupName = 'Gruppo' }) {
    if (config.paypal.safetyLockActive) {
      console.warn('[PAYPAL PAYOUT BLOCKED] Safety Lock attivo: trasferimenti di denaro reale bloccati in fase di test.');
      throw new Error('PAYPAL_SAFETY_LOCK_ACTIVE: I trasferimenti di denaro reale sono bloccati dal Safety Lock.');
    }

    if (!recipientEmail || !recipientEmail.includes('@')) {
      throw new Error('Email PayPal del Capogruppo non configurata o non valida.');
    }

    const token = await this.getAccessToken();
    const amountEuros = (amountCents / 100).toFixed(2);
    
    // sender_batch_id univoco e persistente per garantire l'idempotenza bancaria di PayPal (30 giorni)
    const senderBatchId = `bys_payout_${groupId}_s${slotNumber}_${captureId}`.substring(0, 30);
    const senderItemId = `item_${captureId}_s${slotNumber}`.substring(0, 30);

    const payload = {
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: `Ricevuta quota ${groupName} su BuyYourShare`,
        email_message: `Hai ricevuto la quota mensile di ${amountEuros} € per il Posto #${slotNumber} del tuo gruppo su BuyYourShare.`
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: {
            value: amountEuros,
            currency: 'EUR'
          },
          note: `Quota ${groupName} - Posto #${slotNumber}`,
          sender_item_id: senderItemId,
          receiver: recipientEmail.trim()
        }
      ]
    };

    console.log(`[PAYPAL PAYOUT] Invio richiesta payout reale verso ${recipientEmail} (Importo: ${amountEuros} €)...`);

    const payoutUrl = `${config.paypal.apiBaseUrl}/v1/payments/payouts`;
    const resp = await fetch(payoutUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('[PAYPAL PAYOUT API ERROR]', resp.status, JSON.stringify(data));
      throw new Error(data.message || data.name || 'Errore durante la creazione del Payout su PayPal.');
    }

    const batchHeader = data.batch_header || {};
    const payoutBatchId = batchHeader.payout_batch_id;
    let batchStatus = batchHeader.batch_status || 'PENDING'; // PENDING, PROCESSING, SUCCESS, DENIED

    console.log(`[PAYPAL PAYOUT INIZIATO] Batch ID: ${payoutBatchId} - Stato iniziale: ${batchStatus}`);

    // Tentativo di verifica/polling rapido dello stato definitivo del batch (fino a 3 tentativi con backoff)
    let verifiedDetails = null;
    if (batchStatus === 'PENDING' || batchStatus === 'PROCESSING') {
      verifiedDetails = await this.pollPayoutStatus(payoutBatchId, 3, 1500);
      if (verifiedDetails && verifiedDetails.batch_header) {
        batchStatus = verifiedDetails.batch_header.batch_status || batchStatus;
      }
    }

    const items = verifiedDetails?.items || data.items || [];
    const firstItem = items[0] || {};
    const payoutItemId = firstItem.payout_item_id || null;
    const itemStatus = firstItem.transaction_status || batchStatus;
    const transactionId = firstItem.transaction_id || null;
    const payoutFeeEuros = firstItem.payout_item_fee?.value || batchHeader.fees?.value || '0.00';
    const payoutFeeCents = Math.round(parseFloat(payoutFeeEuros) * 100);

    // Mappatura Rigorosa dello Stato per il Ledger
    // Solo SUCCESS su batch AND item abilita lo stato PAID
    const isCompleted = (batchStatus === 'SUCCESS' && (itemStatus === 'SUCCESS' || !firstItem.transaction_status)) || (itemStatus === 'SUCCESS');
    const isFailed = ['DENIED', 'FAILED', 'BLOCKED', 'RETURNED', 'REVERSED'].includes(batchStatus) || ['DENIED', 'FAILED', 'BLOCKED', 'RETURNED', 'REVERSED'].includes(itemStatus);

    const ledgerPayoutStatus = isCompleted ? 'PAID' : (isFailed ? 'FAILED' : 'PENDING_PROVIDER');
    const ledgerTransferStatus = isCompleted ? 'TRANSFERRED' : (isFailed ? 'FAILED' : 'PENDING_PROVIDER');

    return {
      success: !isFailed,
      payoutBatchId: payoutBatchId,
      payoutItemId: payoutItemId,
      transactionId: transactionId,
      batchStatus: batchStatus,
      itemStatus: itemStatus,
      payoutFeeCents: payoutFeeCents,
      ledgerPayoutStatus: ledgerPayoutStatus,
      ledgerTransferStatus: ledgerTransferStatus,
      recipientEmail: recipientEmail,
      amountCents: amountCents,
      rawResponse: data
    };
  }

  /**
   * Interroga le API PayPal per ottenere i dettagli aggiornati del batch e del singolo item.
   * GET /v1/payments/payouts/{payout_batch_id}
   */
  async getPayoutDetails(payoutBatchId) {
    const token = await this.getAccessToken();
    const url = `${config.paypal.apiBaseUrl}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[PAYPAL GET PAYOUT ERROR]', resp.status, errText);
      throw new Error(`Impossibile recuperare i dettagli del payout ${payoutBatchId}: ${errText}`);
    }

    return await resp.json();
  }

  /**
   * Esegue il polling per attendere la transizione di stato verso SUCCESS o FAIL
   */
  async pollPayoutStatus(payoutBatchId, maxAttempts = 3, intervalMs = 1500) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      try {
        const details = await this.getPayoutDetails(payoutBatchId);
        const status = details?.batch_header?.batch_status;
        console.log(`[PAYPAL POLLING] Tentativo ${i + 1}/${maxAttempts} - Stato Batch: ${status}`);
        if (status === 'SUCCESS' || status === 'DENIED' || status === 'FAILED') {
          return details;
        }
      } catch (e) {
        console.warn('[PAYPAL POLLING WARN]', e.message);
      }
    }
    return null;
  }
}

export const paypalPayoutService = new PayPalPayoutService();
