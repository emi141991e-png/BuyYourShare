/**
 * BuyYourShare - Stripe Connect Service
 * Gestione Connected Accounts dei Capigruppo, Onboarding Express, Verifica Idoneità Payouts
 * ed esecuzione controllata dei trasferimenti di quota.
 */

import { db } from '../db/database.js';

class StripeConnectService {
  /**
   * Crea o recupera il Connected Account di un Capogruppo.
   * @param {Object} user - Utente Capogruppo
   */
  async getOrCreateConnectedAccount(user) {
    let conn = db.data.connectedAccounts.find(c => c.userId === user.id);
    if (!conn) {
      const stripeAccountId = 'acct_' + user.id.replace('usr-', '') + '_' + Math.floor(1000 + Math.random() * 9000);
      conn = {
        id: 'conn-' + Date.now(),
        userId: user.id,
        stripeAccountId: stripeAccountId,
        payoutsEnabled: user.id === 'usr-owner-1' || user.id === 'usr-owner-2', // Pre-abilitato per i demo owners iniziali
        chargesEnabled: user.id === 'usr-owner-1' || user.id === 'usr-owner-2',
        detailsSubmitted: user.id === 'usr-owner-1' || user.id === 'usr-owner-2',
        onboardingStatus: (user.id === 'usr-owner-1' || user.id === 'usr-owner-2') ? 'completed' : 'pending',
        bankLast4: '3456',
        country: 'IT',
        defaultCurrency: 'eur',
        onboardedAt: new Date().toISOString()
      };
      db.data.connectedAccounts.push(conn);
      db.save();
    }
    return conn;
  }

  /**
   * Verifica se il Capogruppo è abilitato e idoneo a ricevere trasferimenti/payouts.
   * Regola Zero-Trust: richiede conto attivo, charges & payouts abilitati e onboarding completato.
   */
  isPayoutReady(userId) {
    const conn = db.data.connectedAccounts.find(c => c.userId === userId);
    return !!(conn && conn.payoutsEnabled && conn.chargesEnabled && conn.onboardingStatus === 'completed');
  }

  /**
   * Completa il processo di Onboarding Stripe Connect per il Capogruppo.
   * Raccoglie i dati tramite Stripe e conserva nel DB solo gli identificativi tecnici.
   */
  async completeOnboarding(user, onboardingData = {}) {
    let conn = db.data.connectedAccounts.find(c => c.userId === user.id);
    if (!conn) {
      conn = await this.getOrCreateConnectedAccount(user);
    }

    const isSuccess = onboardingData.simulatedStatus !== 'failed';
    const ibanClean = (onboardingData.iban || '').trim().toUpperCase();
    const last4 = ibanClean.length >= 4 ? ibanClean.slice(-4) : '3456';

    conn.payoutsEnabled = isSuccess;
    conn.chargesEnabled = isSuccess;
    conn.detailsSubmitted = true;
    conn.onboardingStatus = isSuccess ? 'completed' : 'restricted';
    conn.businessType = onboardingData.accountType || 'individual';
    conn.legalName = onboardingData.legalName || user.fullName;
    conn.bankLast4 = last4;
    conn.onboardedAt = new Date().toISOString();

    db.save();
    return conn;
  }

  /**
   * Esegue l'istruzione di trasferimento / payout della quota reale al Capogruppo.
   * @param {Object} logData - Dati transazione contabile
   * @param {Object} ownerUser - Utente Capogruppo beneficiario
   */
  executePayoutTransfer(logData, ownerUser) {
    const isReady = this.isPayoutReady(ownerUser.id);
    const conn = db.data.connectedAccounts.find(c => c.userId === ownerUser.id);

    if (!isReady || !conn) {
      return {
        transferStatus: 'FAILED',
        payoutStatus: 'FAILED',
        payoutFailureReason: 'Connected Account Stripe non configurato o non abilitato ai Payouts',
        transferId: null,
        payoutId: null,
        payoutDate: null
      };
    }

    // Simulazione esecuzione autentica API Stripe Transfers + Payouts
    const transferId = 'tr_stripe_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const payoutId = 'po_stripe_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    return {
      transferStatus: 'TRANSFERRED',
      payoutStatus: 'PAID',
      payoutFailureReason: null,
      transferId: transferId,
      payoutId: payoutId,
      payoutDestination: conn.stripeAccountId,
      payoutDate: new Date().toISOString()
    };
  }

  /**
   * Gestisce l'evento webhook account.updated per aggiornare lo stato di ricezione pagamenti.
   */
  handleAccountUpdatedWebhook(accountData) {
    const conn = db.data.connectedAccounts.find(c => c.stripeAccountId === accountData.id);
    if (conn) {
      conn.payoutsEnabled = !!accountData.payouts_enabled;
      conn.chargesEnabled = !!accountData.charges_enabled;
      conn.detailsSubmitted = !!accountData.details_submitted;
      conn.onboardingStatus = (accountData.payouts_enabled && accountData.charges_enabled) ? 'completed' : 'restricted';
      db.save();
    }
  }
}

export const stripeConnectService = new StripeConnectService();
