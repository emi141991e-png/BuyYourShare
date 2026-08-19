/**
 * Verifica Diretta Live del Deploy v27 su Railway
 */

const LIVE_URL = 'https://buyyourshare-production.up.railway.app';

async function verifyLive() {
  console.log('====================================================');
  console.log('     VERIFICA DIRETTA LIVE PRODUZIONE RAILWAY       ');
  console.log('====================================================\n');

  try {
    // 1. Check HTML version
    console.log('[1] Controllo HTML e Script Version...');
    const htmlRes = await fetch(LIVE_URL);
    const htmlText = await htmlRes.text();
    const hasV27 = htmlText.includes('js/app.js?v=27');
    const hasV26 = htmlText.includes('js/app.js?v=26');
    const hasV25 = htmlText.includes('js/app.js?v=25');
    console.log('   - Risposta HTTP HTML:', htmlRes.status);
    console.log('   - Script version v=27 rilevata:', hasV27);
    if (!hasV27) {
      console.log('   - Nota: Versione attuale ancora:', hasV26 ? 'v=26' : hasV25 ? 'v=25' : 'precedente');
    }

    // 2. Health check
    console.log('\n[2] Controllo /api/health...');
    const healthRes = await fetch(`${LIVE_URL}/api/health`);
    const healthData = await healthRes.json();
    console.log('   - Health Status:', healthRes.status, healthData);

    // 3. Login Admin
    console.log('\n[3] Login Admin su Produzione...');
    const loginRes = await fetch(`${LIVE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
    });
    const loginData = await loginRes.json();
    console.log('   - Login Status:', loginRes.status);
    console.log('   - Login Success:', loginData.success);
    console.log('   - Admin Role:', loginData.user?.role);

    if (!loginData.token) {
      console.error('   ❌ Impossibile ottenere token admin.');
      return;
    }

    const adminToken = loginData.token;

    // 4. Test Nuovi Endpoint Admin Live
    console.log('\n[4] Verifica Endpoint Admin /api/admin/dashboard...');
    const dashRes = await fetch(`${LIVE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('   - /api/admin/dashboard Status:', dashRes.status);
    if (dashRes.ok) {
      const dashData = await dashRes.json();
      console.log('   - Dashboard Data:', JSON.stringify(dashData.metrics?.users));
    }

    console.log('\n[5] Verifica Endpoint Admin /api/admin/groups...');
    const grpRes = await fetch(`${LIVE_URL}/api/admin/groups`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('   - /api/admin/groups Status:', grpRes.status);
    if (grpRes.ok) {
      const grpData = await grpRes.json();
      console.log('   - Gruppi totali trovati lato admin:', grpData.groups?.length);
    }

    console.log('\n[6] Verifica Endpoint Admin /api/admin/users...');
    const usrRes = await fetch(`${LIVE_URL}/api/admin/users`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('   - /api/admin/users Status:', usrRes.status);

    console.log('\n[7] Verifica Endpoint Admin /api/admin/audit-logs...');
    const logRes = await fetch(`${LIVE_URL}/api/admin/audit-logs`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('   - /api/admin/audit-logs Status:', logRes.status);

    // 8. Test RBAC Live (Membro)
    console.log('\n[8] Test Sicurezza RBAC Live con Membro (Elena Conti)...');
    const memberLoginRes = await fetch(`${LIVE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'elena.conti@example.com', password: 'Password123!' })
    });
    const memberLoginData = await memberLoginRes.json();
    const memberDashRes = await fetch(`${LIVE_URL}/api/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${memberLoginData.token}` }
    });
    console.log('   - Membro su /api/admin/dashboard Status:', memberDashRes.status, '(Atteso: 403)');

    // 9. Test Marketplace Live
    console.log('\n[9] Test Marketplace Live (GET /api/groups)...');
    const marketRes = await fetch(`${LIVE_URL}/api/groups`);
    const marketData = await marketRes.json();
    console.log('   - Gruppi visibili nel Marketplace pubblico:', marketData.groups?.length);
    if (marketData.groups?.length > 0) {
      console.log('   - Gruppo #1:', marketData.groups[0].customServiceName, marketData.groups[0].planName, 'di', marketData.groups[0].owner?.fullName);
    }

  } catch (err) {
    console.error('Errore durante la verifica live:', err);
  }
}

verifyLive();
