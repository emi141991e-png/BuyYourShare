import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P2pSubscriptions } from '../server/services/p2pSubscription.js';
import { P2pBank } from '../server/services/p2pBank.js';
import { P2pGooglePay } from '../server/services/p2pGooglePay.js';
function fixture() {
  let now = Date.parse('2026-01-31T12:00:00Z'), order, failCreate = false;
  const calls = [];
  const repo = { data: { users: [], groups: [] }, save: async () => {} };
  const provider = { settings: () => ({ mode: 'sandbox', clientId: 'test', secret: 'test' }), request: async (path, method, body, key) => {
    calls.push({ path, method, key });
    if (path === '/v2/checkout/orders') {
      order = { id: 'ORDER1', status: 'APPROVED', purchase_units: body.purchase_units, payment_source: { google_pay: {} } };
      if (failCreate) throw new Error('network');
      return order;
    }
    if (path.endsWith('/capture')) { order.status = 'COMPLETED'; order.purchase_units[0].payments = { captures: [{ id:'CAP1', status:'COMPLETED', amount:structuredClone(order.purchase_units[0].amount), create_time:new Date(now).toISOString() }] }; }
    return structuredClone(order);
  } };
  const s = new P2pSubscriptions(repo, provider, { enabled: () => true, now: () => now });
  const bank = new P2pBank(s), g = new P2pGooglePay(s, bank, { P2P_GOOGLE_PAY_ENABLED: 'true' });
  return { repo, s, bank, g, calls, advance: days => { now += days * 86400000; }, order: () => order, fail: () => { failCreate = true; } };
}

test('quarterly and yearly capture use server prices, unlock automatically and notify admin once', async () => {
  for (const [planCode, amount, end] of [['QUARTERLY','2.69','2026-04-30T12:00:00.000Z'],['YEARLY','9.90','2027-01-31T12:00:00.000Z']]) {
    const f=fixture(); f.repo.data.users=[{id:'u',fullName:'Cliente Prova',email:'u@example.test'},{id:'a',role:'admin'}];
    const {orderId}=await f.g.create('u',planCode);
    assert.equal(f.order().purchase_units[0].amount.value,amount);
    await assert.rejects(f.g.create('u','MONTHLY'),/ACCESS_PLAN_PAYMENT_PENDING/);
    await f.g.capture('u',orderId); await f.g.capture('u',orderId);
    assert.equal(f.s.view('u').accessAllowed,true); assert.equal(f.s.view('u').currentPeriodEnd,end);
    assert.equal(f.s.view('u').accessPlanCode,planCode);
    const notices=f.repo.data.notifications.filter(n=>n.id.startsWith('google-paid-admin:'));
    assert.equal(notices.length,1); assert.ok(notices[0].message.includes('Cliente Prova'));
  }
  const f=fixture(); await assert.rejects(f.g.create('u','FREE'),/INVALID_ACCESS_PLAN/); assert.equal(f.calls.length,0);
});
test('annual payment with a monthly capture amount never grants annual access; full refund revokes the annual grant', async()=>{
  const f=fixture();const {orderId}=await f.g.create('u','YEARLY');
  await f.s.provider.request(`/v2/checkout/orders/${orderId}/capture`,'POST');
  f.order().purchase_units[0].payments.captures[0].amount.value='0.99';
  await assert.rejects(f.g.capture('u',orderId),/IDENTITY/);assert.equal(f.s.view('u').accessAllowed,false);
  f.order().purchase_units[0].payments.captures[0].amount.value='9.90';
  await f.g.capture('u',orderId);assert.equal(f.s.view('u').accessAllowed,true);
  f.order().purchase_units[0].payments.captures[0].status='REFUNDED';
  await f.g.capture('u',orderId);assert.equal(f.s.view('u').accessAllowed,false);
});
test('confirmed capture grants exactly 30 days and expires at the boundary, not a calendar month', async () => {
  const f = fixture(); const { orderId } = await f.g.create('u');
  assert.equal(f.s.view('u').accessAllowed, false);
  await f.g.capture('u', orderId);
  assert.equal(f.s.view('u').currentPeriodEnd, '2026-03-02T12:00:00.000Z');
  assert.equal(f.s.view('u').includedSupportAllowed, true);
  await f.g.capture('u', orderId);
  assert.equal(f.calls.filter(c => c.path.endsWith('/capture')).length, 1);
  f.advance(27); await f.bank.reminders(); await f.bank.reminders();
  assert.equal(f.repo.data.notifications.filter(n => n.id.startsWith('bank-renew:')).length, 1);
  f.advance(3); assert.equal(f.s.view('u').accessAllowed, false); assert.equal(f.s.view('u').includedSupportAllowed, false);
});
test('pending payment cannot unlock, another user cannot capture, identity mismatch fails closed', async () => {
  const f = fixture(); const { orderId } = await f.g.create('u');
  await assert.rejects(f.g.capture('other', orderId), /NOT_FOUND/);
  f.order().status = 'CREATED'; assert.equal((await f.g.capture('u', orderId)).pending, true);
  f.order().purchase_units[0].amount.value = '0.01';
  await assert.rejects(f.g.capture('u', orderId), /IDENTITY/);
  assert.equal(f.s.view('u').accessAllowed, false);
});
test('failed create retains intent and retries with same provider idempotency key', async () => {
  const f = fixture(); f.fail();
  await assert.rejects(f.g.create('u'), /network/); await assert.rejects(f.g.create('u'), /network/);
  assert.equal(f.calls[0].key, f.calls[1].key); assert.equal(f.g.records().length, 1);
  await assert.rejects(f.bank.report('u'), /REVIEW/);
});
test('capture persisted remotely is recovered after local save failure without second charge', async () => {
  const f = fixture(); const { orderId } = await f.g.create('u');
  f.repo.save = async () => { throw new Error('disk'); };
  await assert.rejects(f.g.capture('u', orderId), /disk/);
  assert.equal(f.s.view('u').accessAllowed, false);
  f.repo.save = async () => {}; await f.g.recover();
  assert.equal(f.s.view('u').accessAllowed, true);
  assert.equal(f.calls.filter(c => c.path.endsWith('/capture')).length, 1);
});
test('early renewal preserves remaining paid days; live disabled until verified', async () => {
  const f = fixture();
  f.repo.data.p2pSubscriptions = [{ userId:'u', status:'active', paymentMethod:'BANK', currentPeriodEnd:'2026-02-10T12:00:00Z' }];
  const { orderId } = await f.g.create('u'); await f.g.capture('u', orderId);
  assert.equal(f.s.view('u').currentPeriodEnd, '2026-03-12T12:00:00.000Z');
  f.s.provider.settings = () => ({ mode:'live',clientId:'x',secret:'y' });
  assert.equal(f.g.config().enabled, false);
});

test('full refund removes only the latest grant, preserves prior access and is idempotent', async () => {
  const f = fixture();
  f.repo.data.p2pSubscriptions = [{ userId:'u', status:'active', paymentMethod:'BANK', currentPeriodEnd:'2026-02-10T12:00:00Z' }];
  const { orderId } = await f.g.create('u'); await f.g.capture('u', orderId);
  f.order().purchase_units[0].payments.captures[0].status = 'REFUNDED';
  await f.g.capture('u', orderId); await f.g.capture('u', orderId);
  assert.equal(f.s.view('u').currentPeriodEnd, '2026-02-10T12:00:00Z');
  assert.equal(f.s.view('u').accessAllowed, true);
  assert.equal(f.g.records()[0].status, 'refunded');
  assert.equal(f.repo.data.notifications.filter(n => n.id.startsWith('google-refund:')).length, 1);
});
test('legacy grant refund restores its start; later independent credit is never erased', async () => {
  const f = fixture(); const { orderId } = await f.g.create('u'); await f.g.capture('u', orderId);
  delete f.g.records()[0].previousPeriodEnd;
  f.order().purchase_units[0].payments.captures[0].status = 'REFUNDED';
  await f.g.capture('u', orderId); assert.equal(f.s.view('u').accessAllowed, false);
  const other = fixture(); const o = await other.g.create('u'); await other.g.capture('u', o.orderId);
  other.s.find('u').currentPeriodEnd = '2026-05-01T12:00:00Z';
  other.order().purchase_units[0].payments.captures[0].status = 'REFUNDED';
  await other.g.capture('u', o.orderId);
  assert.equal(other.s.view('u').currentPeriodEnd, '2026-05-01T12:00:00Z');
  assert.equal(other.g.records()[0].reviewRequired, true);
});
test('refund rollback survives save failure and partial refunds require review without revoking paid days', async () => {
  const f = fixture(); const { orderId } = await f.g.create('u'); await f.g.capture('u', orderId);
  const end = f.s.view('u').currentPeriodEnd;
  f.order().purchase_units[0].payments.captures[0].status = 'REFUNDED';
  f.repo.save = async () => { throw new Error('disk'); };
  await assert.rejects(f.g.capture('u', orderId), /disk/);
  assert.equal(f.s.view('u').currentPeriodEnd, end);
  f.repo.save = async () => {};
  f.order().purchase_units[0].payments.captures[0].status = 'PARTIALLY_REFUNDED';
  await f.g.capture('u', orderId);
  assert.equal(f.s.view('u').currentPeriodEnd, end); assert.equal(f.g.records()[0].reviewRequired, true);
});

test('verified capture webhook recovers a browser interruption once; unrelated orders cannot grant access', async () => {
  const f = fixture(); const { orderId } = await f.g.create('u');
  await f.s.provider.request(`/v2/checkout/orders/${orderId}/capture`, 'POST');
  const event = { id:'EV1', event_type:'PAYMENT.CAPTURE.COMPLETED', resource:{ id:'CAP1', supplementary_data:{related_ids:{order_id:orderId}} } };
  assert.equal((await f.g.webhook({...event, resource:{supplementary_data:{related_ids:{order_id:'OTHER'}}}})).ignored, true);
  assert.equal(f.s.view('u').accessAllowed, false);
  await f.g.webhook(event); const end = f.s.view('u').currentPeriodEnd;
  assert.equal(f.s.view('u').accessAllowed, true);
  assert.equal((await f.g.webhook(event)).duplicate, true);
  assert.equal(f.s.view('u').currentPeriodEnd, end);
  f.repo.data.users.push({id:'admin',role:'admin'});
  await f.g.webhook({...event, id:'EV2',event_type:'PAYMENT.CAPTURE.REVERSED'});
  assert.equal(f.g.records()[0].reviewRequired, true);
  assert.ok(f.repo.data.notifications.some(n=>n.id.startsWith('google-review:')));
});

test('one unavailable order cannot starve recovery of another completed payment', async () => {
  const f = fixture(); const { orderId } = await f.g.create('u');
  await f.s.provider.request(`/v2/checkout/orders/${orderId}/capture`, 'POST');
  f.g.records().unshift({id:'bad',userId:'other',orderId:'BAD',status:'pending'});
  const request = f.s.provider.request;
  f.s.provider.request = async (...args) => { if(args[0].endsWith('/BAD')) throw new Error('provider unavailable'); return request(...args); };
  await f.g.recover();
  assert.equal(f.s.view('u').accessAllowed, true);
  assert.ok(f.g.records()[0].checkedAt);
});
