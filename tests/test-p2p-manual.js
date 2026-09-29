import test from 'node:test';
import assert from 'node:assert/strict';
import { P2pManual, paymentDestination } from '../server/services/p2pManual.js';
function setup() {
  let now = Date.parse('2026-01-31T12:00:00Z');
  const repo = { data: { groups: [{ id: 'g', ownerId: 'o', status: 'PUBLISHED', totalSlots: 3, ownerSlots: 1, realSubscriptionCostCents: 900, manualPaymentDestination: { paypalEmail: 'owner@example.com' } }], memberships: [] }, save: async () => {} };
  let queue = Promise.resolve();
  const service = new P2pManual({ repo, find: id => id === 'unpaid' ? null : { status: 'active', currentPeriodEnd: '2030-01-01' }, exclusive: fn => { const p = queue.catch(() => {}).then(fn); queue = p; return p; } }, () => now);
  return { service, repo, time: value => { now = Date.parse(value); } };
}
test('chat retries are deduplicated and unread markers are private and monotonic', async()=>{
  const {service:s}=setup();const r=await s.request('m','g',2);
  await s.send('m',r.id,'Ciao','msg-one');await s.send('m',r.id,'Ciao','msg-one');
  assert.equal(s.chat('o',r.id).filter(m=>m.senderId==='m').length,1);
  assert.equal(s.list('o')[0].unreadMessages,1);
  const first=s.chat('o',r.id).at(-1);await assert.rejects(s.markRead('stranger',r.id,first.id));
  await s.markRead('o',r.id,first.id);assert.equal(s.list('o')[0].unreadMessages,0);
  await s.send('m',r.id,'Rinnovo?','msg-two');assert.equal(s.list('o')[0].unreadMessages,1);
  await s.markRead('o',r.id,first.id);assert.equal(s.list('o')[0].unreadMessages,1);
});

test('personal group list keeps closed groups private to their owner', () => {
  const { service, repo } = setup();
  repo.data.groups[0].status = 'CLOSED';
  assert.equal(service.ownedGroups('o').length, 1);
  assert.equal(service.ownedGroups('m').length, 0);
  assert.equal(service.ownedGroups('o')[0].manualPaymentDestination, undefined);
});

test('expiry and renewal reminders notify both participants without duplicates', async () => {
  const { service: s, repo, time } = setup();
  const first = await s.request('m', 'g', 2); await s.action('o', first.id, 'accept');
  time('2026-02-03T12:00:00Z'); await s.reminders(); await s.reminders();
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('reservation-expired')).length, 2);
  const second = await s.request('m', 'g', 2); await s.action('o', second.id, 'accept'); await s.action('m', second.id, 'report'); await s.action('o', second.id, 'confirm');
  time('2026-03-04T12:00:00Z'); await s.reminders(); await s.reminders();
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('leader-renew:')).length, 1);
  assert.equal(repo.data.notifications.find(n => n.id.startsWith('leader-renew:')).userId, 'o');
});
test('destination requires valid IBAN checksum or PayPal email', () => {
  assert.throws(() => paymentDestination({})); assert.throws(() => paymentDestination({ payoutIban: 'IT00X0542811101000000123456', payoutLegalName: 'Test' }));
  assert.equal(paymentDestination({ paypalEmail: 'OWNER@example.com' }).paypalEmail, 'owner@example.com');
  assert.equal(paymentDestination({ payoutIban: 'IT60X0542811101000000123456', payoutLegalName: 'Test' }).accountHolder, 'Test');
});
test('private request, owner acceptance, manual confirmation and duplicate safety', async () => {
  const { service: s, repo, time } = setup();
  await assert.rejects(s.request('unpaid','g',2));
  const r = await s.request('m','g',2);
  assert.equal(s.list('m')[0].paymentDestination, undefined);
  assert.throws(() => s.chat('stranger',r.id));
  await assert.rejects(s.action('m',r.id,'accept'));
  await s.action('o',r.id,'accept');
  assert.equal(s.list('m')[0].paymentDestination.paypalEmail,'owner@example.com');
  await assert.rejects(s.request('other','g',2));
  await s.action('m',r.id,'report');
  await assert.rejects(s.action('m',r.id,'confirm'));
  await s.action('o',r.id,'confirm'); await s.action('o',r.id,'confirm');
  assert.equal(repo.data.memberships.length,1); assert.equal(r.periodEnd,'2026-02-28T12:00:00.000Z');
  time('2026-02-26T12:00:00Z'); await s.reminders(); await s.reminders();
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('renew:')).length,1);
  await s.action('m',r.id,'report'); const old = r.periodEnd;
  await s.action('o',r.id,'confirm',old); assert.equal(r.periodEnd,'2026-03-28T12:00:00.000Z');
  assert.equal(repo.data.p2pManualConfirmations.length,2);
});
test('reservation expires but reported payments and late renewals retain their slot', async () => {
  const { service: s, time } = setup();
  const r = await s.request('m','g',2); await s.action('o',r.id,'accept');
  time('2026-02-03T12:00:00Z'); await s.reminders(); assert.equal(r.status,'canceled');
  const next = await s.request('m','g',2); await s.action('o',next.id,'accept'); await s.action('m',next.id,'report');
  time('2026-03-03T12:00:00Z'); await s.reminders(); assert.equal(next.status,'reported');
  await assert.rejects(s.request('other','g',2));
});

test('competing acceptances serialize and never reserve a slot twice', async () => {
  const { service: s } = setup();
  const a = await s.request('a','g',2), b = await s.request('b','g',2);
  const results = await Promise.allSettled([s.action('o',a.id,'accept'),s.action('o',b.id,'accept')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
  assert.equal(s.records().filter(r => r.status === 'accepted').length,1);
});
test('failed reminder persistence retries without losing the reminder', async () => {
  const { service: s, repo, time } = setup();
  const r = await s.request('m','g',2); await s.action('o',r.id,'accept'); await s.action('m',r.id,'report'); await s.action('o',r.id,'confirm');
  time('2026-02-26T12:00:00Z'); repo.save = async () => { throw new Error('disk failure'); };
  await assert.rejects(s.reminders());
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('renew:')).length,0);
  repo.save = async () => {}; await s.reminders();
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('renew:')).length,1);
  time('2026-02-28T12:00:00Z'); await s.reminders(); await s.reminders();
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('renew:')).length,2);
});
