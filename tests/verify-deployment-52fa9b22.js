/**
 * Verification Script for Deployment 52fa9b22
 */

const BASE_URL = 'https://buyyourshare-production.up.railway.app';

async function verify() {
  console.log('====================================================');
  console.log('   VERIFICA HTTP LIVE - DEPLOYMENT 52fa9b22         ');
  console.log(`   URL: ${BASE_URL}`);
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

  // 1. GET /api/health
  console.log('[1] GET /api/health...');
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`);
    const health = await healthRes.json();
    console.log('    Risposta /api/health:', health);
    assert('/api/health risponde 200 HEALTHY', healthRes.status === 200 && health.status === 'HEALTHY');
    console.log(`    Versione backend attiva: ${health.version}`);
  } catch (err) {
    assert('/api/health raggiungibile', false, err.message);
  }

  // 2. HTML & Script Tag
  console.log('\n[2] Verifica Script Tag in index.html...');
  try {
    const htmlRes = await fetch(`${BASE_URL}/`);
    const html = await htmlRes.text();
    const hasScript27 = html.includes('js/app.js?v=27');
    const hasScript28 = html.includes('js/app.js?v=28');
    assert('Script app.js servito con cache-busting', hasScript27 || hasScript28, `Tag trovato: ${html.match(/src="js\/app\.js\?[^"]+"/)?.[0] || 'N/A'}`);
    console.log(`    Script tag servito nell'HTML: ${html.match(/src="js\/app\.js\?[^"]+"/)?.[0]}`);
  } catch (err) {
    assert('index.html raggiungibile', false, err.message);
  }

  // 3. Login Admin
  console.log('\n[3] Login Admin...');
  let adminToken = null;
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
    });
    const loginData = await loginRes.json();
    assert('Login Admin 200 OK con ruolo admin', loginRes.status === 200 && loginData.user?.role === 'admin');
    adminToken = loginData.token;
  } catch (err) {
    assert('Login Admin riuscito', false, err.message);
  }

  // 4. Admin Endpoints
  if (adminToken) {
    console.log('\n[4] Verifica Endpoints /api/admin/*...');
    
    // Dashboard
    const dashRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const dashData = await dashRes.json();
    assert('GET /api/admin/dashboard risponde 200 JSON', dashRes.status === 200 && dashData.success);
    console.log('    Metriche Dashboard:', dashData.metrics);

    // Groups
    const groupsRes = await fetch(`${BASE_URL}/api/admin/groups`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const groupsData = await groupsRes.json();
    assert('GET /api/admin/groups risponde 200 JSON', groupsRes.status === 200 && Array.isArray(groupsData.groups));
    console.log(`    Gruppi totali nel pannello Admin: ${groupsData.groups.length}`);

    // Users
    const usersRes = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const usersData = await usersRes.json();
    assert('GET /api/admin/users risponde 200 JSON', usersRes.status === 200 && Array.isArray(usersData.users));
    console.log(`    Utenti totali nel pannello Admin: ${usersData.users.length}`);

    // Audit Logs
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    assert('GET /api/admin/audit-logs risponde 200 JSON', auditRes.status === 200 && auditData.success);
    console.log(`    Admin Action Logs: ${auditData.adminLogs?.length || 0}, Financial Logs: ${auditData.financialLogs?.length || 0}`);
  }

  // 5. Verifica 5 Sezioni Admin nel JS
  console.log('\n[5] Verifica 5 Sezioni del Nuovo Pannello (#admin)...');
  try {
    const jsRes = await fetch(`${BASE_URL}/js/app.js?v=28`);
    const jsText = await jsRes.text();
    const hasDashboard = jsText.includes("currentAdminTab === 'dashboard'");
    const hasGroups = jsText.includes("currentAdminTab === 'groups'");
    const hasUsers = jsText.includes("currentAdminTab === 'users'");
    const hasAudit = jsText.includes("currentAdminTab === 'ledger'") || jsText.includes("TAB 4: AUDIT LEDGER");
    const hasGateway = jsText.includes("currentAdminTab === 'gateway'");

    assert('Sezione 1: Dashboard presente', hasDashboard);
    assert('Sezione 2: Gestione Gruppi presente', hasGroups);
    assert('Sezione 3: Gestione Utenti presente', hasUsers);
    assert('Sezione 4: Audit Ledger & Azioni presente', hasAudit);
    assert('Sezione 5: Config Gateway & Payouts presente', hasGateway);
  } catch (err) {
    assert('Caricamento bundle js/app.js completato', false, err.message);
  }

  // 6. Verifica Gruppo Reale Spotify Marco Rossi & Ledger
  console.log('\n[6] Verifica Integrità Gruppo Reale & Ledger...');
  try {
    const marketRes = await fetch(`${BASE_URL}/api/groups`);
    const marketData = await marketRes.json();
    assert('Marketplace pubblico risponde 200 JSON', marketRes.status === 200 && Array.isArray(marketData.groups));
    const spotifyGroup = marketData.groups.find(g => g.id === 'grp-1787066374922');
    assert('Gruppo Spotify Marco Rossi presente e pubblicato', !!spotifyGroup && spotifyGroup.status === 'PUBLISHED');
    if (spotifyGroup) {
      assert('Gruppo Spotify ha 5 posti disponibili su 6', spotifyGroup.availableSlots === 5 && spotifyGroup.totalSlots === 6);
      assert('Quota membro è 4,99 €/mese', spotifyGroup.memberTotalCents === 499);
      console.log(`    Gruppo verificato: ID ${spotifyGroup.id} - ${spotifyGroup.customServiceName} (${spotifyGroup.availableSlots}/${spotifyGroup.totalSlots} posti a ${(spotifyGroup.memberTotalCents/100).toFixed(2)} €)`);
    }
  } catch (err) {
    assert('Verifica Marketplace completata', false, err.message);
  }

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO VERIFICA: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

verify();
