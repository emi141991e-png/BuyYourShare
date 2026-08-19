/**
 * Live Production Active Deployment Verification Script
 */

const PROD_URL = 'https://buyyourshare-production.up.railway.app';

async function verifyLive() {
  console.log('====================================================');
  console.log('   VERIFICA LIVE PRODUZIONE RAILWAY (DEPLOY ACTIVE)  ');
  console.log(`   URL: ${PROD_URL}`);
  console.log('====================================================\n');

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

  // 1. Health Check
  console.log('[1] Controllo GET /api/health...');
  try {
    const healthRes = await fetch(`${PROD_URL}/api/health`);
    const healthData = await healthRes.json();
    console.log('    Risposta Health:', healthData);
    assert('GET /api/health risponde HTTP 200', healthRes.status === 200);
    assert('Versione online è 2.1.0 (o >= 2.0.0)', healthData.version === '2.1.0' || healthData.version === '2.0.0', `Trovata: ${healthData.version}`);
  } catch (err) {
    assert('GET /api/health raggiungibile', false, err.message);
  }

  // 2. HTML & Script Version
  console.log('\n[2] Controllo HTML & Versione Script js/app.js...');
  try {
    const htmlRes = await fetch(`${PROD_URL}/`);
    const htmlText = await htmlRes.text();
    assert('HTML radice servito con successo (200 OK)', htmlRes.status === 200);
    assert('HTML include script app.js con cache busting (v=28 o v=27)', htmlText.includes('js/app.js?v=28') || htmlText.includes('js/app.js?v=27'));
  } catch (err) {
    assert('HTML radice raggiungibile', false, err.message);
  }

  // 3. Login Admin
  console.log('\n[3] Login Admin (admin@buyyourshare.com)...');
  let adminToken = null;
  try {
    const loginRes = await fetch(`${PROD_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
    });
    const loginData = await loginRes.json();
    assert('Login Admin risponde 200 con token valido', loginRes.status === 200 && !!loginData.token);
    assert('Ruolo utente autenticato è "admin"', loginData.user?.role === 'admin');
    adminToken = loginData.token;
  } catch (err) {
    assert('Login Admin riuscito', false, err.message);
  }

  // 4. Endpoint Admin Live (/api/admin/*)
  if (adminToken) {
    console.log('\n[4] Verifica Endpoint API Admin...');

    // 4A: Dashboard
    const dashRes = await fetch(`${PROD_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const dashJson = await dashRes.json();
    assert('GET /api/admin/dashboard risponde HTTP 200 JSON', dashRes.status === 200 && dashJson.success);
    assert('Dashboard contiene metriche (utenti, gruppi, transazioni)', !!dashJson.metrics?.users);

    // 4B: Groups
    const grpRes = await fetch(`${PROD_URL}/api/admin/groups`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const grpJson = await grpRes.json();
    assert('GET /api/admin/groups risponde HTTP 200 JSON', grpRes.status === 200 && grpJson.success);
    assert('Gruppi restituiti correttamente dall\'API Admin', Array.isArray(grpJson.groups));

    // 4C: Users
    const usrRes = await fetch(`${PROD_URL}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const usrJson = await usrRes.json();
    assert('GET /api/admin/users risponde HTTP 200 JSON', usrRes.status === 200 && usrJson.success);
    assert('Utenti restituiti correttamente dall\'API Admin', Array.isArray(usrJson.users));

    // 4D: Audit Logs
    const auditRes = await fetch(`${PROD_URL}/api/admin/audit-logs`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const auditJson = await auditRes.json();
    assert('GET /api/admin/audit-logs risponde HTTP 200 JSON', auditRes.status === 200 && auditJson.success);
    assert('Audit logs contengono sia adminLogs che financialLogs', !!auditJson.adminLogs && !!auditJson.financialLogs);
  }

  // 5. Verifica Protezione RBAC Server-Side (Anonimo & Delete)
  console.log('\n[5] Verifica Protezione RBAC (Zero-Trust)...');
  try {
    const anonRes = await fetch(`${PROD_URL}/api/admin/dashboard`);
    assert('Utente Anonimo riceve 401/403 su /api/admin/dashboard', anonRes.status === 401 || anonRes.status === 403);

    const anonDelRes = await fetch(`${PROD_URL}/api/admin/groups/grp-dummy-test`, {
      method: 'DELETE'
    });
    assert('Cancellazione non autorizzata protetta (401/403)', anonDelRes.status === 401 || anonDelRes.status === 403);
  } catch (err) {
    assert('Test RBAC completato', false, err.message);
  }

  // 6. Verifica Frontend app.js per le 5 Sezioni Admin
  console.log('\n[6] Verifica 5 Sezioni Admin nel Bundle JS...');
  try {
    const jsRes = await fetch(`${PROD_URL}/js/app.js?v=28`);
    const jsText = await jsRes.text();
    assert('Tab 1 Dashboard presente nel JS', jsText.includes('currentAdminTab === \'dashboard\'') || jsText.includes('TAB 1: DASHBOARD KPI'));
    assert('Tab 2 Gestione Gruppi presente nel JS', jsText.includes('currentAdminTab === \'groups\'') || jsText.includes('TAB 2: GESTIONE GRUPPI'));
    assert('Tab 3 Gestione Utenti presente nel JS', jsText.includes('currentAdminTab === \'users\'') || jsText.includes('TAB 3: GESTIONE UTENTI'));
    assert('Tab 4 Audit Ledger presente nel JS', jsText.includes('currentAdminTab === \'audit\'') || jsText.includes('TAB 4: AUDIT LEDGER'));
    assert('Tab 5 Config Gateway presente nel JS', jsText.includes('currentAdminTab === \'gateway\'') || jsText.includes('TAB 5: CONFIGURAZIONE GATEWAY'));
    assert('Pulsante Eliminazione Definitiva Gruppo presente (btn-admin-delete-group)', jsText.includes('btn-admin-delete-group'));
  } catch (err) {
    assert('Download js/app.js completato', false, err.message);
  }

  // 7. Marketplace & Integrità Gruppi
  console.log('\n[7] Verifica Marketplace Pubblico Live...');
  try {
    const marketRes = await fetch(`${PROD_URL}/api/groups`);
    const marketJson = await marketRes.json();
    assert('GET /api/groups risponde HTTP 200 JSON', marketRes.status === 200 && Array.isArray(marketJson.groups));
    assert('Marketplace contiene esattamente il gruppo reale pubblicato', marketJson.groups.length === 1 && marketJson.groups[0].id === 'grp-1787066374922');
    console.log(`    Gruppi presenti nel Marketplace Live: ${marketJson.groups ? marketJson.groups.length : 0}`);
    if (marketJson.groups && marketJson.groups.length > 0) {
      marketJson.groups.forEach(g => {
        console.log(`    * ID: ${g.id} | ${g.customServiceName} (${g.planName}) | Posti: ${g.availableSlots}/${g.totalSlots} | Quota: ${(g.memberTotalCents/100).toFixed(2)} €`);
      });
    }
  } catch (err) {
    assert('Verifica Marketplace completata', false, err.message);
  }

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO VERIFICA LIVE: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

verifyLive();
