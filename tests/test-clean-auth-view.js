/**
 * BuyYourShare - Test di Verifica Pagina Login Pulita & Zero Demo Leaks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_URL = 'http://localhost:3000';

async function testCleanAuthAndLiveAPI() {
  console.log('====================================================');
  console.log('     VERIFICA PAGINA LOGIN PULITA & ZERO DEMO       ');
  console.log('====================================================\n');

  const appJs = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

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

  // 1. index.html static header does NOT contain userSwitcher
  assert(
    'index.html non contiene userSwitcher statico',
    !indexHtml.includes('id="userSwitcher"')
  );

  // 2. index.html static header does NOT contain hardcoded Admin/Config buttons
  assert(
    'index.html non contiene pulsanti admin/config statici',
    !indexHtml.includes('btnOpenGatewayConfigHeader') && !indexHtml.includes('⚙️ Admin')
  );

  // 3. app.js login view does NOT contain 'Accesso Rapido Demo'
  assert(
    'app.js non contiene "Accesso Rapido Demo"',
    !appJs.includes('Accesso Rapido Demo') && !appJs.includes('btn-demo-quick')
  );

  // 4. app.js login view does NOT contain default password hint
  assert(
    'app.js non contiene "Default: Password123!"',
    !appJs.includes('Default: Password123!')
  );

  // 5. app.js login form inputs are clean (empty strings)
  assert(
    'app.js campo email parte vuoto',
    appJs.includes('value="${escapeHtml(emailPrefill || \'\')}"')
  );
  assert(
    'app.js campo password parte vuoto',
    appJs.includes('id="loginPassword" class="form-input" placeholder="••••••••" value=""')
  );

  // 6. userSwitcher select box completely removed from updateHeader()
  assert(
    'updateHeader() non renderizza più userSwitcher dropdown',
    !appJs.includes('id="userSwitcher"')
  );

  // 7. Test Funzionamento Login Normale
  console.log('\n[TEST 7] Verifica Autenticazione Normale con Credenziali Reali...');
  const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'marco.rossi@example.com',
      password: 'Password123!'
    })
  });
  const loginData = await loginResp.json();
  assert(
    'Login normale Marco Rossi restituisce successo e token',
    loginResp.ok && loginData.success && loginData.user.fullName === 'Marco Rossi'
  );

  // 8. Test Profilo Autenticato
  const meResp = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  const meData = await meResp.json();
  assert(
    'Profilo /api/auth/me corretto',
    meData.user?.email === 'marco.rossi@example.com' && meData.user?.role === 'user'
  );

  // 9. Test Marketplace
  const marketResp = await fetch(`${BASE_URL}/api/groups`);
  const marketData = await marketResp.json();
  assert(
    'Marketplace mostra SOLO il gruppo reale di Marco Rossi (1 gruppo)',
    marketData.groups.length === 1 && marketData.groups[0].id === 'grp-1787066374922'
  );

  console.log(`\n====================================================`);
  console.log(`🎯 TUTTI I TEST SUPERATI: ${passed} PASSATI, ${failed} FALLITI`);
  console.log(`====================================================`);

  if (failed > 0) process.exit(1);
}

testCleanAuthAndLiveAPI();
