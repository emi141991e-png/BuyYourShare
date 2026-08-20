/**
 * BuyYourShare - Real PayPal Billing Plans & Subscriptions Service
 * Gestione server-side dei cataloghi prodotti, piani ricorrenti (P-...) e sottoscrizioni (I-...)
 * conforme alle PayPal Subscriptions API v1/billing/plans & v1/billing/subscriptions.
 */

import { config } from '../config/env.js';

class PayPalBillingService {
  constructor() {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
    this.cachedPlans = new Map();
    this.cachedProductId = null;
  }

  /**
   * Genera o riutilizza il token OAuth2 Bearer server-side in modo sicuro.
   */
  async getAccessToken() {
    if (config.paypal.safetyLockActive) {
      throw new Error('PAYPAL_SAFETY_LOCK_ACTIVE: Chiamate alle API PayPal Live bloccate dal Safety Lock di sicurezza.');
    }

    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedToken;
    }

    const clientId = config.paypal.clientId;
    const clientSecret = config.paypal.clientSecret;

    if (!clientSecret || clientSecret.includes('placeholder')) {
      throw new Error('PAYPAL_CLIENT_SECRET non configurato nel file .env.');
    }

    const auth = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64');
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
      throw new Error(`Autenticazione PayPal fallita (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    this.cachedToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    return this.cachedToken;
  }

  /**
   * Crea o recupera il prodotto di catalogo per le condivisioni su PayPal.
   * POST /v1/catalogs/products
   */
  async createOrGetProduct(name = 'BuyYourShare Subscription Sharing') {
    if (this.cachedProductId) return this.cachedProductId;

    const token = await this.getAccessToken();
    const url = `${config.paypal.apiBaseUrl}/v1/catalogs/products`;

    const payload = {
      name: name,
      description: 'Piattaforma P2P di condivisione sicura quote abbonamenti',
      type: 'SERVICE',
      category: 'SOFTWARE'
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[PAYPAL PRODUCT CREATION ERROR]', data);
      throw new Error(data.message || 'Errore durante la creazione del prodotto PayPal.');
    }

    this.cachedProductId = data.id;
    console.log(`[PAYPAL BILLING] Catalogo Prodotto creato/ottenuto con ID: ${this.cachedProductId}`);
    return this.cachedProductId;
  }

  /**
   * Crea o recupera un Piano di Fatturazione Ricorrente Mensile reale (P-...)
   * POST /v1/billing/plans
   * @param {string} serviceName - Es. "Spotify Family"
   * @param {number} totalAmountCents - Es. 499 per 4,99 €
   */
  async createOrGetMonthlyPlan(serviceName = 'Abbonamento', totalAmountCents = 499) {
    const cacheKey = `plan_${totalAmountCents}_${serviceName.toLowerCase().replace(/\s+/g, '_')}`;
    if (this.cachedPlans.has(cacheKey)) {
      return this.cachedPlans.get(cacheKey);
    }

    const token = await this.getAccessToken();
    const productId = await this.createOrGetProduct(`BuyYourShare - ${serviceName}`);
    const amountEuros = (totalAmountCents / 100).toFixed(2);

    const payload = {
      product_id: productId,
      name: `BuyYourShare - ${serviceName} (${amountEuros} €/mese)`,
      description: `Quota mensile continua per la partecipazione al gruppo ${serviceName}`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: {
            interval_unit: 'MONTH',
            interval_count: 1
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0, // 0 = infinito (rinnovo continuo ogni mese fino a cancellazione)
          pricing_scheme: {
            fixed_price: {
              value: amountEuros,
              currency_code: 'EUR'
            }
          }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: {
          value: '0.00',
          currency_code: 'EUR'
        },
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3
      }
    };

    const url = `${config.paypal.apiBaseUrl}/v1/billing/plans`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[PAYPAL PLAN CREATION ERROR]', data);
      throw new Error(data.message || 'Errore durante la creazione del piano di abbonamento PayPal.');
    }

    const planId = data.id; // Es. P-5ML4271244454362WXNWU5NQ
    console.log(`[PAYPAL BILLING] Piano Ricorrente Reale creato: ID ${planId} (${amountEuros} €/mese)`);
    this.cachedPlans.set(cacheKey, planId);
    return planId;
  }

  /**
   * Recupera i dettagli ufficiali di una Subscription reale da PayPal
   * GET /v1/billing/subscriptions/{subscription_id}
   * @param {string} subscriptionId - Es. I-BW100G7P7Y9M
   */
  async getSubscriptionDetails(subscriptionId) {
    if (!subscriptionId || !subscriptionId.startsWith('I-')) {
      throw new Error(`ID Subscription non valido (${subscriptionId}). Deve iniziare con 'I-'.`);
    }

    const token = await this.getAccessToken();
    const url = `${config.paypal.apiBaseUrl}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`;

    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[PAYPAL GET SUBSCRIPTION ERROR]', resp.status, data);
      throw new Error(data.message || `Impossibile verificare la Subscription PayPal ${subscriptionId}`);
    }

    return data;
  }

  /**
   * Cancella/termina una Subscription attiva su PayPal
   * POST /v1/billing/subscriptions/{id}/cancel
   */
  async cancelSubscription(subscriptionId, reason = 'Gruppo eliminato dall\'amministratore') {
    if (!subscriptionId || !subscriptionId.startsWith('I-')) return null;
    if (config.paypal.safetyLockActive) return null;

    try {
      const token = await this.getAccessToken();
      const url = `${config.paypal.apiBaseUrl}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      console.log(`[PAYPAL BILLING] Subscription ${subscriptionId} cancellata su PayPal (Status: ${resp.status})`);
      return { success: resp.ok, status: resp.status };
    } catch (err) {
      console.warn(`[PAYPAL BILLING] Avviso cancellazione subscription ${subscriptionId}: ${err.message}`);
      return null;
    }
  }
}

export const paypalBillingService = new PayPalBillingService();
