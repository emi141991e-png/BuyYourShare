import { randomUUID } from 'node:crypto';
import { P2pError, accessAllowed } from './p2pSubscription.js';
import { paypalLink } from './p2pQuotaPayPal.js';
import { allocateMoneySplit } from '../engine/MoneyEngine.js';
import { addOneMonth } from '../engine/DateEngine.js';

const openGroup = g => g && ['PUBLISHED', 'FULL', 'active', 'available'].includes(g.status);
const blocking = p => !['canceled', 'failed', 'refunded', 'reversed'].includes(p.status);
const cents = a => a?.currency_code === 'EUR' && /^\d+\.\d{2}$/.test(a.value) ? Math.round(Number(a.value) * 100) : NaN;

export class P2pQuota {
  constructor(subscriptions, provider, now = () => Date.now()) {
    this.subscriptions = subscriptions; this.repo = subscriptions.repo; this.provider = provider; this.now = now;
  }
  exclusive(fn) { return this.subscriptions.exclusive(fn); }
  payees() { return this.repo.data.p2pPayees ||= []; }
  payments() { return this.repo.data.p2pQuotaPayments ||= []; }
  payee(userId) { return this.payees().find(p => p.userId === userId); }
  view(userId) {
    const p = this.payee(userId);
    let available = true, reason;
    try { this.provider.ready(); } catch (e) { available = false; reason = e.message; }
    return { available, reason, status: p?.status || 'not_connected', email: p?.email || '', verifiedAt: p?.verifiedAt || null };
  }
  leader(userId) {
    const s = this.subscriptions.find(userId);
    if (!accessAllowed(s, this.now()) || s.role !== 'GROUP_LEADER') throw new P2pError('P2P_LEADER_PLAN_REQUIRED');
  }
  onboard(userId, email, consent) { return this.exclusive(async () => {
    this.provider.ready(); this.leader(userId);
    if (consent !== true) throw new P2pError('PAYPAL_CONSENT_REQUIRED', 400);
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new P2pError('PAYPAL_EMAIL_REQUIRED', 400);
    let p = this.payee(userId);
    // No silent replacement of a recipient bound to existing groups/orders.
    if (p && p.email !== email.trim().toLowerCase()) throw new P2pError('PAYPAL_ACCOUNT_CHANGE_REQUIRES_REVIEW');
    if (!p) {
      p = { userId, email: email.trim().toLowerCase(), trackingId: randomUUID(), requestId: randomUUID(), status: 'pending', consentAt: new Date(this.now()).toISOString() };
      this.payees().push(p); await this.repo.save();
    }
    const result = await this.provider.onboard(p);
    const approvalUrl = paypalLink(result, ['action_url']);
    if (!approvalUrl) throw new P2pError('PAYPAL_ONBOARDING_UNAVAILABLE', 503);
    return { ...this.view(userId), approvalUrl };
  }); }
  async verifyPayee(userId) {
    this.provider.ready();
    const p = this.payee(userId);
    if (!p) throw new P2pError('PAYPAL_CONNECTION_REQUIRED');
    if (p.status === 'revoked') throw new P2pError('PAYPAL_CONNECTION_REVOKED');
    const r = await this.provider.seller(p.trackingId), s = this.provider.settings();
    const delegated = r.oauth_integrations?.some(i => i.oauth_third_party?.some(t =>
      t.partner_client_id === s.clientId && t.scopes?.includes('https://uri.paypal.com/services/payments/payment/authcapture')));
    const verified = r.tracking_id === p.trackingId && !!r.merchant_id && r.merchant_id !== s.partnerId &&
      (!p.merchantId || p.merchantId === r.merchant_id) && r.payments_receivable === true && r.primary_email_confirmed === true && delegated;
    p.status = verified ? 'verified' : 'pending'; p.verifiedAt = new Date(this.now()).toISOString();
    if (verified) p.merchantId = r.merchant_id;
    await this.repo.save();
    if (!verified) throw new P2pError('PAYPAL_CONNECTION_INCOMPLETE');
    return p;
  }
  refreshPayee(userId) { return this.exclusive(async () => { await this.verifyPayee(userId); return this.view(userId); }); }
  assertSlot(g, slot, exceptId) {
    if (!openGroup(g) || !Number.isInteger(slot) || slot <= g.ownerSlots || slot > g.totalSlots) throw new P2pError('SLOT_UNAVAILABLE');
    if ((this.repo.data.memberships || []).some(m => m.groupId === g.id && m.slotNumber === slot &&
      ['ACTIVE', 'CANCELLATION_SCHEDULED'].includes(m.status) && Date.parse(m.currentPeriodEnd) > this.now())) throw new P2pError('SLOT_UNAVAILABLE');
    // Provider-bound intents never expire locally: timeout or browser cancellation is not proof of non-payment.
    if (this.payments().some(p => p.id !== exceptId && p.groupId === g.id && p.slotNumber === slot && blocking(p) &&
      (p.status !== 'completed' || Date.parse(p.periodEnd) > this.now()))) throw new P2pError('SLOT_RESERVED');
  }
  publicPayment(p) { return { id: p.id, requestId: p.requestId, groupId: p.groupId, amountCents: p.amountCents,
    status: p.status, approvalUrl: p.approvalUrl || null, captureId: p.captureId || null, confirmedAt: p.confirmedAt || null }; }
  request(userId, groupId, slot) { return this.exclusive(async () => {
    this.provider.ready();
    const g = this.repo.data.groups.find(g => g.id === groupId);
    if (!g || g.ownerId === userId) throw new P2pError('GROUP_UNAVAILABLE');
    this.assertSlot(g, Number(slot));
    await this.verifyPayee(g.ownerId);
    const requests = this.repo.data.p2pJoinRequests ||= [];
    const existing = requests.find(r => r.groupId === groupId && r.userId === userId && r.status === 'pending');
    if (existing) return existing;
    const r = { id: randomUUID(), userId, groupId, slotNumber: Number(slot), status: 'pending', createdAt: new Date(this.now()).toISOString(),
      memberName: this.repo.data.users.find(u => u.id === userId)?.fullName || 'Membro' };
    requests.push(r); await this.repo.save(); return r;
  }); }
  order(userId, requestId) { return this.exclusive(async () => {
    this.provider.ready();
    const r = (this.repo.data.p2pJoinRequests || []).find(r => r.id === requestId && r.userId === userId);
    if (!r || r.status !== 'pending') throw new P2pError('REQUEST_UNAVAILABLE');
    let p = this.payments().find(p => p.requestId === r.id);
    if (p?.orderId) return this.publicPayment(p);
    const g = this.repo.data.groups.find(g => g.id === r.groupId);
    this.assertSlot(g, r.slotNumber, p?.id);
    const seller = await this.verifyPayee(g.ownerId);
    if (!p) {
      const amountCents = allocateMoneySplit(g.realSubscriptionCostCents, g.totalSlots)[r.slotNumber - 1];
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new P2pError('INVALID_AMOUNT', 400);
      p = { id: randomUUID(), requestId: r.id, userId, ownerId: g.ownerId, groupId: g.id, slotNumber: r.slotNumber,
        merchantId: seller.merchantId, amountCents, createKey: randomUUID(), captureKey: randomUUID(), status: 'creating', createdAt: new Date(this.now()).toISOString() };
      this.payments().push(p); await this.repo.save();
    }
    // Orders idempotency default retention is six hours. Never create a fresh order after an ambiguous timeout.
    if (this.now() - Date.parse(p.createdAt) > 5 * 3600000) throw new P2pError('PAYPAL_PAYMENT_REVIEW_REQUIRED');
    await this.repo.save(); // Also retry persistence after an earlier local write failure.
    const remote = await this.provider.createOrder(p);
    if (!remote.id) throw new P2pError('PAYPAL_ORDER_INVALID', 502);
    p.orderId = remote.id; p.approvalUrl = paypalLink(remote, ['payer-action', 'approve']); p.status = 'awaiting_approval';
    await this.repo.save(); return this.publicPayment(p);
  }); }
  validateOrder(p, order) {
    const u = order.purchase_units?.[0];
    if (order.id !== p.orderId || order.intent !== 'CAPTURE' || order.purchase_units?.length !== 1 ||
      u.custom_id !== p.id || u.payee?.merchant_id !== p.merchantId || cents(u.amount) !== p.amountCents ||
      (u.payment_instruction?.platform_fees?.length || 0) > 0) throw new P2pError('PAYPAL_PAYMENT_MISMATCH', 502);
    return u;
  }
  async reconcile(p, capture = false) {
    let order = await this.provider.order(p);
    this.validateOrder(p, order);
    if (capture && order.status === 'APPROVED' && !['refunded', 'reversed', 'failed'].includes(p.status)) {
      const g = this.repo.data.groups.find(g => g.id === p.groupId);
      this.assertSlot(g, p.slotNumber, p.id);
      await this.verifyPayee(p.ownerId);
      if (p.captureAttemptAt && this.now() - Date.parse(p.captureAttemptAt) > 5 * 3600000) throw new P2pError('PAYPAL_PAYMENT_REVIEW_REQUIRED');
      p.captureAttemptAt ||= new Date(this.now()).toISOString(); p.status = 'capturing'; await this.repo.save();
      await this.provider.capture(p);
      order = await this.provider.order(p);
    }
    const u = this.validateOrder(p, order), captures = u.payments?.captures || [];
    if (captures.length > 1) throw new P2pError('PAYPAL_PAYMENT_MISMATCH', 502);
    const c = captures[0];
    if (c) {
      if (!c.id || cents(c.amount) !== p.amountCents || (p.captureId && p.captureId !== c.id) ||
        this.payments().some(other => other.id !== p.id && other.captureId === c.id)) throw new P2pError('PAYPAL_PAYMENT_MISMATCH', 502);
      p.captureId = c.id;
      if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(c.status)) this.revoke(p, 'refunded');
      else if (['DECLINED', 'FAILED'].includes(c.status)) this.revoke(p, 'failed');
      else if (c.status === 'COMPLETED' && order.status === 'COMPLETED' && !['refunded', 'reversed', 'failed'].includes(p.status)) {
        if (c.seller_receivable_breakdown?.platform_fees?.length) throw new P2pError('PAYPAL_PAYMENT_MISMATCH', 502);
        const paidAt = Date.parse(c.create_time);
        if (!Number.isFinite(paidAt) || paidAt > this.now() + 60000) throw new P2pError('PAYPAL_PAYMENT_MISMATCH', 502);
        p.status = 'completed'; p.confirmedAt = c.create_time; p.approvalUrl = null;
        p.netAmount = c.seller_receivable_breakdown?.net_amount || null;
        const requests = this.repo.data.p2pJoinRequests || [], r = requests.find(r => r.id === p.requestId);
        if (!p.membershipId) {
          const g = this.repo.data.groups.find(g => g.id === p.groupId);
          // A received payment must remain visible even if an administrator closed a group during checkout.
          if (!g || !r) { p.status = 'received_needs_review'; await this.repo.save(); throw new P2pError('PAYPAL_PAYMENT_REVIEW_REQUIRED'); }
          const end = addOneMonth(new Date(paidAt)).toISOString();
          const m = { id: randomUUID(), groupId: p.groupId, userId: p.userId, role: 'MEMBER', slotNumber: p.slotNumber,
            status: 'ACTIVE', paymentMethod: 'DIRECT', paymentProvider: 'PAYPAL', paypalCaptureId: c.id,
            autoRenew: false, paidShareCents: p.amountCents, paidFeeCents: 0, memberTotalCents: p.amountCents,
            currentPeriodStart: c.create_time, currentPeriodEnd: end, joinedAt: c.create_time };
          (this.repo.data.memberships ||= []).push(m); p.membershipId = m.id; p.periodEnd = end;
          r.status = 'confirmed'; r.membershipId = m.id;
          g.occupiedMemberSlots = this.repo.data.memberships.filter(m => m.groupId === g.id && m.role === 'MEMBER' && m.status === 'ACTIVE' && Date.parse(m.currentPeriodEnd) > this.now()).length;
        }
      } else if (c.status === 'PENDING' && !['completed', 'refunded', 'reversed', 'failed'].includes(p.status)) p.status = 'pending';
    }
    await this.repo.save(); return this.publicPayment(p);
  }
  refresh(userId, paymentId) { return this.exclusive(async () => {
    this.provider.ready();
    const p = this.payments().find(p => p.id === paymentId && (p.userId === userId || p.ownerId === userId));
    if (!p?.orderId) throw new P2pError('PAYMENT_NOT_FOUND', 404);
    return this.reconcile(p, p.userId === userId);
  }); }
  revoke(p, status) {
    p.status = status; p.approvalUrl = null;
    const m = (this.repo.data.memberships || []).find(m => m.id === p.membershipId);
    if (m) m.status = 'PAYMENT_REVERSED';
    const g = this.repo.data.groups.find(g => g.id === p.groupId);
    if (g) g.occupiedMemberSlots = (this.repo.data.memberships || []).filter(m => m.groupId === g.id && m.role === 'MEMBER' && m.status === 'ACTIVE' && Date.parse(m.currentPeriodEnd) > this.now()).length;
  }
  cancel(userId, requestId) { return this.exclusive(async () => {
    const r = (this.repo.data.p2pJoinRequests || []).find(r => r.id === requestId);
    const g = r && this.repo.data.groups.find(g => g.id === r.groupId);
    if (!r || (r.userId !== userId && g?.ownerId !== userId)) throw new P2pError('FORBIDDEN', 403);
    if (this.payments().some(p => p.requestId === requestId && blocking(p))) throw new P2pError('PAYPAL_PAYMENT_REVIEW_REQUIRED');
    if (r.status === 'pending') r.status = 'canceled'; await this.repo.save();
  }); }
  webhook(event) { return this.exclusive(async () => {
    if (!event?.id || !event.event_type) throw new P2pError('INVALID_EVENT', 400);
    const events = this.repo.data.p2pQuotaWebhookEvents ||= [];
    if (events.some(e => e.id === event.id)) return { duplicate: true };
    const supported = ['MERCHANT.ONBOARDING.COMPLETED', 'MERCHANT.PARTNER-CONSENT.REVOKED',
      'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'];
    if (!supported.includes(event.event_type)) return { ignored: true };
    const resource = event.resource || {}, type = event.event_type;
    if (type.startsWith('MERCHANT.')) {
      const p = this.payees().find(p => p.merchantId === resource.merchant_id || p.trackingId === resource.tracking_id);
      if (p) {
        if (type === 'MERCHANT.PARTNER-CONSENT.REVOKED') p.status = 'revoked';
        else if (type === 'MERCHANT.ONBOARDING.COMPLETED') await this.verifyPayee(p.userId);
      }
    } else {
      const orderId = resource.supplementary_data?.related_ids?.order_id;
      const captureId = resource.supplementary_data?.related_ids?.capture_id || resource.id;
      const p = this.payments().find(p => (orderId && p.orderId === orderId) || (p.captureId && p.captureId === captureId));
      if (!p) throw new P2pError('PAYPAL_UNKNOWN_PAYMENT_REQUIRES_REVIEW', 503);
      if (p) {
        // Refund/reversal is monotone; a delayed completed event cannot restore access.
        if (['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED', 'PAYMENT.CAPTURE.DENIED'].includes(type)) {
          this.revoke(p, type.endsWith('REFUNDED') ? 'refunded' : type.endsWith('REVERSED') ? 'reversed' : 'failed');
        } else {
          await this.reconcile(p, false);
          if (type === 'PAYMENT.CAPTURE.COMPLETED' && !['completed', 'refunded', 'reversed', 'failed'].includes(p.status)) throw new P2pError('PAYPAL_PAYMENT_NOT_SETTLED', 503);
        }
      }
    }
    this.repo.data.p2pQuotaWebhookEvents = [...events, { id: event.id, type, processedAt: new Date(this.now()).toISOString() }];
    try { await this.repo.save(); } catch (error) { this.repo.data.p2pQuotaWebhookEvents = events; throw error; }
    return { received: true };
  }); }
  hasOpenPayments(groupId) { return this.payments().some(p => p.groupId === groupId && blocking(p) && p.status !== 'completed'); }
}
