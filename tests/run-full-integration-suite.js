/**
 * Integration Test Suite Runner on Dedicated Port 3088
 */

process.env.PORT = '3088';
process.env.PAYPAL_MODE = 'live';
process.env.PAYPAL_SAFETY_LOCK = 'true';

import { dataRepository } from '../server/db/dataRepository.js';

const BASE_URL = 'http://localhost:3088';

async function runAll() {
  // Start server
  await import('../server/index.js');
  console.log('Server started on 3088.');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title} ${extra}`);
      failed++;
    }
  }

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthData = await healthRes.json();
  assert('GET /api/health risponde 200 OK', healthRes.status === 200);

  // 2. Login Admin
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
  });
  const adminAuth = await loginRes.json();
  assert('Login Admin 200 OK', adminAuth.success && adminAuth.user?.role === 'admin');
  const adminToken = adminAuth.token;

  // 3. Login Member & Owner
  const memLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'elena.conti@example.com', password: 'Password123!' })
  })).json();
  const ownLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marco.rossi@example.com', password: 'Password123!' })
  })).json();

  // 4. Admin Dashboard
  const dashRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert('Admin accede a /api/admin/dashboard (200 JSON)', dashRes.status === 200);
  const dashData = await dashRes.json();
  assert('Dashboard metriche presenti', !!dashData.metrics?.users);

  // 5. Admin Users & Bank Data Verification
  const usersRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const usersData = await usersRes.json();
  assert('Admin accede a /api/admin/users (200 JSON)', usersRes.status === 200);
  const anyIban = usersData.users.some(u => u.iban || u.bankName);
  assert('Nessun dato bancario fittizio restituito per gli utenti', !anyIban);

  // 6. RBAC Tests
  const anonRes = await fetch(`${BASE_URL}/api/admin/dashboard`);
  assert('Anonimo riceve 401/403 su /api/admin/dashboard', anonRes.status === 401 || anonRes.status === 403);

  const memRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${memLogin.token}` }
  });
  assert('Membro riceve 403 Forbidden su /api/admin/dashboard', memRes.status === 403);

  const ownRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${ownLogin.token}` }
  });
  assert('Capogruppo riceve 403 Forbidden su /api/admin/dashboard', ownRes.status === 403);

  // 7. Safety Lock Verification on Live Checkout
  const actRes = await fetch(`${BASE_URL}/api/checkout/paypal/subscription-activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memLogin.token}`
    },
    body: JSON.stringify({
      subscriptionId: 'I-TESTLOCK12345',
      sessionData: { groupId: 'grp-1787066374922', slotNumber: 2, baseShareCents: 350 }
    })
  });
  assert('Safety Lock blocca transazioni PayPal live (HTTP 423 Locked)', actRes.status === 423);

  // 8. Marketplace Integrity
  const marketRes = await fetch(`${BASE_URL}/api/groups`);
  const marketData = await marketRes.json();
  assert('Marketplace contiene solo 1 gruppo reale', marketData.groups.length === 1);
  assert('Il gruppo nel Marketplace è quello di Marco Rossi', marketData.groups[0].id === 'grp-1787066374922');

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO SUITE INTEGRATA: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runAll();
