import { addOneMonth } from '../engine/DateEngine.js';

// Explicit allowlist; never cancels provider subscriptions or guesses payment evidence.
export async function prepareLegacyMigration(data, provider, ids, now = new Date(), { stripe } = {}) {
  const pending = (data.memberships || []).filter(m => (m.paypalSubscriptionId || m.stripeSubscriptionId) && !m.legacyBillingEndedAt);
  if (!pending.length) return null;
  const next = structuredClone(data);
  next.p2pSubscriptions ||= [];
  for (const old of pending) {
    let sourceId, providerStatus, paidTime, end;
    if (old.stripeSubscriptionId && !old.paypalSubscriptionId && old.stripeSubscriptionId.startsWith('pi_') && ids.includes(old.stripeSubscriptionId) && stripe) {
      // Historical one-time payments were stored in the subscription field.
      // Verify a settled non-invoice charge; never cancel or mutate Stripe objects.
      const payment = await stripe.paymentIntents.retrieve(old.stripeSubscriptionId, { expand: ['latest_charge'] });
      const charge = payment.latest_charge;
      if (payment.id !== old.stripeSubscriptionId || payment.status !== 'succeeded' || payment.currency !== 'eur' ||
          !(payment.amount_received > 0) || payment.invoice !== null || !charge || typeof charge !== 'object' ||
          !charge.paid || charge.refunded || charge.amount_refunded > 0 || charge.invoice !== null ||
          !Number.isFinite(charge.created) || charge.created * 1000 > now.getTime()) throw new Error('P2P_LEGACY_STRIPE_PAYMENT_UNVERIFIED');
      paidTime = new Date(charge.created * 1000).toISOString();
      const paidEnd = addOneMonth(new Date(paidTime)).getTime();
      const storedEnd = Date.parse(old.currentPeriodEnd);
      if (!Number.isFinite(storedEnd)) throw new Error('P2P_LEGACY_PERIOD_UNVERIFIED');
      end = new Date(Math.min(paidEnd, storedEnd)).toISOString();
      sourceId = payment.id; providerStatus = 'ONE_TIME_PAYMENT_VERIFIED';
    } else if (old.stripeSubscriptionId || !ids.includes(old.paypalSubscriptionId)) {
      console.error('[P2P] Legacy billing reference requires reconciliation', JSON.stringify({ membershipId: old.id,
        paypalSubscriptionId: old.paypalSubscriptionId || null, stripeSubscriptionId: old.stripeSubscriptionId || null,
        status: old.status, currentPeriodEnd: old.currentPeriodEnd || null }));
      throw new Error('P2P_LEGACY_NOT_AUTHORIZED');
    } else {
    const remote = await provider.get(old.paypalSubscriptionId);
    const identity = JSON.parse(remote.custom_id || '{}');
    if (remote.id !== old.paypalSubscriptionId || !['CANCELLED', 'EXPIRED'].includes(remote.status) ||
        identity.memberId !== old.userId || identity.groupId !== old.groupId) throw new Error('P2P_LEGACY_NOT_RECONCILED');
    const paid = remote.billing_info?.last_payment;
    if (paid?.amount?.currency_code !== 'EUR' || !Number.isFinite(Number(paid.amount.value)) || Number(paid.amount.value) <= 0 ||
        !Number.isFinite(Date.parse(paid.time)) || Date.parse(paid.time) > now.getTime()) throw new Error('P2P_LEGACY_PAYMENT_UNVERIFIED');
    end = addOneMonth(new Date(paid.time)).toISOString();
    sourceId = remote.id; providerStatus = remote.status; paidTime = paid.time;
    }
    const m = next.memberships.find(item => item.id === old.id);
    Object.assign(m, { legacyBillingEndedAt: now.toISOString(), legacyProviderStatus: providerStatus,
      autoRenew: false, paymentMethod: 'DIRECT', status: Date.parse(end) > now.getTime() ? 'CANCELLATION_SCHEDULED' : 'EXPIRED',
      currentPeriodStart: paidTime, currentPeriodEnd: end });
    // Honor already purchased access until the verified paid month ends. No new charge.
    // Existing access subscriptions are never overwritten by migration.
    if (!next.p2pSubscriptions.some(s => s.userId === m.userId) && Date.parse(end) > now.getTime()) {
      next.p2pSubscriptions.push({ userId: m.userId, role: next.groups?.some(g => g.ownerId === m.userId) ? 'GROUP_LEADER' : 'MEMBER',
        status: 'active', currentPeriodStart: paidTime, currentPeriodEnd: end, cancelAtPeriodEnd: true,
        nextBillingDate: null, migrationCredit: true, legacySourceId: sourceId });
    }
  }
  return next;
}
