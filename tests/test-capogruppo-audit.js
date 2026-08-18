/**
 * BuyYourShare - Audit Completo Flusso Reale Capogruppo
 */

const BASE_URL = 'http://localhost:3000';

async function runAudit() {
  console.log('====================================================');
  console.log('    AUDIT COMPLETO DEL FLUSSO REALE CAPOGRUPPO      ');
  console.log('====================================================\n');

  // STEP 1: REGISTRAZIONE NUOVO CAPOGRUPPO
  const uniqueId = Date.now();
  const capogruppoEmail = `capogruppo.${uniqueId}@example.com`;
  console.log(`[STEP 1] Registrazione Capogruppo (${capogruppoEmail})...`);
  
  const regResp = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Alessandro',
      lastName: 'Verdi',
      email: capogruppoEmail,
      password: 'Password123!',
      confirmPassword: 'Password123!',
      termsConsent: true,
      privacyConsent: true
    })
  });
  const regData = await regResp.json();
  if (!regData.success || !regData.token) {
    console.error('❌ Fallimento registrazione Capogruppo:', regData);
    process.exit(1);
  }
  const token = regData.token;
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  console.log(`✅ Capogruppo registrato con ID: ${regData.user.id}`);

  // STEP 2: CREAZIONE GRUPPO INIZIALMENTE IN DRAFT (con publishImmediately: false)
  console.log('\n[STEP 2] Creazione Gruppo Reale (Inizialmente DRAFT)...');
  const createResp = await fetch(`${BASE_URL}/api/groups`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      serviceId: 'srv-spotify',
      customServiceName: 'Spotify Family Alessandro',
      planName: 'Spotify Family (6 Posti)',
      realCostEuros: 20.99,
      totalSlots: 6,
      ownerSlots: 1,
      description: 'Gruppo Spotify Family certificato.',
      rulesAndRequirements: 'Invito ufficiale email.',
      accessUrl: 'https://spotify.com/family/join/invite/SECRET_LINK_777',
      instructions: 'Accetta invito con la tua email Spotify.',
      accessCode: 'SECRET_CODE_777',
      ownerSpotifyAccount: 'alessandro.spotify.private@example.com',
      publishImmediately: false
    })
  });
  const createData = await createResp.json();
  const groupId = createData.group.id;
  console.log(`✅ Gruppo creato con ID: ${groupId} - Stato Iniziale: ${createData.group.status}`);

  if (createData.group.status !== 'DRAFT') {
    console.error('❌ ERRORE: Il gruppo doveva partire in stato DRAFT!');
    process.exit(1);
  }

  // STEP 3: VERIFICA CHE IL GRUPPO DRAFT SIA TOTALMENTE INVISIBILE NEL MARKETPLACE
  console.log('\n[STEP 3] Verifica isolamento Marketplace (Gruppo DRAFT invisibile)...');
  const publicMarketResp1 = await fetch(`${BASE_URL}/api/groups`);
  const publicMarketData1 = await publicMarketResp1.json();
  console.log(`   Gruppi nel Marketplace pubblico: ${publicMarketData1.groups.length}`);
  if (publicMarketData1.groups.length !== 0) {
    console.error('❌ ERRORE: Il gruppo DRAFT è visibile nel Marketplace pubblico!');
    process.exit(1);
  }
  console.log('✅ Gruppo DRAFT completamente invisibile nel Marketplace pubblico.');

  // Accesso anonimo diretto al gruppo DRAFT
  const anonDirectResp = await fetch(`${BASE_URL}/api/groups/${groupId}`);
  if (anonDirectResp.status !== 404 && anonDirectResp.status !== 403) {
    console.error('❌ ERRORE: Utente anonimo ha potuto visualizzare il gruppo DRAFT!');
    process.exit(1);
  }
  console.log('✅ Tentativo di accesso anonimo diretto al DRAFT bloccato (HTTP 404).');

  // STEP 4: CONFIGURAZIONE PAYOUT CAPOGRUPPO
  console.log('\n[STEP 4] Configurazione Metodo di Ricezione Quote Payout (PayPal / IBAN)...');
  const payoutResp = await fetch(`${BASE_URL}/api/auth/payout-settings`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      paypalPayoutEmail: 'sb-439eed52340185@personal.example.com',
      iban: 'IT60X0542811101000000888999',
      bankName: 'Banca Intesa Sanpaolo'
    })
  });
  const payoutData = await payoutResp.json();
  console.log(`✅ Payout configurato: ${payoutData.message}`);
  console.log(`   PayPal Payout Email salvata: ${payoutData.user.paypalPayoutEmail}`);

  // STEP 5: PUBBLICAZIONE DEL GRUPPO NEL MARKETPLACE
  console.log('\n[STEP 5] Pubblicazione del Gruppo nel Marketplace...');
  const publishResp = await fetch(`${BASE_URL}/api/groups/${groupId}/publish`, {
    method: 'POST',
    headers: authHeaders
  });
  const publishData = await publishResp.json();
  console.log(`✅ Esito Pubblicazione: ${publishData.message}`);
  console.log(`   Nuovo Stato Gruppo: ${publishData.group.status}`);

  if (publishData.group.status !== 'PUBLISHED') {
    console.error('❌ ERRORE: Lo stato non è diventato PUBLISHED!');
    process.exit(1);
  }

  // STEP 6: VERIFICA COMPARSA NEL MARKETPLACE PUBBLICO
  console.log('\n[STEP 6] Verifica Comparsa nel Marketplace Pubblico...');
  const publicMarketResp2 = await fetch(`${BASE_URL}/api/groups`);
  const publicMarketData2 = await publicMarketResp2.json();
  console.log(`   Gruppi nel Marketplace pubblico: ${publicMarketData2.groups.length}`);
  if (publicMarketData2.groups.length !== 1 || publicMarketData2.groups[0].id !== groupId) {
    console.error('❌ ERRORE: Il gruppo pubblicato non compare nel Marketplace pubblico!');
    process.exit(1);
  }
  console.log('✅ Gruppo pubblicato correttamente visibile nel Marketplace.');

  // STEP 7: AUDIT PRIVACY DEI DATI RESTITUITI AL MEMBRO (ZERO DATA LEAKAGE)
  console.log('\n[STEP 7] Audit Sicurezza e Privacy sui dati esposti al Membro...');
  const memberGroupView = publicMarketData2.groups[0];
  const stringified = JSON.stringify(memberGroupView);

  const leakedFields = [];
  if (stringified.includes('iban') || stringified.includes('IT60X')) leakedFields.push('IBAN');
  if (stringified.includes('paypalPayoutEmail') || stringified.includes('sb-439eed52340185')) leakedFields.push('PayPal Email Privata');
  if (stringified.includes('SECRET_LINK') || stringified.includes('SECRET_CODE')) leakedFields.push('Credenziali/Link di Accesso');
  if (stringified.includes('acct_')) leakedFields.push('Stripe Account ID');

  if (leakedFields.length === 0) {
    console.log('✅ ZERO DATA LEAKAGE: Nessun dato bancario, email privata o credenziale esposta.');
    console.log('   Campi pubblici visibili:', Object.keys(memberGroupView));
  } else {
    console.error('❌ DATA LEAK DETECTED:', leakedFields);
    process.exit(1);
  }

  // STEP 8: CHIUSURA E ARCHIVIAZIONE GRUPPO DI TEST PER LASCIARE IL MARKETPLACE PULITO
  console.log('\n[STEP 8] Archiviazione Gruppo di Test (Transizione a CLOSED)...');
  const cancelResp = await fetch(`${BASE_URL}/api/groups/${groupId}/cancel`, {
    method: 'POST',
    headers: authHeaders
  });
  const cancelData = await cancelResp.json();
  console.log(`✅ ${cancelData.message}`);

  // Verifica Marketplace finale vuoto
  const finalMarketResp = await fetch(`${BASE_URL}/api/groups`);
  const finalMarketData = await finalMarketResp.json();
  console.log(`   Gruppi finali nel Marketplace pubblico: ${finalMarketData.groups.length}`);
  if (finalMarketData.groups.length === 0) {
    console.log('✅ Marketplace ritornato allo stato vuoto [] (0 gruppi visibili).');
  } else {
    console.error('❌ ERRORE: Il marketplace finale non è vuoto!');
    process.exit(1);
  }

  // STEP 9: VERIFICA INTEGRITÀ FINANZIARIA (PAYPAL SUBSCRIPTION & LEDGER)
  console.log('\n[STEP 9] Verifica Integrità Finanziaria...');
  const statusResp = await fetch(`${BASE_URL}/api/webhooks/paypal/status`);
  const statusData = await statusResp.json();
  const sub = statusData.activeSubscriptions.find(s => s.paypalSubscriptionId === 'I-MDJSFS3MRVBY');
  const cycle = statusData.recordedCycles.find(c => c.subscriptionId === 'I-MDJSFS3MRVBY');

  if (sub && sub.status === 'ACTIVE' && cycle && cycle.payoutStatus === 'PAID') {
    console.log('✅ Subscription I-MDJSFS3MRVBY e Ledger Ciclo 1 100% INTATTI.');
  } else {
    console.error('❌ ERRORE: Dati finanziari compromessi!');
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('🎯 AUDIT CAPOGRUPPO COMPLETATO CON SUCCESSO AL 100%!');
  console.log('====================================================');
}

runAudit();
