/**
 * BuyYourShare - Suite di Test Separazione UI Pubblica & Sicurezza RBAC Admin Server-Side
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'http://localhost:3000';

async function runRBACTestSuite() {
  console.log('====================================================');
  console.log('  TEST SEPARAZIONE UI PUBBLICA & SICUREZZA RBAC     ');
  console.log('====================================================\n');

  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const authRouteJs = fs.readFileSync(path.join(__dirname, '../server/routes/auth.js'), 'utf8');

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

  // --- TEST 1: VISITATORE ANONIMO (Controllo Codice Sorgente UI) ---
  console.log('[TEST 1] Verifica Assenza Totale Elementi Demo per Utente Anonimo...');
  assert('index.html non contiene userSwitcher statico', !indexHtml.includes('id="userSwitcher"'));
  assert('index.html non contiene pulsanti admin o config', !indexHtml.includes('btnOpenGatewayConfigHeader') && !indexHtml.includes('⚙️ Admin'));
  assert('app.js non contiene "Accesso Rapido Demo"', !appJs.includes('Accesso Rapido Demo') && !appJs.includes('btn-demo-quick'));
  assert('app.js non contiene switchUser()', !appJs.includes('authService.switchUser('));
  assert('server/routes/auth.js non contiene endpoint backdoor switch-demo', !authRouteJs.includes('/switch-demo'));

  // --- TEST 2: PAGINA LOGIN ---
  console.log('\n[TEST 2] Verifica Campi Login Vuoti...');
  assert('Campo login email default vuoto', appJs.includes('value="${escapeHtml(emailPrefill || \'\')}"'));
  assert('Campo login password default vuoto', appJs.includes('id="loginPassword" class="form-input" placeholder="••••••••" value=""'));
  assert('Nessun suggerimento Default: Password123!', !appJs.includes('Default: Password123!'));

  // --- TEST 3: SICUREZZA RBAC SERVER-SIDE SULL\'AREA ADMIN ---
  console.log('\n[TEST 3] Verifica Autorizzazione Server-Side Area Admin...');
  
  // 3A: Anonimo tenta accesso a /api/ledger/admin
  const anonAdminResp = await fetch(`${BASE_URL}/api/ledger/admin`);
  assert('Utente Anonimo bloccato da /api/ledger/admin (HTTP 401/403)', anonAdminResp.status === 401 || anonAdminResp.status === 403);

  // 3B: Login Membro (Elena Conti)
  const memberLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'elena.conti@example.com', password: 'Password123!' })
  })).json();
  
  const memberAdminResp = await fetch(`${BASE_URL}/api/ledger/admin`, {
    headers: { 'Authorization': `Bearer ${memberLogin.token}` }
  });
  assert('Membro (Elena Conti) bloccato da area Admin con HTTP 403 Forbidden', memberAdminResp.status === 403);

  // 3C: Login Capogruppo (Marco Rossi)
  const ownerLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marco.rossi@example.com', password: 'Password123!' })
  })).json();
  
  const ownerAdminResp = await fetch(`${BASE_URL}/api/ledger/admin`, {
    headers: { 'Authorization': `Bearer ${ownerLogin.token}` }
  });
  assert('Capogruppo (Marco Rossi) bloccato da area Admin con HTTP 403 Forbidden', ownerAdminResp.status === 403);

  // 3D: Login Admin Autenticato (admin@buyyourshare.com)
  const adminLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
  })).json();
  
  const adminAdminResp = await fetch(`${BASE_URL}/api/ledger/admin`, {
    headers: { 'Authorization': `Bearer ${adminLogin.token}` }
  });
  const adminData = await adminAdminResp.json();
  assert('Admin Ufficiale autorizzato ad accedere all\'Audit Ledger (HTTP 200)', adminAdminResp.ok && adminData.success);

  // --- TEST 5: MARKETPLACE ---
  console.log('\n[TEST 5] Verifica Marketplace con Solo Gruppo Reale...');
  const marketResp = await (await fetch(`${BASE_URL}/api/groups`)).json();
  assert(
    'Marketplace mostra ESCLUSIVAMENTE il gruppo reale di Marco Rossi (1 gruppo)',
    marketResp.groups.length === 1 && 
    marketResp.groups[0].id === 'grp-1787066374922' &&
    marketResp.groups[0].planName === 'Spotify Family (6 Account)' &&
    marketResp.groups[0].availableSlots === 5
  );

  // --- TEST 6: PAYPAL SUBSCRIPTION & LEDGER ---
  console.log('\n[TEST 6] Verifica Integrità Subscription PayPal I-MDJSFS3MRVBY e Ledger...');
  const statusResp = await (await fetch(`${BASE_URL}/api/webhooks/paypal/status`)).json();
  const sub = statusResp.activeSubscriptions.find(s => s.paypalSubscriptionId === 'I-MDJSFS3MRVBY');
  const cycle = statusResp.recordedCycles.find(c => c.subscriptionId === 'I-MDJSFS3MRVBY');
  assert('Subscription I-MDJSFS3MRVBY attiva', sub && sub.status === 'ACTIVE');
  assert('Ledger Ciclo 1 integro con Payout PAID', cycle && cycle.payoutStatus === 'PAID');

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO: ${passed} TEST PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runRBACTestSuite();
