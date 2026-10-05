import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { PushNotifications, validatePushSubscription, loadPushKeys } from '../server/services/pushNotifications.js';

const subscription = (suffix = 'test') => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } });
function setup(send) {
  let now = Date.parse('2026-09-20T12:00:00Z');
  let queue = Promise.resolve(); const calls = [];
  const repo = { data: { users: [{ id: 'member' }], p2pManualRequests: [], notifications: [] }, save: async () => {} };
  const serial = { repo, exclusive: fn => { const p = queue.catch(() => {}).then(fn); queue = p; return p; } };
  const keys = webpush.generateVAPIDKeys();
  const push = new PushNotifications(serial, { now: () => now, keys: () => keys, send: async (...args) => { calls.push(args); if (send) return send(...args); return { statusCode: 201 }; } });
  const reminder = (phase = 'before') => {
    const r = { id: 'request', userId: 'member', status: 'confirmed', periodEnd: '2026-09-22T12:00:00.000Z' };
    repo.data.p2pManualRequests = [r];
    const n = { id: `renew:${r.id}:${r.periodEnd}:${phase}`, userId: 'member', requestId: r.id, createdAt: new Date(now).toISOString() };
    repo.data.notifications.push(n); return r;
  };
  return { push, repo, calls, serial, keys, reminder, time: value => { now = Date.parse(value); } };
}
test('push endpoints reject local addresses, arbitrary HTTPS hosts, credentials and invalid keys', () => {
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://evil.test/x', 'https://fcm.googleapis.com.evil.test/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x']) assert.throws(() => validatePushSubscription({ ...subscription(), endpoint }));
  assert.throws(() => validatePushSubscription({ ...subscription(), keys: {} }));
  assert.equal(validatePushSubscription(subscription()).endpoint, subscription().endpoint);
});
test('persistent VAPID keys survive process restart without regeneration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bys-vapid-'));
  const first = loadPushKeys(dir); assert.deepEqual(loadPushKeys(dir), first);
  assert.equal(Buffer.from(first.publicKey, 'base64url').length, 65);
});
test('device ownership is enforced, registration idempotent, private key never returned', async () => {
  const { push, keys } = setup();
  const d = await push.subscribe('member', subscription(), 'Phone');
  assert.equal((await push.subscribe('member', subscription(), 'Phone')).id, d.id);
  await assert.rejects(push.subscribe('other', subscription(), 'Phone'));
  await assert.rejects(push.remove('other', d.id));
  await assert.rejects(push.test('other', d.id));
  assert.equal(JSON.stringify(push.config('member')).includes(keys.privateKey), false);
  assert.deepEqual(push.config('other').devices, []);
});
test('renewal delivered once per device across worker restart and contains no personal data', async () => {
  const { push, calls, reminder, serial, keys } = setup();
  await push.subscribe('member', subscription()); reminder();
  await push.flush(); await push.flush();
  const restarted = new PushNotifications(serial, { now: push.now, keys: () => keys, send: async () => { throw new Error('must not send twice'); } });
  await restarted.flush(); assert.equal(calls.length, 1);
  const payload = JSON.parse(calls[0][1]);
  assert.equal(payload.url, '/#privata-request'); assert.equal(payload.body.includes('member'), false);
  assert.equal(calls[0][2].TTL, 3600); assert.equal(calls[0][2].timeout, 10000);
});
test('temporary failures retry with backoff; expired subscriptions are removed', async () => {
  let failures = 1; const a = setup(() => { if (failures-- > 0) throw { statusCode: 503 }; });
  await a.push.subscribe('member', subscription()); a.reminder(); await a.push.flush();
  assert.equal(a.push.jobs()[0].status, 'pending'); await a.push.flush(); assert.equal(a.calls.length, 1);
  a.time('2026-09-20T12:03:00Z'); await a.push.flush(); assert.equal(a.calls.length, 2); assert.equal(a.push.jobs()[0].status, 'sent');
  const b = setup(() => { throw { statusCode: 410 }; });
  await b.push.subscribe('member', subscription()); b.reminder(); await b.push.flush(); assert.equal(b.push.devices().length, 0);
});
test('no historical reminders or obsolete payment requests get sent', async () => {
  const a = setup(); a.reminder(); a.time('2026-09-20T12:01:00Z'); await a.push.subscribe('member', subscription()); await a.push.flush(); assert.equal(a.calls.length, 0);
  const b = setup(() => { throw { statusCode: 503 }; }); await b.push.subscribe('member', subscription()); const r = b.reminder(); await b.push.flush();
  r.status = 'reported'; b.time('2026-09-20T12:03:00Z'); await b.push.flush(); assert.equal(b.calls.length, 1); assert.equal(b.push.jobs()[0].status, 'canceled');
});
test('test notification is queued, rate limited and delivered without a real transport', async () => {
  const { push, calls } = setup(); const d = await push.subscribe('member', subscription());
  await push.test('member', d.id); await assert.rejects(push.test('member', d.id)); await push.flush();
  assert.equal(calls.length, 1); assert.match(JSON.parse(calls[0][1]).body, /pronte/);
});
test('failed persistence rolls back registration and retries safely', async () => {
  const { push, repo } = setup(); repo.save = async () => { throw new Error('disk failure'); };
  await assert.rejects(push.subscribe('member', subscription())); assert.equal(push.devices().length, 0);
  repo.save = async () => {}; await push.subscribe('member', subscription()); assert.equal(push.devices().length, 1);
});
test('service worker always shows a notification and opens a same-origin page', async () => {
  const listeners = {}, shown = [], opened = [];
  const self = { location: { origin: 'https://market.example' }, addEventListener: (name, cb) => { listeners[name] = cb; },
    registration: { showNotification: async (...args) => shown.push(args) }, clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } };
  vm.runInNewContext(fs.readFileSync('push-sw.js', 'utf8'), { self, URL });
  let work; listeners.push({ data: { json: () => ({ body: 'Promemoria', url: 'https://evil.test' }) }, waitUntil: p => { work = p; } }); await work;
  assert.equal(shown.length, 1); assert.equal(shown[0][1].data.url, '/#notifiche');
  listeners.notificationclick({ notification: { close() {} }, waitUntil: p => { work = p; } }); await work;
  assert.equal(opened[0], 'https://market.example/#notifiche');
});
test('updated email library supports existing sendMail API without sending real mail', async () => {
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const result = await transport.sendMail({ from: 'test@example.test', to: 'member@example.test', subject: 'Test', text: 'Local test', html: '<p>Local test</p>' });
  assert.match(result.message, /Local test/);
});

test('private chat is pushed only to the recipient, once, without message text, with a direct chat link',async()=>{
 const f=setup();f.repo.data.groups=[{id:'group',ownerId:'leader'}];f.repo.data.users.push({id:'leader'},{id:'outsider'});
 f.repo.data.p2pManualRequests=[{id:'request',groupId:'group',userId:'member',status:'accepted'}];
 await f.push.subscribe('member',subscription('member'),'BYS','bys');await f.push.subscribe('leader',subscription('leader'));
 const n={id:'chat:1',requestId:'request',userId:'member',isRead:false,message:'Private text not for lockscreen',createdAt:'2026-09-20T12:00:00Z'};
 f.repo.data.notifications.push(n,{...n,id:'chat:evil',userId:'outsider'});
 await f.push.flush();await f.push.flush();assert.equal(f.calls.length,1);
 const payload=JSON.parse(f.calls[0][1]);assert.equal(payload.url,'/api/auth/p2p?next=%23privata-request');assert.match(payload.body,/messaggio/);assert.doesNotMatch(payload.body,/Private text/);assert.equal(f.calls[0][2].urgency,'high');
 f.repo.data.notifications.push({...n,id:'chat:2',isRead:true});await f.push.flush();assert.equal(f.calls.length,1);
});



test('BYS renewal push supports every one-time payment method and rejects obsolete expiry', async()=>{
 for(const paymentMethod of ['BANK','GOOGLE_PAY','APPLE_PAY','PAYPAL_ONETIME']){
  const f=setup();const end='2026-09-22T12:00:00.000Z';
  f.serial.find=()=>({paymentMethod,currentPeriodEnd:end});
  await f.push.subscribe('member',subscription());
  f.repo.data.notifications.push({id:`bank-renew:member:${end}:before`,userId:'member',bankPeriodEnd:end,createdAt:'2026-09-20T12:00:00.000Z'});
  await f.push.flush();assert.equal(f.calls.length,1,paymentMethod);
  assert.equal(f.push.relevant({...f.repo.data.notifications[0],bankPeriodEnd:'2026-09-21T12:00:00.000Z'}),false);
 }
});
