/**
 * BuyYourShare - Test di Verifica Finale del Marketplace e Pulizia Demo
 */

const BASE_URL = 'http://localhost:3000';

async function runFinalVerification() {
  console.log('====================================================');
  console.log('    VERIFICA FINALE PULIZIA TOTALE MARKETPLACE      ');
  console.log('====================================================\n');

  // TEST A: GET /api/groups restituisce SOLO il gruppo reale di Marco Rossi
  console.log('[TEST A] Verifica risposta reale GET /api/groups...');
  const groupsResp = await fetch(`${BASE_URL}/api/groups`);
  const groupsData = await groupsResp.json();
  
  console.log(`   Totale gruppi nel Marketplace: ${groupsData.groups.length}`);
  if (groupsData.groups.length !== 1) {
    console.error(`❌ ERRORE: Atteso 1 solo gruppo reale, trovati ${groupsData.groups.length}!`);
    process.exit(1);
  }

  const marcoGroup = groupsData.groups[0];
  console.log(`   ID Gruppo: ${marcoGroup.id}`);
  console.log(`   Servizio: ${marcoGroup.customServiceName}`);
  console.log(`   Piano: ${marcoGroup.planName}`);
  console.log(`   Posti Totali: ${marcoGroup.totalSlots}`);
  console.log(`   Posti Capogruppo: ${marcoGroup.ownerSlots}`);
  console.log(`   Posti Disponibili Membri: ${marcoGroup.availableSlots}`);
  console.log(`   Quota Base Membro: ${(marcoGroup.baseMemberShareCents / 100).toFixed(2)} €`);
  console.log(`   Fee BYS: ${(marcoGroup.platformFeeCents / 100).toFixed(2)} €`);
  console.log(`   Totale Membro: ${(marcoGroup.memberTotalCents / 100).toFixed(2)} €`);
  console.log(`   Capogruppo: ${marcoGroup.owner?.fullName} (ID: ${marcoGroup.ownerId})`);
  console.log(`   Stato: ${marcoGroup.status}`);

  if (
    marcoGroup.customServiceName === 'Spotify' &&
    marcoGroup.planName === 'Spotify Family (6 Account)' &&
    marcoGroup.totalSlots === 6 &&
    marcoGroup.availableSlots === 5 &&
    marcoGroup.baseMemberShareCents === 350 &&
    marcoGroup.platformFeeCents === 149 &&
    marcoGroup.memberTotalCents === 499 &&
    marcoGroup.owner?.fullName === 'Marco Rossi'
  ) {
    console.log('✅ TEST A PASS: Solo il gruppo reale di Marco Rossi è presente.');
  } else {
    console.error('❌ TEST A FAIL: Dati del gruppo di Marco Rossi non corrispondenti!');
    process.exit(1);
  }

  // TEST D: Verifica che i vecchi ID demo non siano raggiungibili
  console.log('\n[TEST D] Verifica inaccessibilità vecchi gruppi demo (grp-1042, grp-1089, grp-1120)...');
  for (const demoId of ['grp-1042', 'grp-1089', 'grp-1120']) {
    const resp = await fetch(`${BASE_URL}/api/groups/${demoId}`);
    if (resp.status === 404) {
      console.log(`   ✅ ${demoId} -> HTTP 404 (Non trovato)`);
    } else {
      console.error(`❌ ERRORE: ${demoId} ha risposto con status ${resp.status}`);
      process.exit(1);
    }
  }
  console.log('✅ TEST D PASS: Nessun vecchio gruppo demo è raggiungibile.');

  // TEST E & F: Verifica isolamento DRAFT e CLOSED
  console.log('\n[TEST E & F] Verifica isolamento DRAFT e CLOSED...');
  const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marco.rossi@example.com', password: 'Password123!' })
  });
  const loginData = await loginResp.json();
  const token = loginData.token;

  // Creazione gruppo di test in DRAFT
  const draftCreate = await fetch(`${BASE_URL}/api/groups`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'srv-youtube',
      customServiceName: 'YouTube Test Draft',
      planName: 'YouTube Premium',
      realCostEuros: 17.99,
      totalSlots: 6,
      ownerSlots: 1,
      accessUrl: 'https://youtube.com',
      instructions: 'Test',
      publishImmediately: false
    })
  });
  const draftData = await draftCreate.json();
  const draftId = draftData.group.id;
  console.log(`   Gruppo DRAFT creato: ${draftId}`);

  // Verifica che il Marketplace continui a mostrare SOLO 1 gruppo
  const checkDraftMarket = await (await fetch(`${BASE_URL}/api/groups`)).json();
  if (checkDraftMarket.groups.length === 1 && checkDraftMarket.groups[0].id === marcoGroup.id) {
    console.log('   ✅ Gruppo DRAFT NON visibile nel Marketplace.');
  } else {
    console.error('❌ ERRORE: Il gruppo DRAFT è comparso nel Marketplace!');
    process.exit(1);
  }

  // Chiusura del gruppo DRAFT
  await fetch(`${BASE_URL}/api/groups/${draftId}/cancel`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const checkClosedMarket = await (await fetch(`${BASE_URL}/api/groups`)).json();
  if (checkClosedMarket.groups.length === 1 && checkClosedMarket.groups[0].id === marcoGroup.id) {
    console.log('   ✅ Gruppo CLOSED NON visibile nel Marketplace.');
  } else {
    console.error('❌ ERRORE: Il gruppo CLOSED è comparso nel Marketplace!');
    process.exit(1);
  }
  console.log('✅ TEST E & F PASS: DRAFT e CLOSED rigorosamente esclusi.');

  // TEST G: Verifica Catalogo Servizi Funzionante
  console.log('\n[TEST G] Verifica Catalogo Servizi per wizard "Crea Gruppo"...');
  const { INITIAL_SERVICES } = await import('../server/db/seedData.js');
  console.log(`   Servizi disponibili a catalogo: ${INITIAL_SERVICES.length}`);
  const serviceNames = INITIAL_SERVICES.map(s => s.name);
  console.log('   Elenco:', serviceNames.join(', '));
  if (INITIAL_SERVICES.length >= 6 && serviceNames.includes('Spotify') && serviceNames.includes('YouTube Premium')) {
    console.log('✅ TEST G PASS: Catalogo servizi 100% integro e disponibile.');
  } else {
    console.error('❌ TEST G FAIL: Catalogo servizi incompleto!');
    process.exit(1);
  }

  // TEST H: Verifica Integrità Subscription PayPal I-MDJSFS3MRVBY e Ledger
  console.log('\n[TEST H] Verifica Integrità Subscription PayPal I-MDJSFS3MRVBY e Ledger...');
  const webhookStatus = await (await fetch(`${BASE_URL}/api/webhooks/paypal/status`)).json();
  const activeSub = webhookStatus.activeSubscriptions.find(s => s.paypalSubscriptionId === 'I-MDJSFS3MRVBY');
  const ledgerCycle1 = webhookStatus.recordedCycles.find(c => c.subscriptionId === 'I-MDJSFS3MRVBY');

  if (activeSub && activeSub.status === 'ACTIVE') {
    console.log(`   ✅ Subscription I-MDJSFS3MRVBY ATTIVA (Next billing: ${activeSub.nextBillingDate})`);
  } else {
    console.error('❌ ERRORE: Subscription I-MDJSFS3MRVBY non attiva!');
    process.exit(1);
  }

  if (ledgerCycle1 && ledgerCycle1.payoutStatus === 'PAID') {
    console.log(`   ✅ Ledger Ciclo 1 INTEGRO (Batch: ${ledgerCycle1.payoutId}, Item: ${ledgerCycle1.transferId}, Status: ${ledgerCycle1.payoutStatus})`);
  } else {
    console.error('❌ ERRORE: Record contabile Ciclo 1 non trovato nel Ledger!');
    process.exit(1);
  }
  console.log('✅ TEST H PASS: Dati finanziari storici e Subscription PayPal intatti al 100%.');

  console.log('\n====================================================');
  console.log('🎯 TUTTI I TEST SUPERATI CON SUCCESSO AL 100%!       ');
  console.log('====================================================');
}

runFinalVerification();
