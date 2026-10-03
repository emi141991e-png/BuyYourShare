import { randomUUID } from 'node:crypto';
import { P2pError } from './p2pSubscription.js';
import { ACCESS_PLANS, accessPlan, accessPeriodEnd, accessMoney } from '../../js/config/accessPlans.js';

const DAY = 86400000;
export class P2pGooglePay {
  constructor(subscriptions, bank, env = process.env) { this.s = subscriptions; this.bank = bank; this.repo = subscriptions.repo; this.env = env; }
  records() { return this.repo.data.p2pGooglePayments ||= []; }
  recheck(id) { return this.transaction(async () => {
    const p = this.records().find(r => r.id === id);
    if (!p?.orderId) throw new P2pError('NOT_FOUND', 404);
    // Read the existing order only: never authorize or capture another payment.
    const order = await this.s.provider.request(`/v2/checkout/orders/${p.orderId}`);
    const result = await this.settle(p, order);
    const states = (order.purchase_units || []).flatMap(u => (u.payments?.captures || []).map(c => [c.status, c.status_details?.reason].filter(Boolean).join(': ')));
    p.providerStatus = [order.status, ...states].join(' / ');
    p.checkedAt = new Date(this.s.now()).toISOString();
    await this.repo.save();
    return { ...result, providerStatus: p.providerStatus };
  }); }
  config(method = 'GOOGLE_PAY') {
    const p = this.s.provider.settings();
    // The new PayPal single-payment flow is deliberately sandbox-only for now.
    if (method === 'PAYPAL_ONETIME' && p.mode !== 'sandbox') return { enabled: false };
    const enabled = this.env[`P2P_${method}_ENABLED`] === 'true' && !!p.clientId && !!p.secret &&
      (p.mode === 'sandbox' || this.env[`P2P_${method}_LIVE_VERIFIED`] === 'true');
    return enabled ? { enabled, clientId: p.clientId, environment: p.mode === 'live' ? 'PRODUCTION' : 'TEST', amount: '0.99', currency: 'EUR', days: 30, plans: ACCESS_PLANS } : { enabled: false };
  }
  transaction(fn) { return this.s.exclusive(async () => {
    const fields = ['p2pGooglePayments', 'p2pSubscriptions', 'notifications'];
    const snapshot = Object.fromEntries(fields.map(k => [k, structuredClone(this.repo.data[k])]));
    try { return await fn(); } catch (e) { for (const k of fields) this.repo.data[k] = snapshot[k]; throw e; }
  }); }
  async choice(userId, method = 'GOOGLE_PAY') {
    this.s.ready();
    if (!this.config(method).enabled) throw new P2pError(`${method}_UNAVAILABLE`, 503);
    await this.bank.verifyChoice(userId);
    if ((this.repo.data.p2pBankPayments || []).some(p => p.userId === userId && p.status === 'reported')) throw new P2pError('BANK_PAYMENT_IN_PROGRESS');
  }
  create(userId, planCode = 'MONTHLY', method = 'GOOGLE_PAY') { return this.s.exclusive(async () => {
    const plan = accessPlan(planCode);
    await this.choice(userId, method);
    let p = this.records().find(r => r.userId === userId && r.status === 'pending');
    if (p?.orderId) {
      const existing = await this.s.provider.request(`/v2/checkout/orders/${p.orderId}`);
      const fields = ['p2pGooglePayments', 'p2pSubscriptions', 'notifications'];
      const snapshot = Object.fromEntries(fields.map(k => [k, structuredClone(this.repo.data[k])]));
      let outcome;
      try { outcome = await this.settle(p, existing); }
      catch (e) { for (const k of fields) this.repo.data[k] = snapshot[k]; throw e; }
      if (p.status === 'confirmed') return { alreadyPaid: true, subscription: outcome.subscription };
      if (p.status === 'failed') p = null;
      // A wallet button can leave an unapproved order behind. Reuse that same
      // provider order (never create a second chargeable order) for another wallet.
      if (p && (p.paymentMethod || 'GOOGLE_PAY') !== method &&
          (p.planCode || 'MONTHLY') === plan.code && existing.status === 'CREATED' &&
          !Object.keys(existing.payment_source || {}).length &&
          !existing.purchase_units.some(u => (u.payments?.captures || []).length || (u.payments?.authorizations || []).length)) {
        const previousMethod = p.paymentMethod || 'GOOGLE_PAY';
        const previousAllowed = p.allowedWallets;
        p.allowedWallets = [...new Set([...(p.allowedWallets || []), previousMethod, method])];
        p.paymentMethod = method;
        try { await this.repo.save(); }
        catch (e) { p.paymentMethod = previousMethod; p.allowedWallets = previousAllowed; throw e; }
      }
    }
    if (p && (p.paymentMethod || 'GOOGLE_PAY') !== method) throw new P2pError('WALLET_PAYMENT_IN_PROGRESS');
    if (p && (p.planCode || 'MONTHLY') !== plan.code) throw new P2pError('ACCESS_PLAN_PAYMENT_PENDING');
    if (!p) {
      p = { id: randomUUID(), userId, paymentMethod: method, planCode: plan.code, amountCents: plan.amountCents, status: 'pending', createdAt: new Date(this.s.now()).toISOString() };
      this.records().push(p);
      try { await this.repo.save(); } catch (e) { this.repo.data.p2pGooglePayments = this.records().filter(r => r.id !== p.id); throw e; }
    }
    // Retain ambiguous intents; never create a second order after an uncertain response.
    if (!p.orderId) {
      if (this.s.now() - Date.parse(p.createdAt) > 3 * 3600000) throw new P2pError('PAYPAL_PAYMENT_REVIEW_REQUIRED');
      const order = await this.s.provider.request('/v2/checkout/orders', 'POST', {
        intent: 'CAPTURE', purchase_units: [{ reference_id: p.id, custom_id: p.id,
          description: `Accesso BYS ${plan.period}, senza rinnovo automatico`, amount: { currency_code: 'EUR', value: ((p.amountCents ?? 99) / 100).toFixed(2) } }]
      }, p.id);
      if (!/^[A-Z0-9]+$/.test(order.id || '')) throw new P2pError('P2P_PROVIDER_RESPONSE_INVALID', 502);
      p.orderId = order.id; await this.repo.save();
    }
    return { orderId: p.orderId };
  }); }
  async settle(p, order) {
    let method = p.paymentMethod || 'GOOGLE_PAY';
    // A previously open browser may complete the original wallet on the SAME
    // order. Reconcile the verified source, without losing or duplicating access.
    const actualWallet = order.payment_source?.apple_pay ? 'APPLE_PAY' : order.payment_source?.google_pay ? 'GOOGLE_PAY' : order.payment_source?.paypal ? 'PAYPAL_ONETIME' : null;
    if (actualWallet && p.allowedWallets?.includes(actualWallet)) method = actualWallet;
    const amount = ((p.amountCents ?? 99) / 100).toFixed(2);
    const plan = accessPlan(p.planCode || 'MONTHLY');
    const units = order.purchase_units || [];
    const unit = units[0];
    if (order.id !== p.orderId || units.length !== 1 || unit.custom_id !== p.id ||
        unit.amount?.currency_code !== 'EUR' || unit.amount.value !== amount) throw new P2pError('P2P_PROVIDER_IDENTITY_MISMATCH', 502);
    const captures = unit.payments?.captures || [];
    if (p.status === 'pending' && order.status === 'COMPLETED' && captures.length === 1 &&
        captures[0].status === 'DECLINED' && captures[0].amount?.currency_code === 'EUR' && captures[0].amount.value === amount) {
      p.status = 'failed'; p.providerStatus = 'COMPLETED / DECLINED';
      p.failedAt = new Date(this.s.now()).toISOString();
      await this.repo.save();
      return { failed: true, reason: 'PAYMENT_DECLINED' };
    }
    if (p.status === 'refunded') return { subscription: this.s.view(p.userId) };
    if (p.status === 'confirmed') {
      const capture = captures.find(c => c.id === p.captureId);
      if (!capture || capture.amount?.currency_code !== 'EUR' || capture.amount.value !== amount) throw new P2pError('P2P_PROVIDER_IDENTITY_MISMATCH', 502);
      if (capture.status === 'REFUNDED') {
        const s = this.s.find(p.userId);
        if (s?.paymentMethod === method && s.currentPeriodEnd === p.periodEnd) {
          // Only revoke this grant. A later bank/provider period requires review,
          // never an indiscriminate subtraction from unrelated paid access.
          s.currentPeriodEnd = p.previousPeriodEnd || p.periodStart;
          s.currentPeriodStart = p.previousPeriodStart || null;
          s.accessPlanCode = p.previousPlanCode || 'MONTHLY'; s.accessAmountCents = p.previousAmountCents ?? 99;
          s.status = Date.parse(s.currentPeriodEnd) > this.s.now() ? 'active' : 'canceled';
          p.status = 'refunded'; p.refundedAt = new Date(this.s.now()).toISOString();
          this.bank.notify(p.userId, `google-refund:${p.id}`, 'Rimborso del pagamento confermato. Rimosso solo il periodo di quel pagamento; eventuali periodi precedenti restano validi.');
        } else p.reviewRequired = true;
      } else if (capture.status !== 'COMPLETED') p.reviewRequired = true;
      if (p.reviewRequired) for (const u of this.repo.data.users || []) if (u.role === 'admin') this.bank.notify(u.id, `google-review:${p.id}`, 'Pagamento wallet da riconciliare: verifica rimborso parziale, storno o periodi successivi prima di modificare l’accesso.');
      await this.repo.save(); return { subscription: this.s.view(p.userId), reviewRequired: !!p.reviewRequired };
    }
    if (order.status !== 'COMPLETED' || captures.length !== 1 || captures[0].status !== 'COMPLETED') return { pending: true };
    const capture = captures[0];
    const source = { GOOGLE_PAY: 'google_pay', APPLE_PAY: 'apple_pay', PAYPAL_ONETIME: 'paypal' }[method];
    if (!source || !capture.id || capture.amount?.currency_code !== 'EUR' || capture.amount.value !== amount || !order.payment_source?.[source]) throw new P2pError('P2P_PROVIDER_IDENTITY_MISMATCH', 502);
    if (this.records().some(r => r.id !== p.id && r.captureId === capture.id)) throw new P2pError('PAYPAL_PAYMENT_REVIEW_REQUIRED');
    const paidAt = Date.parse(capture.create_time);
    if (!Number.isFinite(paidAt) || paidAt > this.s.now() + 60000) throw new P2pError('P2P_PROVIDER_RESPONSE_INVALID', 502);
    if (p.status === 'confirmed') return { subscription: this.s.view(p.userId) };
    let s = this.s.find(p.userId);
    if (this.bank.blocked(p.userId)) {
      p.reviewRequired = true; await this.repo.save(); return { pending: true, reviewRequired: true };
    }
    const start = Math.max(paidAt, Date.parse(s?.currentPeriodEnd) || 0);
    p.previousPeriodEnd = s?.currentPeriodEnd || null;
    p.previousPeriodStart = s?.currentPeriodStart || null;
    p.previousPlanCode = s?.accessPlanCode || 'MONTHLY'; p.previousAmountCents = s?.accessAmountCents ?? 99;
    if (!s) { s = { userId: p.userId, role: this.s.roleFor(p.userId) }; (this.repo.data.p2pSubscriptions ||= []).push(s); }
    Object.assign(s, { status: 'active', paymentMethod: method, currentPeriodStart: new Date(start).toISOString(),
      currentPeriodEnd: accessPeriodEnd(start, plan.code), accessPlanCode: plan.code, accessAmountCents: p.amountCents ?? 99, lastPaymentAt: capture.create_time, nextBillingDate: null, cancelAtPeriodEnd: false, approvalUrl: null });
    Object.assign(p, { status: 'confirmed', paymentMethod: method, captureId: capture.id, paidAt: capture.create_time, periodStart: s.currentPeriodStart, periodEnd: s.currentPeriodEnd });
    this.bank.notify(p.userId, `google-paid:${p.id}`, `Pagamento ricevuto: accesso BYS ${plan.label}, per ${plan.period}. Il rinnovo richiederà un nuovo pagamento.`, { actionUrl: '#p2p-abbonamento' });
    const buyer = (this.repo.data.users || []).find(u => u.id === p.userId);
    for (const admin of this.repo.data.users || []) if (admin.role === 'admin') this.bank.notify(admin.id, `google-paid-admin:${p.id}:${admin.id}`, `${buyer?.fullName || 'Utente'} (${buyer?.email || p.userId}) ha acquistato accesso BYS ${plan.label}: ${accessMoney(p.amountCents ?? 99)}. Attivato automaticamente.`, { actionUrl: 'https://buyyourshare.it/admin/marketplace-payments' });
    await this.repo.save(); return { subscription: this.s.view(p.userId) };
  }
  capture(userId, id, method = 'GOOGLE_PAY') { return this.transaction(async () => {
    const p = this.records().find(r => r.userId === userId && r.orderId === id);
    if (!p || (p.paymentMethod || 'GOOGLE_PAY') !== method) throw new P2pError('NOT_FOUND', 404);
    if (p.status === 'refunded') return { subscription: this.s.view(userId) };
    let order = await this.s.provider.request(`/v2/checkout/orders/${encodeURIComponent(id)}`);
    if (order.status === 'APPROVED') {
      await this.choice(userId, method);
      // Stable provider key survives crashes and retries. GET recovers a lost capture response.
      await this.s.provider.request(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, 'POST', {}, `capture-${p.id}`);
      order = await this.s.provider.request(`/v2/checkout/orders/${encodeURIComponent(id)}`);
    }
    return this.settle(p, order);
  }); }
  // Called only after PayPal signature verification by the webhook route.
  webhook(event) { return this.transaction(async () => {
    if (!event.id || !event.event_type?.startsWith('PAYMENT.CAPTURE.')) return { ignored: true };
    const resource = event.resource || {};
    const orderId = resource.supplementary_data?.related_ids?.order_id;
    const p = this.records().find(r => (orderId && r.orderId === orderId) || (r.captureId && r.captureId === resource.id));
    if (!p) return { ignored: true };
    if (p.webhookIds?.includes(event.id)) return { duplicate: true };
    const order = await this.s.provider.request(`/v2/checkout/orders/${encodeURIComponent(p.orderId)}`);
    const result = await this.settle(p, order);
    // A reversal can precede the order API update. Require review instead of
    // guessing a refund amount or removing unrelated prepaid periods.
    if (event.event_type === 'PAYMENT.CAPTURE.REVERSED') {
      p.reviewRequired = true;
      for (const u of this.repo.data.users || []) if (u.role === 'admin') this.bank.notify(u.id, `google-review:${p.id}`, 'Storno del pagamento wallet segnalato da PayPal: verifica il pagamento e il periodo di accesso.');
    }
    // Pending provider state is deliberately retryable; background recovery also runs.
    if (result.pending) throw new P2pError('PAYMENT_RECONCILIATION_PENDING', 503);
    (p.webhookIds ||= []).push(event.id);
    await this.repo.save(); return { received: true };
  }); }
  async recover() {
    // Recover completed captures even when the browser closes or the feature is disabled.
    const pending = this.records().filter(p => ['pending', 'confirmed'].includes(p.status) && p.orderId && (!p.checkedAt || this.s.now() - Date.parse(p.checkedAt) > 5 * 60000)).sort((a,b) => (Date.parse(a.checkedAt) || 0) - (Date.parse(b.checkedAt) || 0)).slice(0, 10);
    for (const item of pending) {
      try { await this.transaction(async () => {
      const p = this.records().find(r => r.id === item.id);
      if (!p || !['pending', 'confirmed'].includes(p.status)) return;
      const order = await this.s.provider.request(`/v2/checkout/orders/${encodeURIComponent(p.orderId)}`);
      await this.settle(p, order); p.checkedAt = new Date(this.s.now()).toISOString(); await this.repo.save();
      }); } catch {
        // A single unavailable order must not prevent other customers from unlocking.
        await this.transaction(async () => {
          const p = this.records().find(r => r.id === item.id);
          if (p) { p.checkedAt = new Date(this.s.now()).toISOString(); await this.repo.save(); }
        });
      }
    }
  }
}
