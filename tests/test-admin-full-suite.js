/**
 * BuyYourShare - Test Suite Completa Pannello Admin e Sicurezza RBAC (Punti A - K)
 */

const BASE_URL = 'http://localhost:3000';

async function runAdminVerificationSuite() {
  console.log('====================================================');
  console.log('    TEST SUITE COMPLETA PANNELLO ADMIN (A - K)     ');
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

  // Helper per login e ottenimento token
  async function login(email, password) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  }

  // 1. AUTENTICAZIONE UTENTI
  console.log('[FASE 1] Autenticazione dei 3 profili...');
  const adminAuth = await login('admin@buyyourshare.com', 'Password123!');
  const memberAuth = await login('elena.conti@example.com', 'Password123!');
  const ownerAuth = await login('marco.rossi@example.com', 'Password123!');

  assert('Login Admin riuscito', adminAuth.success && adminAuth.user.role === 'admin');
  assert('Login Membro riuscito', memberAuth.success && memberAuth.user.role === 'user');
  assert('Login Capogruppo riuscito', ownerAuth.success && ownerAuth.user.role === 'user');

  const adminToken = adminAuth.token;
  const memberToken = memberAuth.token;
  const ownerToken = ownerAuth.token;

  // TEST A: Admin può vedere tutti i gruppi
  console.log('\n[TEST A] Admin visualizza tutti i gruppi (GET /api/admin/groups)...');
  const allGroupsRes = await fetch(`${BASE_URL}/api/admin/groups`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const allGroupsData = await allGroupsRes.json();
  assert('HTTP 200 su GET /api/admin/groups', allGroupsRes.status === 200);
  assert('Restituisce lista gruppi', allGroupsData.success && Array.isArray(allGroupsData.groups));
  assert('Include il gruppo reale di Marco Rossi', allGroupsData.groups.some(g => g.id === 'grp-1787066374922'));

  // TEST B: Admin può aprire i dettagli di qualsiasi gruppo
  console.log('\n[TEST B] Admin apre il dettaglio del gruppo...');
  const groupDetailRes = await fetch(`${BASE_URL}/api/groups/grp-1787066374922`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const groupDetailData = await groupDetailRes.json();
  assert('HTTP 200 su GET /api/groups/:id', groupDetailRes.status === 200);
  assert('Dettaglio gruppo estratto correttamente', groupDetailData.group?.customServiceName === 'Spotify');

  // PREPARAZIONE GRUPPO TEMPORANEO DI TEST PER ELIMINAZIONE
  console.log('\n[PREPARAZIONE] Creazione gruppo di test isolato per verifica eliminazione...');
  const createGroupRes = await fetch(`${BASE_URL}/api/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerToken}` },
    body: JSON.stringify({
      customServiceName: 'Servizio Temporaneo Test Admin',
      planName: 'Piano Test Cancellazione',
      realCostEuros: 12.00,
      totalSlots: 4,
      ownerSlots: 1,
      publishImmediately: true
    })
  });
  const createGroupData = await createGroupRes.json();
  const testGroupId = createGroupData.group.id;
  assert('Gruppo di test temporaneo creato con ID: ' + testGroupId, !!testGroupId);

  // TEST C: Admin può eliminare definitivamente un gruppo
  console.log('\n[TEST C] Admin elimina definitivamente il gruppo di test (DELETE /api/admin/groups/:id)...');
  const deleteRes = await fetch(`${BASE_URL}/api/admin/groups/${testGroupId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const deleteData = await deleteRes.json();
  assert('HTTP 200 su DELETE /api/admin/groups/:id', deleteRes.status === 200);
  assert('Risposta conferma eliminazione', deleteData.success === true && deleteData.deletedGroupId === testGroupId);

  // TEST D & E: Dopo l'eliminazione il gruppo non appare più nel Marketplace
  console.log('\n[TEST D & E] Verifica assenza del gruppo eliminato in GET /api/groups...');
  const marketplaceRes = await fetch(`${BASE_URL}/api/groups`);
  const marketplaceData = await marketplaceRes.json();
  const foundInMarketplace = marketplaceData.groups.some(g => g.id === testGroupId);
  assert('Gruppo eliminato NON presente nel Marketplace', !foundInMarketplace);

  // TEST F: Accesso diretto all'ID eliminato restituisce 404
  console.log('\n[TEST F] Verifica che GET /api/groups/:id restituisca 404...');
  const directGetRes = await fetch(`${BASE_URL}/api/groups/${testGroupId}`);
  assert('GET /api/groups/:id eliminato restituisce HTTP 404', directGetRes.status === 404);

  // TEST G: Membro riceve 403 sugli endpoint Admin
  console.log('\n[TEST G] Membro (Elena Conti) tenta accesso agli endpoint Admin...');
  const memberDashRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${memberToken}` }
  });
  const memberDeleteRes = await fetch(`${BASE_URL}/api/admin/groups/grp-1787066374922`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${memberToken}` }
  });
  assert('Membro bloccato su /api/admin/dashboard con HTTP 403', memberDashRes.status === 403);
  assert('Membro bloccato su DELETE /api/admin/groups con HTTP 403', memberDeleteRes.status === 403);

  // TEST H: Capogruppo riceve 403 sugli endpoint Admin
  console.log('\n[TEST H] Capogruppo (Marco Rossi) tenta accesso agli endpoint Admin...');
  const ownerDashRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  const ownerDeleteRes = await fetch(`${BASE_URL}/api/admin/groups/grp-1787066374922`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${ownerToken}` }
  });
  assert('Capogruppo bloccato su /api/admin/dashboard con HTTP 403', ownerDashRes.status === 403);
  assert('Capogruppo bloccato su DELETE /api/admin/groups con HTTP 403', ownerDeleteRes.status === 403);

  // TEST I: Visitatore anonimo riceve 401/403
  console.log('\n[TEST I] Visitatore anonimo tenta accesso agli endpoint Admin...');
  const anonDashRes = await fetch(`${BASE_URL}/api/admin/dashboard`);
  const anonDeleteRes = await fetch(`${BASE_URL}/api/admin/groups/grp-1787066374922`, { method: 'DELETE' });
  assert('Anonimo bloccato su /api/admin/dashboard con HTTP 401/403', anonDashRes.status === 401 || anonDashRes.status === 403);
  assert('Anonimo bloccato su DELETE /api/admin/groups con HTTP 401/403', anonDeleteRes.status === 401 || anonDeleteRes.status === 403);

  // TEST J: Azione di eliminazione registrata nell'Audit Log
  console.log('\n[TEST J] Verifica registrazione azione nell\'Audit Log...');
  const auditLogsRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const auditLogsData = await auditLogsRes.json();
  const deleteLog = (auditLogsData.adminLogs || []).find(l => l.action === 'GROUP_DELETED' && l.targetId === testGroupId);
  assert('Audit Log contiene record GROUP_DELETED per il gruppo eliminato', !!deleteLog);
  assert('Audit Log riporta autore e timestamp validi', deleteLog?.performedBy === adminAuth.user.id && !!deleteLog?.timestamp);

  // TEST K: Gruppo reale Marco Rossi e Ledger Ciclo 1 intatti al 100%
  console.log('\n[TEST K] Verifica integrità Gruppo Marco Rossi, Subscription e Ledger...');
  const marcoGroupRes = await fetch(`${BASE_URL}/api/groups/grp-1787066374922`);
  const marcoGroupData = await marcoGroupRes.json();
  assert('Gruppo Spotify di Marco Rossi intatto e pubblicato', marcoGroupData.group?.id === 'grp-1787066374922');

  const ledgerRes = await fetch(`${BASE_URL}/api/ledger/admin`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const ledgerData = await ledgerRes.json();
  const hasValidLedger = ledgerData.logs?.some(l => l.subscriptionId === 'I-MDJSFS3MRVBY' && l.payoutId === 'CM7DU7TXEC342');
  assert('Ledger Finanziario Ciclo 1 integro con Subscription I-MDJSFS3MRVBY e Payout PAID', hasValidLedger);

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO FINALE: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runAdminVerificationSuite();
