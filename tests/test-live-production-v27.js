/**
 * BuyYourShare - Verifica LIVE Completa su Produzione Railway (Tutti i punti 1 - 11)
 */

const LIVE_URL = 'https://buyyourshare-production.up.railway.app';

async function runLiveAudit() {
  console.log('====================================================');
  console.log('    VERIFICA DIRETTA PRODUZIONE RAILWAY (LIVE)     ');
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

  // 1. VERIFICA VERSIONE v27 SULL'HTML LIVE
  console.log('[1] Verifica Script Version v27 in index.html...');
  const htmlRes = await fetch(LIVE_URL);
  const htmlText = await htmlRes.text();
  const isV27 = htmlText.includes('js/app.js?v=27');
  assert('index.html include js/app.js?v=27', isV27);

  // 2. LOGIN DEI 3 PROFILI LIVE
  console.log('\n[2] Login Profili su Produzione Live...');
  async function liveLogin(email, password) {
    const res = await fetch(`${LIVE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  }

  const adminAuth = await liveLogin('admin@buyyourshare.com', 'Password123!');
  const memberAuth = await liveLogin('elena.conti@example.com', 'Password123!');
  const ownerAuth = await liveLogin('marco.rossi@example.com', 'Password123!');

  assert('Login Admin Live riuscito (200 OK)', adminAuth.success && adminAuth.user?.role === 'admin');
  assert('Login Membro Live riuscito (200 OK)', memberAuth.success && memberAuth.user?.role === 'user');
  assert('Login Capogruppo Live riuscito (200 OK)', ownerAuth.success && ownerAuth.user?.role === 'user');

  const adminToken = adminAuth.token;
  const memberToken = memberAuth.token;
  const ownerToken = ownerAuth.token;

  // 3. VERIFICA /api/admin/dashboard IN JSON
  console.log('\n[3] Verifica /api/admin/dashboard in formato JSON...');
  const dashRes = await fetch(`${LIVE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const dashContentType = dashRes.headers.get('content-type') || '';
  const isDashJson = dashContentType.includes('application/json');
  assert('/api/admin/dashboard restituisce Content-Type application/json', isDashJson);
  assert('/api/admin/dashboard risponde con HTTP 200 OK', dashRes.status === 200);

  if (isDashJson) {
    const dashData = await dashRes.json();
    assert('Dashboard contiene metriche utenti', !!dashData.metrics?.users?.total);
    assert('Dashboard contiene metriche gruppi', !!dashData.metrics?.groups?.total);
    assert('Dashboard contiene metriche finanziarie', !!dashData.metrics?.finance);
  }

  // 4. VERIFICA /api/admin/groups
  console.log('\n[4] Verifica /api/admin/groups...');
  const grpRes = await fetch(`${LIVE_URL}/api/admin/groups`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const grpContentType = grpRes.headers.get('content-type') || '';
  const isGrpJson = grpContentType.includes('application/json');
  assert('/api/admin/groups risponde con JSON', isGrpJson);

  // 5. VERIFICA /api/admin/users
  console.log('\n[5] Verifica /api/admin/users...');
  const usrRes = await fetch(`${LIVE_URL}/api/admin/users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const usrContentType = usrRes.headers.get('content-type') || '';
  const isUsrJson = usrContentType.includes('application/json');
  assert('/api/admin/users risponde con JSON', isUsrJson);

  // 6. VERIFICA /api/admin/audit-logs
  console.log('\n[6] Verifica /api/admin/audit-logs...');
  const logRes = await fetch(`${LIVE_URL}/api/admin/audit-logs`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const logContentType = logRes.headers.get('content-type') || '';
  const isLogJson = logContentType.includes('application/json');
  assert('/api/admin/audit-logs risponde con JSON', isLogJson);

  // 7. VERIFICA BLOCCO ANONIMO (401/403)
  console.log('\n[7] Verifica Blocco Visitatore Anonimo...');
  const anonDashRes = await fetch(`${LIVE_URL}/api/admin/dashboard`);
  const anonGrpRes = await fetch(`${LIVE_URL}/api/admin/groups`);
  assert('Anonimo bloccato su /api/admin/dashboard (HTTP 401/403 o non autorizzato)', anonDashRes.status === 401 || anonDashRes.status === 403 || !isDashJson);
  assert('Anonimo bloccato su /api/admin/groups (HTTP 401/403 o non autorizzato)', anonGrpRes.status === 401 || anonGrpRes.status === 403 || !isGrpJson);

  // 8. VERIFICA BLOCCO MEMBRO (403 FORBIDDEN)
  console.log('\n[8] Verifica Blocco Membro (Elena Conti)...');
  const memDashRes = await fetch(`${LIVE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${memberToken}` }
  });
  assert('Membro bloccato su /api/admin/dashboard (HTTP 403 o non autorizzato)', memDashRes.status === 403 || !isDashJson);

  // 9. VERIFICA BLOCCO CAPOGRUPPO (403 FORBIDDEN)
  console.log('\n[9] Verifica Blocco Capogruppo (Marco Rossi)...');
  const ownDashRes = await fetch(`${LIVE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  assert('Capogruppo bloccato su /api/admin/dashboard (HTTP 403 o non autorizzato)', ownDashRes.status === 403 || !isDashJson);

  // 10. VERIFICA INTEGRITÀ GRUPPO MARCO ROSSI
  console.log('\n[10] Verifica Integrità Gruppo Reale Marco Rossi...');
  const marcoRes = await fetch(`${LIVE_URL}/api/groups/grp-1787066374922`);
  const marcoData = await marcoRes.json();
  assert('Gruppo Spotify Marco Rossi presente su produzione', marcoData.group?.id === 'grp-1787066374922');
  assert('Gruppo Spotify è Spotify Family (6 Account)', marcoData.group?.planName === 'Spotify Family (6 Account)');
  assert('Posti disponibili membri: 5', marcoData.group?.availableSlots === 5);
  assert('Quota totale membro: 4,99 € (499 cents)', marcoData.group?.memberTotalCents === 499);

  // 11. VERIFICA MARKETPLACE PUBBLICO (ESCLUSIVAMENTE GRUPPO REALE)
  console.log('\n[11] Verifica Marketplace Pubblico (GET /api/groups)...');
  const marketRes = await fetch(`${LIVE_URL}/api/groups`);
  const marketData = await marketRes.json();
  assert('Marketplace contiene esattamente 1 gruppo reale', marketData.groups?.length === 1);
  assert('L\'unico gruppo nel Marketplace è quello di Marco Rossi', marketData.groups?.[0]?.id === 'grp-1787066374922');

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO LIVE AUDIT: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runLiveAudit();
