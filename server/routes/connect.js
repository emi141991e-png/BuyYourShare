/**
 * BuyYourShare - Server Stripe Connect & Payout Routes
 */

import express from 'express';
import Stripe from 'stripe';
import { config } from '../config/env.js';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';

export const connectRouter = express.Router();

const stripe = config.stripe.secretKey && !config.stripe.secretKey.includes('placeholder')
  ? new Stripe(config.stripe.secretKey)
  : null;

// 1. Stato Payout & Onboarding Capogruppo
connectRouter.get('/status', requireAuth, async (req, res) => {
  try {
    const conn = await dataRepository.findConnectedAccountByUserId(req.user.id);
    const isReady = !!(conn && conn.payoutsEnabled && conn.chargesEnabled && conn.onboardingStatus === 'completed');

    return res.json({
      isPayoutReady: isReady,
      connectedAccount: conn ? {
        stripeAccountId: conn.stripeAccountId,
        payoutsEnabled: conn.payoutsEnabled,
        chargesEnabled: conn.chargesEnabled,
        onboardingStatus: conn.onboardingStatus,
        legalName: conn.legalName || req.user.fullName,
        businessType: conn.businessType || 'individual',
        bankLast4: conn.bankLast4 || null,
        iban: req.user.iban || null,
        bankName: req.user.bankName || null
      } : null
    });
  } catch (err) {
    console.error('[CONNECT STATUS ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 2. Creazione Connected Account & Generazione Link Onboarding Hosted Stripe
connectRouter.post('/onboarding-link', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    let conn = await dataRepository.findConnectedAccountByUserId(user.id);

    let stripeAccountId = conn ? conn.stripeAccountId : null;

    if (stripe) {
      if (!stripeAccountId) {
        // Creazione account Standard/Express su Stripe
        const account = await stripe.accounts.create({
          type: 'standard', // 0€ costo fisso mensile piattaforma
          country: 'IT',
          email: user.email
        });
        stripeAccountId = account.id;
      }

      // Creazione AccountLink per onboarding hosted ufficiale
      const host = req.get('host');
      const protocol = req.protocol;
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${protocol}://${host}/#crea?connect=refresh`,
        return_url: `${protocol}://${host}/#crea?connect=success`,
        type: 'account_onboarding'
      });

      await dataRepository.saveConnectedAccount({
        userId: user.id,
        stripeAccountId: stripeAccountId,
        payoutsEnabled: false,
        chargesEnabled: false,
        onboardingStatus: 'pending'
      });

      return res.json({
        success: true,
        url: accountLink.url,
        stripeAccountId: stripeAccountId
      });
    }

    // Modalità Test / Sandbox locale protetta
    if (!conn) {
      stripeAccountId = 'acct_' + user.id.replace('usr-', '') + '_' + Math.floor(1000 + Math.random() * 9000);
      conn = await dataRepository.saveConnectedAccount({
        userId: user.id,
        stripeAccountId: stripeAccountId,
        payoutsEnabled: false,
        chargesEnabled: false,
        onboardingStatus: 'pending'
      });
    }

    return res.json({
      success: true,
      url: null, // Modalità popup in-app
      stripeAccountId: conn.stripeAccountId
    });
  } catch (err) {
    console.error('[ONBOARDING LINK ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// 3. Salvataggio / Aggiornamento Dati Bancari & IBAN
connectRouter.post('/save-payout-settings', requireAuth, async (req, res) => {
  try {
    const { iban, bankName, legalName, taxId, accountType } = req.body || {};
    const cleanIban = (iban || '').trim().toUpperCase();

    if (!cleanIban || cleanIban.length < 15) {
      return res.status(400).json({ error: 'INVALID_IBAN', message: 'Inserisci un IBAN valido.' });
    }

    const last4 = cleanIban.slice(-4);

    await dataRepository.updateUser(req.user.id, {
      iban: cleanIban,
      bankName: (bankName || 'Conto Principale SEPA').trim()
    });

    const conn = await dataRepository.saveConnectedAccount({
      userId: req.user.id,
      stripeAccountId: req.user.stripeAccountId || ('acct_' + req.user.id.replace('usr-', '')),
      payoutsEnabled: true,
      chargesEnabled: true,
      detailsSubmitted: true,
      onboardingStatus: 'completed',
      businessType: accountType || 'individual',
      legalName: legalName || req.user.fullName,
      bankLast4: last4,
      onboardedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Dati bancari e ricezione quote attivati con successo.',
      connectedAccount: conn
    });
  } catch (err) {
    console.error('[SAVE PAYOUT SETTINGS ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
