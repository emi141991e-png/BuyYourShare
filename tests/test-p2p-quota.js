import test from 'node:test';
import assert from 'node:assert/strict';
import { P2pQuota } from '../server/services/p2pQuota.js';
import { P2pQuotaPayPal } from '../server/services/p2pQuotaPayPal.js';
import { P2pSubscriptions } from '../server/services/p2pSubscription.js';

function fixture() {
  const now = Date.parse('2026-09-16T12:00:00Z');
  const repo = { data: { users: [{ id: 'member', fullName: 'Member' }],
    groups: [{ id: 'g', ownerId: 'leader', ownerSlots: 1, totalSlots: 3, realSubscriptionCostCents: 1000, status: 'PUBLISHED' }],
    memberships: [], p2pSubscriptions: ['member', 'leader', 'other'].map(userId => ({ userId, role: userId === 'leader' ? 'GROUP_LEADER' : 'MEMBER', status: 'active', currentPeriodEnd: '2026-10-16T12:00:00Z' })),
    p2pPayees: [{ userId: 'leader', email: 'leader@example.test', trackingId: 'tracking', status: 'pending' }] }, async save() {} };
  let order, createCount = 0, captureCount = 0;
  const provider = {
    ready: () => ({}), settings: () => ({ clientId: 'client', partnerId: 'platform' }),
    seller: async () => ({ merchant_id: 'seller', tracking_id: 'tracking', payments_receivable: true, primary_email_confirmed: true,
      oauth_integrations: [{ oauth_third_party: [{ partner_client_id: 'client', scopes: ['https://uri.paypal.com/services/payments/payment/authcapture'] }] }] }),
    createOrder: async p => { createCount++; order = { id: 'ORDER', intent: 'CAPTURE', status: 'APPROVED', purchase_units: [{ custom_id: p.id, payee: { merchant_id: 'seller' }, amount: { currency_code: 'EUR', value: (p.amountCents / 100).toFixed(2) } }] }; return { id: 'ORDER', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER' }] }; },
    order: async () => structuredClone(order),
    capture: async () => { captureCount++; order.status = 'COMPLETED'; order.purchase_units[0].payments = { captures: [{ id: 'CAPTURE', status: 'COMPLETED', amount: order.purchase_units[0].amount, create_time: '2026-09-16T12:00:00Z' }] }; }
  };
  const service = new P2pQuota(new P2pSubscriptions(repo, {}, { now: () => now, enabled: () => true }), provider, () => now);
  return { service, repo, provider, get order() { return order; }, counts: () => ({ createCount, captureCount }) };
}
async function prepared(f) { const r = await f.service.request('member', 'g', 2); return f.service.order('member', r.id); }

test('PayPal quota confirms exact recipient and amount once, with zero BYS fees', async () => {
  const f = fixture(), p = await prepared(f);
  const [a, b] = await Promise.all([f.service.refresh('member', p.id), f.service.refresh('member', p.id)]);
  assert.equal(a.status, 'completed'); assert.equal(b.captureId, 'CAPTURE');
  assert.equal(f.repo.data.memberships.length, 1); assert.equal(f.repo.data.memberships[0].paidFeeCents, 0);
  assert.equal(f.repo.data.memberships[0].paidShareCents, 333); assert.equal(f.counts().captureCount, 1);
  assert.equal(f.repo.data.memberships[0].currentPeriodEnd, '2026-10-16T12:00:00.000Z');
});
test('unverified recipient or mismatched delegated client cannot receive checkout', async () => {
  const f = fixture(); f.provider.seller = async () => ({ merchant_id: 'seller', tracking_id: 'tracking', payments_receivable: true, primary_email_confirmed: true });
  await assert.rejects(() => prepared(f), /PAYPAL_CONNECTION_INCOMPLETE/);
  assert.equal(f.counts().createCount, 0);
});
test('recipient and amount tampering blocks capture and access', async () => {
  for (const mutate of [o => { o.purchase_units[0].payee.merchant_id = 'platform'; }, o => { o.purchase_units[0].amount.value = '0.01'; }, o => { o.purchase_units[0].custom_id = 'other'; }]) {
    const f = fixture(), p = await prepared(f); mutate(f.order);
    await assert.rejects(() => f.service.refresh('member', p.id), /PAYPAL_PAYMENT_MISMATCH/);
    assert.equal(f.repo.data.memberships.length, 0); assert.equal(f.counts().captureCount, 0);
  }
});
test('pending capture never confirms membership', async () => {
  const f = fixture(), p = await prepared(f);
  f.provider.capture = async () => { f.order.status = 'COMPLETED'; f.order.purchase_units[0].payments = { captures: [{ id: 'CAPTURE', status: 'PENDING', amount: f.order.purchase_units[0].amount }] }; };
  assert.equal((await f.service.refresh('member', p.id)).status, 'pending'); assert.equal(f.repo.data.memberships.length, 0);
});
test('timeout keeps durable idempotency key and reserves slot, without allowing local cancellation', async () => {
  const f = fixture(), r = await f.service.request('member', 'g', 2), r2 = await f.service.request('other', 'g', 2);
  const keys = []; f.provider.createOrder = async p => { keys.push(p.createKey); throw new Error('timeout'); };
  await assert.rejects(() => f.service.order('member', r.id), /timeout/);
  await assert.rejects(() => f.service.order('member', r.id), /timeout/);
  assert.equal(keys[0], keys[1]); assert.equal(f.service.payments().length, 1);
  await assert.rejects(() => f.service.order('other', r2.id), /SLOT_RESERVED/);
  await assert.rejects(() => f.service.cancel('member', r.id), /PAYPAL_PAYMENT_REVIEW_REQUIRED/);
});
test('refund and reversed webhooks revoke access and delayed completion cannot restore it', async () => {
  const f = fixture(), p = await prepared(f); await f.service.refresh('member', p.id);
  const event = { id: 'event1', event_type: 'PAYMENT.CAPTURE.REVERSED', resource: { id: 'CAPTURE' } };
  await f.service.webhook(event); assert.equal((await f.service.webhook(event)).duplicate, true);
  await f.service.webhook({ id: 'event2', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAPTURE' } });
  assert.equal(f.service.payments()[0].status, 'reversed'); assert.equal(f.repo.data.memberships[0].status, 'PAYMENT_REVERSED');
});
test('a leader cannot capture a buyer-approved order and other users cannot inspect it', async () => {
  const f = fixture(), p = await prepared(f);
  await f.service.refresh('leader', p.id); assert.equal(f.counts().captureCount, 0);
  await assert.rejects(() => f.service.refresh('other', p.id), /PAYMENT_NOT_FOUND/);
});
test('both declined and denied capture events block access despite stale provider completion', async () => {
  for (const type of ['PAYMENT.CAPTURE.DECLINED', 'PAYMENT.CAPTURE.DENIED']) {
    const f = fixture(), p = await prepared(f); await f.service.refresh('member', p.id);
    await f.service.webhook({ id: type, event_type: type, resource: { id: 'CAPTURE' } });
    await f.service.refresh('member', p.id);
    assert.equal(f.service.payments()[0].status, 'failed');
    assert.equal(f.repo.data.memberships[0].status, 'PAYMENT_REVERSED');
  }
});
test('quota client fails closed for unapproved live and never falls back to subscription credentials', () => {
  assert.throws(() => new P2pQuotaPayPal({ P2P_QUOTA_PAYPAL_MODE: 'live' }).settings(), /LIVE_NOT_APPROVED/);
  assert.throws(() => new P2pQuotaPayPal({ P2P_QUOTA_ENABLED: 'true', P2P_QUOTA_PAYPAL_MODE: 'sandbox', PAYPAL_CLIENT_ID: 'store', PAYPAL_CLIENT_SECRET: 'store-secret' }).ready(), /NOT_CONFIGURED/);
});
test('quota order targets seller directly, instant disbursement, no platform fee or non-PayPal method', async () => {
  const p = new P2pQuotaPayPal({ P2P_QUOTA_PAYPAL_MODE: 'sandbox', P2P_PUBLIC_URL: 'https://example.test' });
  let captured;
  p.partnerRequest = async (...args) => { captured = args; };
  await p.createOrder({ id: 'quota', amountCents: 333, merchantId: 'seller', createKey: 'key' });
  assert.equal(captured[2].purchase_units[0].payee.merchant_id, 'seller');
  assert.deepEqual(captured[2].purchase_units[0].payment_instruction, { disbursement_mode: 'INSTANT' });
  assert.deepEqual(Object.keys(captured[2].payment_source), ['paypal']);
  assert.equal(captured[3], 'key'); assert.equal(captured[4], 'seller');
});
