import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLegacyMigration } from '../server/services/p2pLegacyMigration.js';
import { P2pSubscriptions } from '../server/services/p2pSubscription.js';
const now = new Date('2026-09-16T12:00:00Z');
const data = () => ({ memberships: [{ id: 'm', userId: 'u', groupId: 'g', paypalSubscriptionId: 'I-old' }], groups: [] });
const remote = () => ({ id: 'I-old', status: 'CANCELLED', custom_id: JSON.stringify({memberId:'u',groupId:'g'}),
  billing_info: {last_payment:{time:'2026-08-22T12:00:00Z',amount:{currency_code:'EUR',value:'4.99'}}} });
test('verified cancellation preserves paid access and is idempotent without mutating input', async () => {
  const original=data(); const provider={get:async()=>remote()};
  const result=await prepareLegacyMigration(original,provider,['I-old'],now);
  assert.equal(result.memberships[0].currentPeriodEnd,'2026-09-22T12:00:00.000Z');
  assert.equal(result.p2pSubscriptions[0].status,'active');
  assert.equal(result.p2pSubscriptions[0].cancelAtPeriodEnd,true);
  assert.equal(original.memberships[0].legacyBillingEndedAt,undefined);
  assert.equal(await prepareLegacyMigration(result,provider,['I-old'],now),null);
});
test('active, foreign, unpaid and unauthorized legacy subscriptions fail closed', async () => {
  for (const alter of [r=>r.status='ACTIVE',r=>r.custom_id='{}',r=>r.billing_info={},r=>r.billing_info.last_payment.amount.value='invalid']) {
    const r=remote(); alter(r);
    await assert.rejects(prepareLegacyMigration(data(),{get:async()=>r},['I-old'],now));
  }
  await assert.rejects(prepareLegacyMigration(data(),{get:async()=>remote()},[],now));
});
test('expired paid period grants no new access; existing subscription is preserved', async () => {
  const d=data(); d.p2pSubscriptions=[{userId:'u',providerSubscriptionId:'I-new',status:'active'}];
  const result=await prepareLegacyMigration(d,{get:async()=>remote()},['I-old'],new Date('2026-10-01'));
  assert.equal(result.memberships[0].status,'EXPIRED');
  assert.deepEqual(result.p2pSubscriptions,d.p2pSubscriptions);
});
test('migration credit cannot be billed early and creates a fresh request after expiry', async () => {
  const migrated=await prepareLegacyMigration(data(),{get:async()=>remote()},['I-old'],now);
  let calls=0; let clock=now.getTime();
  const provider={validatePlans:async()=>({MEMBER:'P-member',GROUP_LEADER:'P-leader'}),create:async record=>{
    calls++; assert.ok(record.requestId); assert.ok(record.customId); assert.equal(record.planId,'P-member');
    return {id:'I-new',status:'APPROVAL_PENDING'};
  }};
  const service=new P2pSubscriptions({data:migrated,save:async()=>{}},provider,{now:()=>clock,enabled:()=>true});
  assert.equal((await service.start('u','MEMBER')).status,'active'); assert.equal(calls,0);
  clock=Date.parse('2026-09-23');
  assert.equal((await service.start('u','MEMBER')).status,'pending'); assert.equal(calls,1);
});
