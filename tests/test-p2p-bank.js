import assert from 'node:assert/strict';
import { test } from 'node:test';
import { P2pSubscriptions } from '../server/services/p2pSubscription.js';
import { P2pBank, bankCode } from '../server/services/p2pBank.js';
import { PushNotifications } from '../server/services/pushNotifications.js';
function fixture() {
  let now = Date.parse('2026-01-31T12:00:00Z');
  const repo = { data: { users: [{ id: 'u', role: 'user' }, { id: 'a', role: 'admin' }], groups: [] }, save: async () => {} };
  const s = new P2pSubscriptions(repo, {}, { enabled: () => true, now: () => now });
  return { repo, s, b: new P2pBank(s), advance: days => { now += days * 86400000; } };
}
test('bank report does not unlock; only admin confirms once; renewal preserves paid days', async () => {
  const { b, s } = fixture();
  const [p, duplicate] = await Promise.all([b.report('u'), b.report('u')]);
  assert.equal(p.id, duplicate.id); assert.equal(s.view('u').accessAllowed, false);
  await assert.rejects(b.confirm(p.id, 'u', 'TRN-123'), /FORBIDDEN/);
  await b.confirm(p.id, 'a', 'TRN-123');
  assert.equal(s.view('u').currentPeriodEnd, '2026-02-28T12:00:00.000Z');
  assert.equal(s.view('u').accessAllowed, true);
  await b.confirm(p.id, 'a', 'TRN-123');
  assert.equal(s.view('u').currentPeriodEnd, b.records().find(r => r.id === p.id).periodEnd);
  const p2 = await b.report('u');
  await assert.rejects(b.confirm(p2.id, 'a', 'TRN-123'), /DUPLICATE/);
  await b.confirm(p2.id, 'a', 'TRN-456');
  assert.equal(s.view('u').currentPeriodEnd, '2026-03-28T12:00:00.000Z');
  await s.upgrade('u'); assert.equal(s.view('u').role, 'GROUP_LEADER');
  await assert.rejects(s.start('u', 'MEMBER'), /BANK_PAYMENT_IN_PROGRESS/);
  assert.equal(b.view('u').payments[0].bankReference, undefined);
  assert.equal(bankCode('u'), b.view('u').code);
});
test('open PayPal blocks bank; canceled identity is retired and stale webhook ignored', async () => {
  const { b, s, repo } = fixture();
  repo.data.p2pSubscriptions = [{ userId: 'u', providerSubscriptionId: 'I-OLD', providerStatus: 'APPROVAL_PENDING' }];
  await assert.rejects(b.report('u'), /BANK_PAYPAL_OPEN/);
  s.find('u').providerStatus = 'CANCELLED';
  const p = await b.report('u'); await b.confirm(p.id, 'a', 'TRN-ONE');
  assert.deepEqual(await s.webhook({ id: 'event', event_type: 'BILLING.SUBSCRIPTION.SUSPENDED', resource: { id: 'I-OLD' } }), { ignored: true });
  assert.equal(s.view('u').accessAllowed, true);
});
test('failed save rolls back grant; expiry blocks access and reminders are deduplicated and push eligible', async () => {
  const { b, s, repo, advance } = fixture(); const p = await b.report('u');
  repo.save = async () => { throw new Error('disk'); };
  await assert.rejects(b.confirm(p.id, 'a', 'TRN-ONE'), /disk/);
  assert.equal(s.view('u').accessAllowed, false);
  repo.save = async () => {}; await b.confirm(p.id, 'a', 'TRN-ONE');
  advance(26); await b.reminders(); await b.reminders();
  const notices = repo.data.notifications.filter(n => n.id.startsWith('bank-renew:'));
  assert.equal(notices.length, 1);
  const push = new PushNotifications(s, { now: s.now });
  assert.equal(push.relevant(notices[0]), true);
  advance(3); await b.reminders(); assert.equal(s.view('u').accessAllowed, false);
  assert.equal(push.relevant(notices[0]), false);
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('bank-renew:')).length, 2);
});
