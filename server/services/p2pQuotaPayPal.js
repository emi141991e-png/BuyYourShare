import { P2pPayPal } from './p2pPayPal.js';
import { P2pError } from './p2pSubscription.js';

// Separate partner credentials: never fall back to Store or access-subscription credentials.
export class P2pQuotaPayPal extends P2pPayPal {
  settings() {
    const e = this.env, mode = e.P2P_QUOTA_PAYPAL_MODE;
    if (!['sandbox', 'live'].includes(mode)) throw new P2pError('P2P_QUOTA_NOT_CONFIGURED', 503);
    if (mode === 'live' && e.P2P_QUOTA_LIVE_APPROVED !== 'true') throw new P2pError('P2P_QUOTA_LIVE_NOT_APPROVED', 503);
    return { mode, base: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
      clientId: e.P2P_QUOTA_PAYPAL_CLIENT_ID, secret: e.P2P_QUOTA_PAYPAL_CLIENT_SECRET,
      webhookId: e.P2P_QUOTA_PAYPAL_WEBHOOK_ID, partnerId: e.P2P_QUOTA_PAYPAL_PARTNER_ID,
      bnCode: e.P2P_QUOTA_PAYPAL_BN_CODE };
  }
  ready() {
    if (this.env.P2P_QUOTA_ENABLED !== 'true') throw new P2pError('P2P_QUOTA_NOT_ENABLED', 503);
    const s = this.settings();
    if (!s.clientId || !s.secret || !s.partnerId || !s.bnCode || !s.webhookId) throw new P2pError('P2P_QUOTA_NOT_CONFIGURED', 503);
    return s;
  }
  async partnerRequest(path, method = 'GET', body, requestId, merchantId) {
    const s = this.ready();
    const transport = this.transport;
    // A per-call client avoids shared mutable seller headers during concurrent verification.
    const client = new P2pPayPal(this.env, (url, options) => transport(url, {
      ...options, headers: { ...options.headers, 'PayPal-Partner-Attribution-Id': s.bnCode,
        ...(merchantId ? { 'PayPal-Auth-Assertion': `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(JSON.stringify({ iss: s.clientId, payer_id: merchantId })).toString('base64url')}.` } : {}) }
    }));
    client.settings = () => s;
    return client.request(path, method, body, requestId);
  }
  returnUrl() { return this.context().return_url.replace('#p2p-abbonamento', '#miei-abbonamenti'); }
  onboard(p) {
    return this.partnerRequest('/v2/customer/partner-referrals', 'POST', {
      tracking_id: p.trackingId, email: p.email,
      partner_config_override: { return_url: this.context().return_url.replace('#p2p-abbonamento', '#crea') },
      operations: [{ operation: 'API_INTEGRATION', api_integration_preference: { rest_api_integration: {
        integration_method: 'PAYPAL', integration_type: 'THIRD_PARTY', third_party_details: { features: ['PAYMENT', 'REFUND'] }
      } } }], products: ['EXPRESS_CHECKOUT'], legal_consents: [{ type: 'SHARE_DATA_CONSENT', granted: true }]
    }, p.requestId);
  }
  async seller(trackingId) {
    const path = `/v1/customer/partners/${encodeURIComponent(this.ready().partnerId)}/merchant-integrations`;
    const reference = await this.partnerRequest(`${path}?tracking_id=${encodeURIComponent(trackingId)}`);
    // Tracking lookup only returns identity and links, not readiness or delegated scopes.
    if (reference.tracking_id !== trackingId || !reference.merchant_id) throw new P2pError('PAYPAL_CONNECTION_INCOMPLETE');
    const details = await this.partnerRequest(`${path}/${encodeURIComponent(reference.merchant_id)}`);
    if (details.merchant_id !== reference.merchant_id || (details.tracking_id && details.tracking_id !== trackingId)) throw new P2pError('PAYPAL_CONNECTION_INCOMPLETE');
    return { ...details, tracking_id: trackingId };
  }
  createOrder(p) {
    return this.partnerRequest('/v2/checkout/orders', 'POST', {
      intent: 'CAPTURE', purchase_units: [{ reference_id: p.id, custom_id: p.id,
        description: 'Quota mensile gruppo BYS: pagamento diretto al capogruppo',
        amount: { currency_code: 'EUR', value: (p.amountCents / 100).toFixed(2) },
        payee: { merchant_id: p.merchantId }, payment_instruction: { disbursement_mode: 'INSTANT' } }],
      payment_source: { paypal: { experience_context: { brand_name: 'BuyYourShare P2P',
        shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW',
        return_url: this.returnUrl(), cancel_url: this.returnUrl() } } }
    }, p.createKey, p.merchantId);
  }
  order(p) { return this.partnerRequest(`/v2/checkout/orders/${encodeURIComponent(p.orderId)}`, 'GET', undefined, undefined, p.merchantId); }
  capture(p) { return this.partnerRequest(`/v2/checkout/orders/${encodeURIComponent(p.orderId)}/capture`, 'POST', {}, p.captureKey, p.merchantId); }
}

export function paypalLink(result, relation) {
  const href = result.links?.find(l => relation.includes(l.rel))?.href;
  if (!href) return null;
  const u = new URL(href);
  if (u.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(u.hostname)) throw new P2pError('P2P_PAYPAL_LINK_INVALID', 502);
  return u.href;
}
