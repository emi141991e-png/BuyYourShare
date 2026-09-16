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
    groups: [{ id: 'group', ownerId: 'leader', customServiceName: 'Test Group', planName: 'Test Plan', totalSlots: 3, ownerSlots: 1, availableSlots: 2, realSubscriptionCostCents: 900, baseMemberShareCents: 300, status: 'PUBLISHED' }],
    memberships: [], services: [], accessInstructions: [{ groupId: 'group', instructions: 'private access' }],
    chats: [], chatMessages: [], connectedAccounts: [], notifications: [], financialAuditLogs: [],
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
  for (const url of ['/api/groups', '/api/groups/my', '/api/memberships/my', '/api/access/group', '/api/chat/group', '/api/ledger', '/api/notifications', '/api/p2p/direct-memberships']) {
    assert.equal((await request(url, null)).status, 401, url);
    assert.equal((await request(url, 'unpaid')).status, 402, url);
    assert.equal((await request(url, 'expired')).status, 402, url);
  }
  assert.equal((await request('/api/p2p/subscription', 'unpaid')).status, 200);
  assert.equal((await request('/api/groups', 'member', {})).body.error, 'P2P_LEADER_PLAN_REQUIRED');
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
  assert.equal((await request('/api/p2p/groups/group/request', 'member', { slotNumber: 2 })).status, 503);
  const payee = await request('/api/p2p/payee', 'leader');
  assert.equal(payee.body.available, false);
  const stored = JSON.parse(readFileSync(dbFile, 'utf8'));
  assert.equal(stored.memberships.length, 0);
});
test('leader cannot publish a group without a verified PayPal recipient', async () => {
  const r = await request('/api/groups', 'leader', { customServiceName: 'New group', realCostEuros: '12', totalSlots: '4', ownerSlots: '1' });
  assert.equal(r.status, 503);
  assert.equal(JSON.parse(readFileSync(dbFile, 'utf8')).groups.length, 1);
});
test('legacy administrative cleanup cannot orphan paying users or erase subscription history', async () => {
  assert.equal((await request('/api/admin/clean-all-data', 'admin', {})).status, 409);
  assert.equal((await request('/api/admin/sync-database-clean', 'admin', {})).status, 409);
  const stored = JSON.parse(readFileSync(dbFile, 'utf8'));
  assert.equal(stored.users.length, 6); assert.equal(stored.p2pSubscriptions.length, 4);
});
