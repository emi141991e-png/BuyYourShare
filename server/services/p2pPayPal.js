import { config } from '../config/env.js';

// Dedicated access plans. Store Orders v2 and legacy group billing never use this client.
export class P2pPayPal {
  constructor(env = process.env, transport = fetch) { this.env = env; this.transport = transport; }
  settings() {
    const e = this.env;
    const mode = e.P2P_PAYPAL_MODE || config.paypal.mode;
    if (!['sandbox', 'live'].includes(mode)) throw new Error('P2P_CONFIG_INVALID');
    return {
      mode, base: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
      clientId: e.P2P_PAYPAL_CLIENT_ID || (mode === config.paypal.mode ? config.paypal.clientId : ''),
      secret: e.P2P_PAYPAL_CLIENT_SECRET || (mode === config.paypal.mode ? config.paypal.clientSecret : ''),
      webhookId: e.P2P_PAYPAL_WEBHOOK_ID,
      plans: { MEMBER: e.P2P_PAYPAL_MEMBER_PLAN_ID, GROUP_LEADER: e.P2P_PAYPAL_MEMBER_PLAN_ID }
    };
  }
  async request(path, method = 'GET', body, requestId) {
    const s = this.settings();
    if (s.mode === 'live' && this.env.PAYPAL_SAFETY_LOCK !== 'false') throw new Error('P2P_SAFETY_LOCK');
    if (!s.clientId || !s.secret) throw new Error('P2P_NOT_CONFIGURED');
    if (!this.token || this.token.expires < Date.now()) {
      const r = await this.transport(`${s.base}/v1/oauth2/token`, {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Basic ${Buffer.from(`${s.clientId}:${s.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
      });
      if (!r.ok) throw new Error('P2P_PROVIDER_AUTH_FAILED');
      const t = await r.json();
      this.token = { value: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
    }
    const r = await this.transport(`${s.base}${path}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${this.token.value}`, 'Content-Type': 'application/json',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!r.ok) throw new Error(`P2P_PROVIDER_${r.status}`);
    return r.status === 204 ? {} : r.json();
  }
  async validatePlans() {
    const { plans } = this.settings();
    if (!plans.MEMBER || !plans.GROUP_LEADER) throw new Error('P2P_NOT_CONFIGURED');
    const details = [];
    for (const [role, id] of Object.entries(plans)) {
      const p = await this.request(`/v1/billing/plans/${encodeURIComponent(id)}`);
      const c = p.billing_cycles?.[0];
      if (p.status !== 'ACTIVE' || p.billing_cycles?.length !== 1 || c.tenure_type !== 'REGULAR' ||
          c.frequency?.interval_unit !== 'MONTH' || c.frequency.interval_count !== 1 || c.total_cycles !== 0 ||
          c.pricing_scheme?.fixed_price?.currency_code !== 'EUR' ||
          Number(c.pricing_scheme.fixed_price.value) !== 0.99 ||
          Number(p.payment_preferences?.setup_fee?.value || 0) !== 0 || p.quantity_supported ||
          Number(p.taxes?.percentage || 0) !== 0) throw new Error('P2P_PLAN_INVALID');
      details.push(p);
    }
    if (!details[0].product_id || details[0].product_id !== details[1].product_id) throw new Error('P2P_PLAN_PRODUCT_MISMATCH');
    return plans;
  }
  context() {
    const origin = new URL(this.env.P2P_PUBLIC_URL);
    if (origin.protocol !== 'https:' && !(this.settings().mode === 'sandbox' && ['localhost', '127.0.0.1'].includes(origin.hostname))) throw new Error('P2P_PUBLIC_URL_INVALID');
    return { brand_name: 'BuyYourShare P2P', user_action: 'SUBSCRIBE_NOW', shipping_preference: 'NO_SHIPPING',
      return_url: new URL('/#p2p-abbonamento', origin).href, cancel_url: new URL('/#p2p-abbonamento', origin).href };
  }
  create(record) {
    return this.request('/v1/billing/subscriptions', 'POST', {
      plan_id: record.planId, custom_id: record.customId, application_context: this.context()
    }, record.requestId);
  }
  get(id) { return this.request(`/v1/billing/subscriptions/${encodeURIComponent(id)}`); }
  revise(id, planId, requestId) {
    return this.request(`/v1/billing/subscriptions/${encodeURIComponent(id)}/revise`, 'POST', { plan_id: planId, application_context: this.context() }, requestId);
  }
  cancel(id, requestId) {
    return this.request(`/v1/billing/subscriptions/${encodeURIComponent(id)}/cancel`, 'POST', { reason: 'Disattivazione rinnovo accesso BuyYourShare P2P' }, requestId);
  }
  async verify(headers, event) {
    const webhookId = this.settings().webhookId;
    if (!webhookId) throw new Error('P2P_WEBHOOK_NOT_CONFIGURED');
    const fields = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
    if (fields.some(k => !headers[k])) return false;
    const r = await this.request('/v1/notifications/verify-webhook-signature', 'POST', {
      auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'], transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'], webhook_id: webhookId, webhook_event: event
    });
    return r.verification_status === 'SUCCESS';
  }
}
