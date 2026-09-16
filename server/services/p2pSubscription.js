import { randomUUID } from 'node:crypto';

export const PRICES = Object.freeze({ MEMBER: 99, GROUP_LEADER: 99 });
export class P2pError extends Error {
  constructor(code, status = 409) { super(code); this.status = status; }
}
export function accessAllowed(s, now = Date.now()) {
  return !!s && s.status === 'active' && Date.parse(s.currentPeriodEnd) > now;
}
export function publicSubscription(s, now = Date.now()) {
  const active = accessAllowed(s, now);
  return { role: s?.role || 'MEMBER', priceCents: PRICES[s?.role || 'MEMBER'], currency: 'EUR',
    status: s?.status === 'active' && !active ? (s.cancelAtPeriodEnd ? 'canceled' : 'past_due') : s?.status || 'inactive',
    accessAllowed: active, currentPeriodStart: s?.currentPeriodStart || null, currentPeriodEnd: s?.currentPeriodEnd || null,
    nextBillingDate: s?.cancelAtPeriodEnd ? null : s?.nextBillingDate || null,
    cancelAtPeriodEnd: !!s?.cancelAtPeriodEnd, pendingRole: s?.pendingRole || null,
    approvalUrl: s?.approvalUrl || null, providerStatus: s?.providerStatus || null };
}
function approval(result) {
  const link = result.links?.find(l => l.rel === 'approve')?.href;
  if (!link) return null;
  const url = new URL(link);
  if (url.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com'].includes(url.hostname)) throw new P2pError('P2P_APPROVAL_URL_INVALID');
  return url.href;
}
export class P2pSubscriptions {
  constructor(repo, provider, { now = () => Date.now(), enabled = () => process.env.P2P_BILLING_ENABLED === 'true' } = {}) {
    this.repo = repo; this.provider = provider; this.now = now; this.enabled = enabled; this.queue = Promise.resolve();
  }
  // JSON repository requires one process/replica. Persist request intent BEFORE provider writes.
  exclusive(fn) { const task = this.queue.catch(() => {}).then(fn); this.queue = task; return task; }
  records() { return this.repo.data.p2pSubscriptions || []; }
  find(userId) { return this.records().find(s => s.userId === userId); }
  async save() { await this.repo.save(); }
  ready() {
    if (!this.enabled()) throw new P2pError('P2P_BILLING_NOT_ENABLED', 503);
    const legacy = (this.repo.data.memberships || []).some(m =>
      (m.paypalSubscriptionId || m.stripeSubscriptionId) && !m.legacyBillingEndedAt);
    if (legacy) throw new P2pError('P2P_LEGACY_BILLING_REQUIRES_RECONCILIATION', 503);
  }
  roleFor(userId) {
    return this.find(userId)?.role === 'GROUP_LEADER' || (this.repo.data.groups || []).some(g => g.ownerId === userId)
      ? 'GROUP_LEADER' : 'MEMBER';
  }
  view(userId) {
    return publicSubscription(this.find(userId) || { role: this.roleFor(userId), status: 'inactive' }, this.now());
  }
  async reconcile(s) {
    if (!s?.providerSubscriptionId) return s;
    const remote = await this.provider.get(s.providerSubscriptionId);
    if (remote.id !== s.providerSubscriptionId || remote.custom_id !== s.customId ||
        ![s.planId, s.pendingPlanId].filter(Boolean).includes(remote.plan_id)) throw new P2pError('P2P_PROVIDER_IDENTITY_MISMATCH', 502);
    if (s.pendingPlanId && remote.plan_id === s.pendingPlanId && remote.status === 'ACTIVE') {
      s.role = 'GROUP_LEADER'; s.planId = s.pendingPlanId;
      s.pendingRole = null; s.pendingPlanId = null; s.revisionRequestId = null; s.approvalUrl = null;
    }
    s.providerStatus = remote.status;
    s.providerUpdatedAt = remote.status_update_time || null;
    const billing = remote.billing_info || {};
    const paid = billing.last_payment;
    const paidTime = Date.parse(paid?.time);
    const nextTime = Date.parse(billing.next_billing_time);
    const unsettled = Number(billing.outstanding_balance?.value || 0) > 0 || Number(billing.failed_payments_count || 0) > 0;
    // Never grant a free period from ACTIVE alone, nor extend a period after a failed collection.
    if (!unsettled && paid?.amount?.currency_code === 'EUR' && Number(paid.amount.value) > 0 &&
        Number.isFinite(paidTime) && paidTime <= this.now() + 60000 && Number.isFinite(nextTime) && nextTime > paidTime && nextTime - paidTime <= 32 * 86400000 &&
        (!s.lastPaymentAt || paidTime >= Date.parse(s.lastPaymentAt))) {
      s.lastPaymentAt = paid.time; s.currentPeriodStart = paid.time; s.currentPeriodEnd = billing.next_billing_time;
    }
    s.nextBillingDate = billing.next_billing_time || null;
    if (remote.status === 'CANCELLED') {
      s.cancelAtPeriodEnd = true; s.canceledAt ||= new Date(this.now()).toISOString(); s.nextBillingDate = null;
      s.status = Date.parse(s.currentPeriodEnd) > this.now() ? 'active' : 'canceled';
      s.pendingRole = null; s.pendingPlanId = null; s.approvalUrl = null;
    } else if (remote.status === 'SUSPENDED') s.status = unsettled ? 'past_due' : 'suspended';
    else if (remote.status === 'EXPIRED') s.status = 'canceled';
    else if (unsettled) s.status = 'past_due';
    else if (remote.status === 'ACTIVE' && Date.parse(s.currentPeriodEnd) > this.now()) s.status = 'active';
    else s.status = s.lastPaymentAt ? 'past_due' : 'pending';
    if (s.lastFailureAt && Date.parse(s.lastFailureAt) > (Date.parse(s.lastPaymentAt) || 0) && s.status === 'active' && !s.cancelAtPeriodEnd) s.status = 'past_due';
    if (s.suspensionEventAt && !(Date.parse(s.providerUpdatedAt) > Date.parse(s.suspensionEventAt)) && s.status === 'active' && !s.cancelAtPeriodEnd) s.status = 'suspended';
    if (remote.status === 'ACTIVE' && !s.pendingRole) s.approvalUrl = null;
    s.updatedAt = new Date(this.now()).toISOString();
    return s;
  }
  refresh(userId) { return this.exclusive(async () => {
    await this.reconcile(this.find(userId)); await this.save(); return this.view(userId);
  }); }
  start(userId, requestedRole) { return this.exclusive(async () => {
    this.ready();
    if (!Object.hasOwn(PRICES, requestedRole)) throw new P2pError('P2P_ROLE_INVALID', 400);
    let s = this.find(userId);
    if (s?.migrationCredit && accessAllowed(s, this.now())) return this.view(userId);
    if (s?.providerSubscriptionId) {
      await this.reconcile(s); await this.save();
      if (!['CANCELLED', 'EXPIRED'].includes(s.providerStatus) || accessAllowed(s, this.now())) return this.view(userId);
    }
    const plans = await this.provider.validatePlans();
    if (!s || s.providerSubscriptionId || s.migrationCredit) {
      const previous = s;
      const role = this.roleFor(userId) === 'GROUP_LEADER' ? 'GROUP_LEADER' : requestedRole;
      s = { userId, role, status: 'pending', planId: plans[role], providerSubscriptionId: null,
        customId: randomUUID(), requestId: randomUUID(), requestedAt: new Date(this.now()).toISOString(),
        cancelAtPeriodEnd: false, retiredIds: [...(previous?.retiredIds || []), ...(previous?.providerSubscriptionId ? [previous.providerSubscriptionId] : [])] };
      this.repo.data.p2pSubscriptions = [...this.records().filter(r => r.userId !== userId), s];
      await this.save();
    }
    // PayPal idempotency retention is finite. An ambiguous old create MUST be reconciled manually, never retried with a new key.
    if (this.now() - Date.parse(s.requestedAt) > 3 * 3600000) throw new P2pError('P2P_CREATE_REQUIRES_RECONCILIATION');
    const result = await this.provider.create(s);
    if (!result.id?.startsWith('I-')) throw new P2pError('P2P_PROVIDER_RESPONSE_INVALID', 502);
    s.providerSubscriptionId = result.id; s.providerStatus = result.status || 'APPROVAL_PENDING'; s.approvalUrl = approval(result);
    await this.save(); return this.view(userId);
  }); }
  upgrade(userId) { return this.exclusive(async () => {
    this.ready(); const s = this.find(userId);
    await this.reconcile(s); await this.save();
    if (!accessAllowed(s, this.now()) || s.cancelAtPeriodEnd) throw new P2pError('P2P_ACTIVE_SUBSCRIPTION_REQUIRED', 402);
    if (s.role === 'GROUP_LEADER') return this.view(userId);
    // Role is independent of billing: retain the existing subscription and paid period.
    s.role = 'GROUP_LEADER';
    s.pendingRole = null; s.pendingPlanId = null; s.revisionRequestId = null; s.approvalUrl = null;
    await this.save();
    return this.view(userId);
  }); }
  cancel(userId) { return this.exclusive(async () => {
    const s = this.find(userId);
    if (!s?.providerSubscriptionId) throw new P2pError('P2P_SUBSCRIPTION_NOT_FOUND', 404);
    await this.reconcile(s);
    if (!['CANCELLED', 'EXPIRED'].includes(s.providerStatus)) {
      s.cancelRequestId ||= randomUUID(); await this.save();
      await this.provider.cancel(s.providerSubscriptionId, s.cancelRequestId);
      // Provider stops renewals immediately; paid access expires locally at period end. No cron required.
      s.cancelAtPeriodEnd = true; s.providerStatus = 'CANCELLED'; s.canceledAt = new Date(this.now()).toISOString();
      s.status = Date.parse(s.currentPeriodEnd) > this.now() ? 'active' : 'canceled';
      s.nextBillingDate = null; s.pendingRole = null; s.pendingPlanId = null; s.approvalUrl = null;
    }
    await this.save(); return this.view(userId);
  }); }
  webhook(event) { return this.exclusive(async () => {
    if (!event.id || typeof event.id !== 'string' || !event.event_type) throw new P2pError('P2P_EVENT_INVALID', 400);
    const events = this.repo.data.p2pWebhookEvents || [];
    if (events.some(e => e.id === event.id)) return { duplicate: true };
    const supported = ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.UPDATED', 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
      'BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED', 'PAYMENT.SALE.COMPLETED'];
    if (!supported.includes(event.event_type)) return { ignored: true };
    const id = event.resource?.billing_agreement_id || event.resource?.id;
    let s = this.records().find(r => r.providerSubscriptionId === id);
    // Recovery if PayPal created the subscription but the response/local save was lost.
    if (!s && event.resource?.custom_id) {
      s = this.records().find(r => !r.providerSubscriptionId && r.customId === event.resource.custom_id);
      if (s && /^I-[A-Z0-9]+$/i.test(id || '')) s.providerSubscriptionId = id;
    }
    if (!s) {
      if (this.records().some(r => r.retiredIds?.includes(id))) return { ignored: true };
      throw new P2pError('P2P_UNKNOWN_SUBSCRIPTION_REQUIRES_RECONCILIATION', 503);
    }
    await this.reconcile(s); // Read current provider truth: delivery order cannot resurrect stale states.
    const eventTime = Date.parse(event.create_time);
    const laterPayment = Number.isFinite(eventTime) && Date.parse(s.lastPaymentAt) >= eventTime;
    if (event.event_type === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' && !laterPayment) {
      // Persist failure evidence even if GET has not caught up. A newer successful
      // payment is required before a refresh can restore access.
      s.lastFailureAt = new Date(Math.max(Date.parse(s.lastFailureAt) || 0, eventTime || this.now())).toISOString();
      if (!s.cancelAtPeriodEnd && s.status !== 'canceled') s.status = 'past_due';
    }
    if (event.event_type === 'BILLING.SUBSCRIPTION.SUSPENDED' &&
        (!Number.isFinite(eventTime) || !(Date.parse(s.providerUpdatedAt) > eventTime))) {
      s.suspensionEventAt = new Date(eventTime || this.now()).toISOString();
      if (!s.cancelAtPeriodEnd && s.status !== 'canceled') s.status = 'suspended';
    }
    if ((event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED' && s.providerStatus !== 'CANCELLED') ||
        (event.event_type === 'PAYMENT.SALE.COMPLETED' && s.status === 'pending')) {
      throw new P2pError('P2P_PROVIDER_EVENT_NOT_SETTLED', 503);
    }
    this.repo.data.p2pWebhookEvents = [...events, { id: event.id, type: event.event_type, subscriptionId: id, processedAt: new Date(this.now()).toISOString() }];
    try { await this.save(); } catch (error) { this.repo.data.p2pWebhookEvents = events; throw error; }
    return { processed: true };
  }); }
}
