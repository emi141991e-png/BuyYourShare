import assert from 'node:assert/strict';
import test from 'node:test';
import { P2pSubscriptions, accessAllowed } from '../server/services/p2pSubscription.js';
import { P2pPayPal } from '../server/services/p2pPayPal.js';
import { allocateMoneySplit, getGroupSlotsBreakdown } from '../server/engine/MoneyEngine.js';
import { addOneMonth } from '../server/engine/DateEngine.js';

const NOW = Date.parse('2026-09-16T12:00:00Z');
function fixture() {
  const repo = { data: { groups: [], memberships: [] }, saves: [], async save() { this.saves.push(structuredClone(this.data)); } };
  const calls = [];
  const remote = { id: 'I-TEST', custom_id: '', plan_id: 'P-MEMBER', status: 'APPROVAL_PENDING', billing_info: {} };
  const provider = {
    async validatePlans() { return { MEMBER: 'P-MEMBER', GROUP_LEADER: 'P-LEADER' }; },
    async create(record) { calls.push(['create', record.requestId]); remote.custom_id = record.customId; remote.plan_id = record.planId; return { id: remote.id, status: remote.status, links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/approve' }] }; },
    async get() { return structuredClone(remote); },
    async revise(id, planId, key) { calls.push(['revise', id, planId, key]); return { links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/revise' }] }; },
    async cancel(id) { calls.push(['cancel', id]); remote.status = 'CANCELLED'; return {}; }
  };
  const service = new P2pSubscriptions(repo, provider, { now: () => NOW, enabled: () => true });
  function paid() {
    remote.status = 'ACTIVE'; remote.billing_info = { last_payment: { time: '2026-09-01T12:00:00Z', amount: { value: '0.99', currency_code: 'EUR' } }, next_billing_time: '2026-10-01T12:00:00Z', failed_payments_count: 0 };
  }
  return { repo, provider, service, remote, calls, paid };
}

test('concurrent activation creates one recurring subscription, with role chosen server-side', async () => {
  const f = fixture();
  await Promise.all([f.service.start('user', 'MEMBER'), f.service.start('user', 'GROUP_LEADER')]);
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1);
  assert.equal(f.service.view('user').priceCents, 99);
  assert.equal(f.service.view('user').accessAllowed, false);
  assert.ok(f.repo.saves[0].p2pSubscriptions[0].requestId);
  const owner = fixture(); owner.repo.data.groups.push({ ownerId: 'user' });
  await owner.service.start('user', 'MEMBER');
  assert.equal(owner.remote.plan_id, 'P-LEADER');
  assert.equal(owner.service.view('user').priceCents, 49);
});
test('ACTIVE alone does not unlock unpaid access; renewal failure and suspension block it', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER');
  f.remote.status = 'ACTIVE'; await f.service.refresh('user');
  assert.equal(f.service.view('user').status, 'pending');
  f.paid(); await f.service.refresh('user'); assert.equal(f.service.view('user').accessAllowed, true);
  f.remote.billing_info.failed_payments_count = 1;
  await f.service.webhook({ id: 'failed', event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', resource: { id: 'I-TEST' } });
  assert.equal(f.service.view('user').status, 'past_due'); assert.equal(f.service.view('user').accessAllowed, false);
  f.remote.status = 'SUSPENDED'; f.remote.billing_info.failed_payments_count = 0;
  await f.service.refresh('user'); assert.equal(f.service.view('user').status, 'suspended');
});
test('upgrade revises same ID; stays MEMBER without consent and becomes leader only on verified plan', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER'); f.paid(); await f.service.refresh('user');
  await f.service.upgrade('user'); await f.service.upgrade('user');
  assert.equal(f.calls.filter(c => c[0] === 'revise').length, 1);
  assert.equal(f.service.view('user').role, 'MEMBER');
  assert.equal(f.service.view('user').pendingRole, 'GROUP_LEADER');
  f.remote.plan_id = 'P-LEADER'; await f.service.refresh('user');
  assert.equal(f.service.view('user').role, 'GROUP_LEADER');
  assert.equal(f.service.view('user').priceCents, 49);
  assert.equal(f.service.view('user').nextBillingDate, '2026-10-01T12:00:00Z');
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1);
  f.repo.data.groups = []; await f.service.refresh('user');
  assert.equal(f.service.view('user').role, 'GROUP_LEADER');
});
test('cancellation disables PayPal immediately, retains only paid period, repeated cancel is safe', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER'); f.paid(); await f.service.refresh('user');
  await f.service.cancel('user'); await f.service.cancel('user');
  assert.equal(f.calls.filter(c => c[0] === 'cancel').length, 1);
  assert.equal(f.service.view('user').cancelAtPeriodEnd, true);
  assert.equal(f.service.view('user').nextBillingDate, null);
  assert.equal(f.service.view('user').accessAllowed, true);
  assert.equal(accessAllowed(f.service.find('user'), Date.parse('2026-10-01T12:00:00Z')), false);
  await f.service.start('user', 'MEMBER');
  assert.equal(f.calls.filter(c => c[0] === 'create').length, 1);
});
test('duplicate and out-of-order webhooks reconcile current provider truth, never resurrect canceled subscriptions', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER'); f.paid();
  const event = { id: 'event-1', event_type: 'PAYMENT.SALE.COMPLETED', resource: { billing_agreement_id: 'I-TEST' } };
  await Promise.all([f.service.webhook(event), f.service.webhook(event)]);
  assert.equal(f.repo.data.p2pWebhookEvents.length, 1);
  await f.service.cancel('user');
  await f.service.webhook({ id: 'old-activation', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-TEST' } });
  assert.equal(f.service.find('user').providerStatus, 'CANCELLED');
  assert.equal(f.service.view('user').cancelAtPeriodEnd, true);
});
test('provider failures and failed persistence do not mark webhook processed', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER');
  const event = { id: 'retry-me', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-TEST' } };
  const get = f.provider.get; f.provider.get = async () => { throw new Error('timeout'); };
  await assert.rejects(f.service.webhook(event)); assert.equal(f.repo.data.p2pWebhookEvents, undefined);
  f.provider.get = get;
  const save = f.repo.save; f.repo.save = async () => { throw new Error('disk full'); };
  await assert.rejects(f.service.webhook(event)); assert.deepEqual(f.repo.data.p2pWebhookEvents, []);
  f.repo.save = save; await f.service.webhook(event); assert.equal(f.repo.data.p2pWebhookEvents.length, 1);
});
test('ambiguous create retries same request key; old intent blocks creation instead of risking a second subscription', async () => {
  const f = fixture(); const create = f.provider.create;
  f.provider.create = async r => { await create(r); throw new Error('lost response'); };
  await assert.rejects(f.service.start('user', 'MEMBER'));
  const key = f.service.find('user').requestId;
  f.provider.create = create; await f.service.start('user', 'MEMBER');
  assert.equal(f.calls[1][1], key);
  const old = fixture(); old.provider.create = async () => { throw new Error('timeout'); };
  await assert.rejects(old.service.start('user', 'MEMBER'));
  old.service.find('user').requestedAt = '2026-09-15T00:00:00Z';
  await assert.rejects(old.service.start('user', 'MEMBER'), /REQUIRES_RECONCILIATION/);
});
test('webhook recovers provider ID after lost create response; foreign subscription does not get access', async () => {
  const f = fixture(); const create = f.provider.create;
  f.provider.create = async r => { await create(r); throw new Error('timeout'); };
  await assert.rejects(f.service.start('user', 'MEMBER')); f.paid();
  await f.service.webhook({ id: 'recovery', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-TEST', custom_id: f.remote.custom_id } });
  assert.equal(f.service.view('user').accessAllowed, true);
  f.remote.custom_id = 'another-user';
  await assert.rejects(f.service.refresh('user'), /IDENTITY_MISMATCH/);
});
test('legacy subscriptions block new billing; paid end does not move forward with failures', async () => {
  const f = fixture(); f.repo.data.memberships.push({ paypalSubscriptionId: 'I-LEGACY' });
  await assert.rejects(f.service.start('user', 'MEMBER'), /LEGACY_BILLING/);
  f.repo.data.memberships = []; await f.service.start('user', 'MEMBER'); f.paid(); await f.service.refresh('user');
  f.remote.billing_info.next_billing_time = '2026-11-01T12:00:00Z'; f.remote.billing_info.failed_payments_count = 1;
  await f.service.refresh('user'); assert.equal(f.service.find('user').currentPeriodEnd, '2026-10-01T12:00:00Z');
});
test('plan validation requires exact monthly EUR prices, same product, no setup fee or trial', async () => {
  const plans = ['MEMBER', 'LEADER'].map((role, i) => ({ product_id: 'PRODUCT', status: 'ACTIVE', billing_cycles: [{ tenure_type: 'REGULAR', sequence: 1, total_cycles: 0, frequency: { interval_unit: 'MONTH', interval_count: 1 }, pricing_scheme: { fixed_price: { currency_code: 'EUR', value: i ? '0.49' : '0.99' } } }], payment_preferences: { setup_fee: { value: '0' } } }));
  const p = new P2pPayPal({ P2P_PAYPAL_MODE: 'sandbox', P2P_PAYPAL_MEMBER_PLAN_ID: 'P-MEMBER', P2P_PAYPAL_LEADER_PLAN_ID: 'P-LEADER' });
  p.request = async path => structuredClone(path.endsWith('P-MEMBER') ? plans[0] : plans[1]);
  await p.validatePlans();
  plans[1].billing_cycles[0].pricing_scheme.fixed_price.value = '0.99';
  await assert.rejects(p.validatePlans(), /PLAN_INVALID/);
  plans[1].billing_cycles[0].pricing_scheme.fixed_price.value = '0.49'; plans[1].product_id = 'OTHER';
  await assert.rejects(p.validatePlans(), /PRODUCT_MISMATCH/);
});
test('successful renewal extends the paid period once, and stale failures cannot revoke a later payment', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER'); f.paid(); await f.service.refresh('user');
  f.service.now = () => Date.parse('2026-10-02T12:00:00Z');
  f.remote.billing_info.last_payment.time = '2026-10-01T12:00:00Z'; f.remote.billing_info.next_billing_time = '2026-11-01T12:00:00Z';
  await f.service.webhook({ id: 'renewal', event_type: 'PAYMENT.SALE.COMPLETED', resource: { billing_agreement_id: 'I-TEST' } });
  assert.equal(f.service.view('user').currentPeriodEnd, '2026-11-01T12:00:00Z');
  await f.service.webhook({ id: 'stale-failure', event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', create_time: '2026-09-01T00:00:00Z', resource: { id: 'I-TEST' } });
  assert.equal(f.service.view('user').accessAllowed, true);
});
test('failure and suspension events block access even if provider GET is temporarily stale', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER'); f.paid(); await f.service.refresh('user');
  await f.service.webhook({ id: 'lagging-failure', event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', create_time: '2026-09-16T11:00:00Z', resource: { id: 'I-TEST' } });
  await f.service.refresh('user'); assert.equal(f.service.view('user').status, 'past_due');
  f.remote.billing_info.last_payment.time = '2026-09-16T11:30:00Z'; await f.service.refresh('user');
  assert.equal(f.service.view('user').accessAllowed, true);
  await f.service.webhook({ id: 'lagging-suspension', event_type: 'BILLING.SUBSCRIPTION.SUSPENDED', create_time: '2026-09-16T11:40:00Z', resource: { id: 'I-TEST' } });
  await f.service.refresh('user'); assert.equal(f.service.view('user').status, 'suspended');
  f.remote.status_update_time = '2026-09-16T11:50:00Z'; await f.service.refresh('user');
  assert.equal(f.service.view('user').accessAllowed, true);
});
test('webhook signature is required and verified by PayPal; live safety lock prevents calls', async () => {
  const p = new P2pPayPal({ P2P_PAYPAL_MODE: 'sandbox', P2P_PAYPAL_WEBHOOK_ID: 'WH-TEST' });
  assert.equal(await p.verify({}, {}), false);
  let body;
  p.request = async (path, method, value) => { body = value; return { verification_status: 'SUCCESS' }; };
  const headers = Object.fromEntries(['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'].map(k => [k, 'test']));
  assert.equal(await p.verify(headers, { id: 'event' }), true); assert.equal(body.webhook_id, 'WH-TEST');
  const locked = new P2pPayPal({ P2P_PAYPAL_MODE: 'live' }, () => { throw new Error('network must not run'); });
  await assert.rejects(locked.get('I-TEST'), /SAFETY_LOCK/);
});
test('webhook deduplication survives restart using persisted event IDs', async () => {
  const f = fixture(); await f.service.start('user', 'MEMBER'); f.paid();
  const event = { id: 'persisted-event', event_type: 'PAYMENT.SALE.COMPLETED', resource: { billing_agreement_id: 'I-TEST' } };
  await f.service.webhook(event);
  const restored = { data: structuredClone(f.repo.saves.at(-1)), async save() {} };
  const restarted = new P2pSubscriptions(restored, { get() { throw new Error('duplicate must not call provider'); } });
  assert.deepEqual(await restarted.webhook(event), { duplicate: true });
});
test('group share calculations never add old platform fees and expired direct memberships free their slot', () => {
  assert.deepEqual(allocateMoneySplit(1000, 3), [334, 333, 333]);
  const g = { id: 'group', totalSlots: 3, ownerSlots: 1, realSubscriptionCostCents: 1000, platformFeeCents: 149 };
  const s = getGroupSlotsBreakdown(g, [{ groupId: 'group', slotNumber: 2, status: 'ACTIVE', paymentMethod: 'DIRECT', currentPeriodEnd: '2020-01-01' }]);
  assert.equal(s.slots[1].memberTotalCents, 333); assert.equal(s.slots[1].isOccupied, false);
});
test('a direct group month ends in February instead of overflowing into March', () => {
  assert.equal(addOneMonth(new Date('2026-01-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(addOneMonth(new Date('2028-01-31T12:00:00Z')).toISOString(), '2028-02-29T12:00:00.000Z');
});
