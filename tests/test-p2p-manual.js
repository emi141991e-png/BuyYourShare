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
