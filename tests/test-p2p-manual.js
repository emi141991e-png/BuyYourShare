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

test('expiry alerts and member renewal reminders are deduplicated without chasing leaders', async () => {
  const { service: s, repo, time } = setup();
  const first = await s.request('m', 'g', 2); await s.action('o', first.id, 'accept');
  time('2026-02-03T12:00:00Z'); await s.reminders(); await s.reminders();
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('reservation-expired')).length, 2);
  const second = await s.request('m', 'g', 2); await s.action('o', second.id, 'accept'); await s.action('m', second.id, 'report'); await s.action('o', second.id, 'confirm');
  time('2026-03-04T12:00:00Z'); await s.reminders(); await s.reminders();
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('leader-renew:')).length, 0);
  assert.equal(repo.data.notifications.filter(n => n.id.startsWith('renew:') && n.userId === 'm').length, 1);
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

 test('receipt photos stay private, deduplicate retries and roll back failed saves',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bys-receipt-'));const old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 try{const {service:s,repo}=setup();const r=await s.request('m','g',2);const attachment={data:'data:image/jpeg;base64,'+Buffer.from([255,216,255,224,255,217]).toString('base64')};
 await assert.rejects(s.send('stranger',r.id,'','file-1',attachment));
 await assert.rejects(s.send('m',r.id,'','bad',{data:'data:image/svg+xml;base64,PHN2Zz4='}));
 await s.send('m',r.id,'','file-1',attachment);await s.send('m',r.id,'','file-1',attachment);
 const msg=s.chat('o',r.id).at(-1);assert.ok(msg.attachment);assert.equal((await s.attachment('o',r.id,msg.id)).data,attachment.data);
 await assert.rejects(s.attachment('stranger',r.id,msg.id));await assert.rejects(s.attachment('m','wrong',msg.id));
 assert.equal((await fs.readdir(path.join(dir,'private-chat-attachments'))).length,1);
 repo.save=async()=>{throw new Error('disk failure')};await assert.rejects(s.send('m',r.id,'','file-2',attachment));assert.equal((await fs.readdir(path.join(dir,'private-chat-attachments'))).length,1);
 }finally{if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;await fs.rm(dir,{recursive:true,force:true});}
 });

test('scheduled exit preserves paid time, frees only at expiry, sends availability once',async()=>{
 const {service:s,repo,time}=setup();const r=await s.request('m','g',2);await s.action('o',r.id,'accept');await s.action('m',r.id,'report');await s.action('o',r.id,'confirm');
 await assert.rejects(s.action('o',r.id,'schedule-exit'));await s.action('m',r.id,'schedule-exit');await s.reminders();assert.equal(r.status,'confirmed');await assert.rejects(s.action('m',r.id,'report'));
 repo.data.groups[0].customServiceName='Example';repo.data.groups[0].totalSlots=2;
 await s.community.watch('other',{service:'Example'});await s.reminders();assert.equal(repo.data.notifications.filter(n=>n.id.startsWith('availability:')).length,0);
 time(r.periodEnd);await s.reminders();assert.equal(r.status,'canceled');assert.equal(repo.data.memberships[0].status,'CANCELED');assert.equal(repo.data.notifications.filter(n=>n.id.startsWith('availability:')).length,1);await s.reminders();assert.equal(repo.data.notifications.filter(n=>n.id.startsWith('availability:')).length,1);
});
test('requirements are owner controlled, acknowledged and snapshotted; issues private and deduplicated',async()=>{
 const {service:s,repo}=setup();const q={country:'Italia',accessMethod:'Invito',eligibility:'Requisiti del fornitore'};
 await assert.rejects(s.community.updateRequirements('m','g',q));await s.community.updateRequirements('o','g',q);await assert.rejects(s.request('m','g',2));const r=await s.request('m','g',2,true);assert.deepEqual(r.requirementsAccepted,q);
 const x=await s.community.issue('m',{groupId:'g',requestId:r.id,description:'Non ho ricevuto accesso'});assert.equal((await s.community.issue('m',{groupId:'g',description:'Altra descrizione valida'})).id,x.id);assert.equal(s.community.list('other').issues.length,0);await assert.rejects(s.community.issue('other',{groupId:'g',requestId:r.id,description:'Accesso non consentito'}));
 repo.save=async()=>{throw new Error('disk')};await assert.rejects(s.community.watch('m',{service:'Example'}));assert.equal((repo.data.groupWatches||[]).length,0);
});

 test('unpaid leader manages own group but cannot join someone else', async()=>{
 const {service:s,repo}=setup();repo.data.groups[0].ownerId='unpaid';
 const r=await s.request('m','g',2);await s.action('unpaid',r.id,'accept');
 await s.action('m',r.id,'report');await s.action('unpaid',r.id,'confirm');
 assert.equal(s.list('unpaid')[0].status,'confirmed');
 repo.data.groups.push({...repo.data.groups[0],id:'other-group',ownerId:'someone'});
 await assert.rejects(s.request('unpaid','other-group',2),e=>e.status===402||e.code==='P2P_ACTIVE_SUBSCRIPTION_REQUIRED');
 });

test('PDF receipts are private, validated, deduplicated and rolled back on save failure',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bys-pdf-')),old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 try{const {service:s,repo}=setup(),r=await s.request('m','g',2);
 const attachment={data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF').toString('base64')};
 await s.send('m',r.id,'','pdf-one',attachment);await s.send('m',r.id,'','pdf-one',attachment);
 const msg=s.chat('o',r.id).at(-1);assert.equal(msg.attachment.mime,'application/pdf');
 assert.equal((await s.attachment('o',r.id,msg.id)).data,attachment.data);
 await assert.rejects(s.attachment('stranger',r.id,msg.id));
 await assert.rejects(s.send('m',r.id,'','pdf-invalid',{data:'data:application/pdf;base64,'+Buffer.from('<html>not PDF</html>').toString('base64')}));
 assert.equal((await fs.readdir(path.join(dir,'private-chat-attachments'))).length,1);
 repo.save=async()=>{throw new Error('disk failure')};await assert.rejects(s.send('m',r.id,'','pdf-two',attachment));
 assert.equal((await fs.readdir(path.join(dir,'private-chat-attachments'))).length,1);
 }finally{if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;await fs.rm(dir,{recursive:true,force:true});}
});


test('report and receipt commit together, retry once, remain private and stop reminders',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'bys-report-')),old=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 try{
 const {service:s,repo,time}=setup(),r=await s.request('m','g',2);await s.action('o',r.id,'accept');
 const attachment={data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\n%%EOF').toString('base64')};
 await assert.rejects(s.action('o',r.id,'report',null,attachment));
 await assert.rejects(s.action('stranger',r.id,'report',null,attachment));
 repo.save=async()=>{throw new Error('disk failure')};
 await assert.rejects(s.action('m',r.id,'report',null,attachment));
 assert.equal(s.list('m')[0].status,'accepted');
 assert.equal((await fs.readdir(path.join(dir,'private-chat-attachments'))).length,0);
 repo.save=async()=>{};
 await s.action('m',r.id,'report',null,attachment);await s.action('m',r.id,'report',null,attachment);
 const reported=s.list('o')[0];assert.equal(reported.status,'reported');assert.ok(reported.receiptMessageId);
 assert.equal((await s.attachment('o',r.id,reported.receiptMessageId)).data,attachment.data);
 await assert.rejects(s.attachment('stranger',r.id,reported.receiptMessageId));
 assert.equal(repo.data.notifications.filter(n=>n.id.startsWith('report:')).length,1);
 assert.equal((await fs.readdir(path.join(dir,'private-chat-attachments'))).length,1);
 time('2026-02-05T12:00:00Z');await s.reminders();assert.equal(s.list('m')[0].status,'reported');
 await s.action('o',r.id,'confirm');time('2026-03-04T12:00:00Z');
 await s.action('m',r.id,'report');assert.equal(s.list('o')[0].receiptMessageId,null);
 await s.reminders();assert.equal(repo.data.notifications.filter(n=>n.id.startsWith('renew:')).length,0);
 }finally{if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;await fs.rm(dir,{recursive:true,force:true});}
});

test('chat retries and stale tabs cannot confirm or report the next period',async()=>{
 const {service:s,repo,time}=setup();const r=await s.request('m','g',2);await s.action('o',r.id,'accept');
 await Promise.all([s.action('m',r.id,'report',null),s.action('m',r.id,'report',null)]);
 await Promise.all([s.action('o',r.id,'confirm',null),s.action('o',r.id,'confirm',null)]);
 assert.equal(repo.data.p2pManualConfirmations.length,1);const firstEnd=r.periodEnd;
 time('2026-02-27T12:00:00Z');
 await assert.rejects(s.action('m',r.id,'report',null));
 await s.action('m',r.id,'report',firstEnd);
 await assert.rejects(s.action('o',r.id,'confirm',null));
 assert.equal(r.status,'reported');assert.equal(repo.data.p2pManualConfirmations.length,1);
 await s.action('o',r.id,'confirm',firstEnd);assert.equal(repo.data.p2pManualConfirmations.length,2);
});


test('reservation reminder arrives once before expiry and report preserves the seat', async () => {
 const {service:s,repo,time}=setup(); const r=await s.request('m','g',2);await s.action('o',r.id,'accept');
 await s.reminders();assert.equal(repo.data.notifications.filter(n=>n.id.startsWith('reservation-reminder:')).length,0);
 time('2026-02-01T12:00:00Z');await s.reminders();await s.reminders();
 assert.equal(repo.data.notifications.filter(n=>n.id.startsWith('reservation-reminder:')).length,1);
 await s.action('m',r.id,'report',null);time('2026-02-04T12:00:00Z');await s.reminders();
 assert.equal(r.status,'reported');await assert.rejects(s.request('other','g',2));
});
