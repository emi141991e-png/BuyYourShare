import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

let child, base, dbFile;
const end = new Date(Date.now() + 86400000).toISOString();
before(async () => {
  const dir = mkdtempSync(path.resolve('..', 'p2p-http-test-'));
  dbFile = path.join(dir, 'database.json');
  const users = ['member', 'leader', 'unpaid', 'other', 'expired', 'admin'].map(id => ({ id, email: `${id}@example.test`, fullName: id, role: id === 'admin' ? 'admin' : 'user' }));
  writeFileSync(dbFile, JSON.stringify({ users,
    sessions: users.map(u => ({ userId: u.id, token: `test-${u.id}`, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), expiresAt: end })),
    groups: [{ id: 'group', ownerId: 'leader', customServiceName: 'Test Group', planName: 'Test Plan', totalSlots: 3, ownerSlots: 1, availableSlots: 2, realSubscriptionCostCents: 900, baseMemberShareCents: 300, status: 'PUBLISHED', manualPaymentDestination: { paypalEmail: 'private@example.test' } }],
    memberships: [], services: [], accessInstructions: [{ groupId: 'group', instructions: 'private access' }],
    chats: [], chatMessages: [], connectedAccounts: [], notifications: [{ id: 'n-member', userId: 'member', isRead: false }, { id: 'n-other', userId: 'other', isRead: false }, { id: 'n-second', userId: 'member', isRead: false }], financialAuditLogs: [],
    systemConfig: { securityHardeningV1: 'fixture' },
    p2pSubscriptions: ['member', 'leader', 'other', 'expired'].map(userId => ({ userId, role: userId === 'leader' ? 'GROUP_LEADER' : 'MEMBER', status: 'active', currentPeriodEnd: userId === 'expired' ? '2020-01-01' : end }))
  }));
  const port = 39000 + Math.floor(Math.random() * 10000); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, DATABASE_PATH: dbFile,
      P2P_BILLING_ENABLED: 'true', P2P_PAYPAL_MODE: 'sandbox', P2P_PAYPAL_WEBHOOK_ID: 'WH-TEST', PAYPAL_SAFETY_LOCK: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10000);
    child.stdout.on('data', chunk => { output += chunk; if (output.includes('Backend Server')) { clearTimeout(timeout); resolve(); } });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
});
after(() => { child?.kill(); });
async function request(url, user = 'member', body) {
  const r = await fetch(base + url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer test-${user}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
}
test('actual server gates every user P2P surface and retains subscription management for unpaid users', async () => {
  assert.equal((await request('/api/p2p/subscription/sdk-start', null, {})).status, 401);
  assert.equal((await request('/api/p2p/subscription/sdk-start', 'unpaid', {})).status, 503);
  assert.equal((await request('/api/p2p/subscription/start', 'unpaid', {role:'MEMBER'})).body.error, 'P2P_PAYPAL_TEMPORARILY_DISABLED');
  assert.equal((await request('/api/p2p/subscription', 'unpaid')).body.paypalAvailable, false);
  assert.deepEqual((await request('/api/p2p/subscription', 'unpaid')).body.checkout, { enabled: false });
  for (const url of ['/api/groups/my', '/api/memberships/my', '/api/access/group', '/api/chat/group', '/api/ledger', '/api/p2p/direct-memberships']) {
    assert.equal((await request(url, null)).status, 401, url);
    assert.equal((await request(url, 'unpaid')).status, 402, url);
    assert.equal((await request(url, 'expired')).status, 402, url);
  }
  assert.equal((await request('/api/p2p/subscription', 'unpaid')).status, 200);
  assert.equal((await request('/api/groups', 'member', {})).body.error, 'PAYMENT_DESTINATION_REQUIRED');
  for (const user of [null, 'unpaid', 'expired']) assert.equal((await request('/api/groups', user)).status, 200);
  assert.equal((await request('/api/notifications', 'unpaid')).status, 200);
});
test('legacy collection, payout onboarding and unsigned webhooks cannot move money', async () => {
  for (const url of ['/api/checkout/create-session', '/api/checkout/paypal/activate', '/api/connect/onboarding-link']) {
    assert.equal((await request(url, 'member', {})).status, 410);
  }
  assert.equal((await request('/api/webhooks/paypal', null, {})).status, 503);
  assert.equal((await request('/api/webhooks/p2p-paypal', null, {})).status, 400);
});
test('manual confirmation is disabled and unconfigured PayPal quota fails closed', async () => {
  assert.equal((await request('/api/access/group')).status, 403);
  assert.equal((await request('/api/p2p/requests/unknown/confirm', 'leader', { paymentReceived: true })).status, 410);
  assert.equal((await request('/api/p2p/groups/group/direct-payment', 'member')).status, 410);
  assert.equal((await request('/api/p2p/groups/group/request', 'member', { slotNumber: 2 })).status, 410);
  const payee = await request('/api/p2p/payee', 'leader');
  assert.equal(payee.body.available, false);
  const stored = JSON.parse(readFileSync(dbFile, 'utf8'));
  assert.equal(stored.memberships.length, 0);
});
test('leader cannot publish without manual payment destination', async () => {
  const r = await request('/api/groups', 'leader', { customServiceName: 'New group', realCostEuros: '12', totalSlots: '4', ownerSlots: '1' });
  assert.equal(r.status, 400);
  assert.equal(JSON.parse(readFileSync(dbFile, 'utf8')).groups.length, 1);
});
test('legacy administrative cleanup cannot orphan paying users or erase subscription history', async () => {
  assert.equal((await request('/api/admin/clean-all-data', 'admin', {})).status, 409);
  assert.equal((await request('/api/admin/sync-database-clean', 'admin', {})).status, 409);
  const stored = JSON.parse(readFileSync(dbFile, 'utf8'));
  assert.equal(stored.users.length, 6); assert.equal(stored.p2pSubscriptions.length, 4);
});

test('admin overview is protected, current and excludes private chat and payment destinations', async () => {
  assert.equal((await request('/api/admin/p2p-overview', null)).status, 401);
  assert.equal((await request('/api/admin/p2p-overview', 'member')).status, 403);
  const r = await request('/api/admin/p2p-overview', 'admin');
  assert.equal(r.status, 200);
  assert.equal(r.body.activeCount, 3);
  assert.equal(r.body.subscriptions.find(s => s.userId === 'expired').status, 'past_due');
  assert.equal(JSON.stringify(r.body).includes('private@example.test'), false);
  assert.equal((await request('/api/admin/assign-membership', 'admin', {})).status, 410);
  assert.equal((await request('/api/admin/sync-group-slots', 'admin', {})).status, 410);
});

test('admin can close and republish a group without leaving it hidden', async () => {
  for (const status of ['CLOSED', 'PUBLISHED']) {
    const r = await fetch(base + '/api/admin/groups/group/status', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin' }, body: JSON.stringify({ status }) });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.group.isPublished, status === 'PUBLISHED');
  }
});

test('manual HTTP lifecycle protects recipient and private messages', async () => {
  const catalogue = await request('/api/groups', null);
  assert.equal(JSON.stringify(catalogue.body).includes('private@example.test'), false);
  assert.equal((await request('/api/manual/groups/group/request', 'unpaid', { slotNumber: 2 })).status, 402);
  assert.equal((await request('/api/manual/groups/group/request', 'member', { slotNumber: 2 })).status, 200);
  const r = (await request('/api/manual')).body.requests[0];
  assert.equal(r.paymentDestination, undefined);
  assert.equal((await request(`/api/manual/${r.id}/messages`, 'other')).status, 403);
  assert.equal((await request(`/api/manual/${r.id}/accept`, 'leader', {})).status, 200);
  assert.equal((await request('/api/manual')).body.requests[0].paymentDestination.paypalEmail, 'private@example.test');
  await request(`/api/manual/${r.id}/messages`, 'member', { content: 'Accordiamoci sul pagamento' });
  assert.ok((await request(`/api/manual/${r.id}/messages`, 'leader')).body.messages.some(m => m.messageContent === 'Accordiamoci sul pagamento'));
  assert.equal((await request(`/api/manual/${r.id}/report`, 'member', {})).status, 200);
  assert.equal((await request('/api/access/group')).status, 403);
  assert.equal((await request(`/api/manual/${r.id}/confirm`, 'leader', {})).status, 200);
  assert.equal((await request('/api/access/group')).status, 200);
  const publicGroup = await request('/api/groups/group', null);
  assert.equal(publicGroup.body.group.slotsInfo.slots[1].assignedUser, null);
  assert.equal((await request(`/api/manual/${r.id}/messages`, 'other', { content: 'intrusion' })).status, 403);
  assert.equal((await request('/api/auth/delete-account', 'member', {})).status,409);
  assert.equal((await request('/api/groups/my/', 'unpaid')).status,402);
});

test('push registration requires authentication and explicit consent; devices cannot be removed by others', async () => {
  assert.equal((await request('/api/push/config', null)).status,401);
  const config = await request('/api/push/config'); assert.equal(config.status,200); assert.ok(config.body.publicKey); assert.equal(config.body.privateKey,undefined);
  const subscription = { endpoint:'https://fcm.googleapis.com/fcm/send/http-test-only', keys:{ p256dh:Buffer.alloc(65,4).toString('base64url'), auth:Buffer.alloc(16,1).toString('base64url') } };
  assert.equal((await request('/api/push/subscribe', 'member', { subscription })).status,400);
  const registered = await request('/api/push/subscribe', 'member', { subscription, consent:true }); assert.equal(registered.status,200);
  assert.equal((await request(`/api/push/${registered.body.id}/remove`, 'other', {})).status,404);
  assert.equal((await request(`/api/push/${registered.body.id}/remove`, 'member', {})).status,200);
  for (const asset of ['/push-sw.js','/manifest.webmanifest','/push-icon-192.png']) assert.equal((await fetch(base+asset)).status,200);
  assert.equal((await fetch(base+'/server/data/push-vapid.json')).status,404);
});

test('personal area isolates owned groups and only leaders can edit access instructions', async () => {
  const leader = (await request('/api/manual', 'leader')).body;
  assert.equal(leader.ownedGroups.length, 1);
  assert.equal((await request('/api/manual', 'member')).body.ownedGroups.length, 0);
  assert.equal(leader.requests[0].memberName, 'member');
  assert.equal((await request('/api/manual', 'member')).body.requests[0].ownerName, 'leader');
  assert.equal((await request('/api/access/group', 'member', { instructions:'not allowed' })).status, 403);
  assert.equal((await request('/api/access/group', 'leader', { instructions:'Updated test instructions', accessUrl:'https://example.test/' })).status, 200);
  assert.equal((await request('/api/access/group', 'member')).body.instructions.instructions, 'Updated test instructions');
  assert.equal((await request('/api/access/group', 'other')).status, 403);
});

 test('notification read actions are authenticated, selective and isolated by owner', async () => {
  assert.equal((await request('/api/notifications/read', null, {})).status, 401);
  assert.equal((await request('/api/notifications/read', 'member', { ids: 'bad' })).status, 400);
  assert.equal((await request('/api/notifications/read', 'member', { ids: ['n-member', 'n-other'] })).status, 200);
  const mine = (await request('/api/notifications', 'member')).body.notifications;
  assert.equal(mine.find(n => n.id === 'n-member').isRead, true);
  assert.equal(mine.find(n => n.id === 'n-second').isRead, false);
  assert.ok(!mine.some(n => n.id === 'n-other'));
  assert.equal((await request('/api/notifications', 'other')).body.notifications.find(n => n.id === 'n-other').isRead, false);
  await request('/api/notifications/read', 'member', {});
  assert.ok((await request('/api/notifications', 'member')).body.notifications.every(n => n.isRead));
 });

test('bank HTTP flow requires administrator confirmation and isolates user history', async () => {
  assert.equal((await request('/api/p2p/bank', null)).status, 401);
  const payment = (await request('/api/p2p/bank/report', 'expired', {})).body;
  assert.equal((await request('/api/p2p/subscription', 'expired')).body.subscription.accessAllowed, false);
  assert.equal((await request('/api/admin/bank-payments', 'member')).status, 403);
  assert.equal((await request(`/api/admin/bank-payments/${payment.id}/confirm`, 'expired', {reference:'TEST-TRN-HTTP'})).status, 403);
  assert.equal((await request(`/api/admin/bank-payments/${payment.id}/confirm`, 'admin', {reference:'TEST-TRN-HTTP'})).status, 200);
  assert.equal((await request('/api/p2p/subscription', 'expired')).body.subscription.accessAllowed, true);
  assert.equal((await request('/api/p2p/bank', 'unpaid')).body.payments.length, 0);
});
