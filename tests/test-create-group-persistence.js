/**
 * Test Group Creation Server-Side Persistence
 */

process.env.PORT = '3099';

import { dataRepository } from '../server/db/dataRepository.js';

const BASE_URL = 'http://localhost:3099';

async function testPersistence() {
  console.log('====================================================');
  console.log('   TEST PERSISTENZA CREAZIONE GRUPPO SERVER-SIDE   ');
  console.log('====================================================\n');

  await import('../server/index.js');

  // Login Admin o User
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
  });
  const auth = await loginRes.json();
  const token = auth.token;

  // 1. Creazione gruppo Gemini AI
  console.log('[1] Creazione gruppo Gemini AI via POST /api/groups...');
  const createRes = await fetch(`${BASE_URL}/api/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      serviceId: 'srv-gemini',
      customServiceName: 'Gemini Advanced',
      planName: 'Google One AI Premium (2TB)',
      realCostEuros: '21.99',
      totalSlots: 5,
      ownerSlots: 1,
      accessUrl: 'https://gemini.google.com',
      instructions: 'Invito via gruppo Famiglia Google One.',
      additionalInfo: 'Include 2TB di cloud storage e Gemini 1.5 Pro.',
      publishImmediately: true
    })
  });

  const createData = await createRes.json();
  console.log('    Risposta creazione:', createData);

  if (createRes.status !== 201 || !createData.success) {
    console.error('❌ Creazione fallita');
    process.exit(1);
  }

  const createdGroupId = createData.group.id;
  console.log(`✅ Gruppo creato sul server con ID: ${createdGroupId}`);

  // 2. Verifica recupero nel catalogo pubblico GET /api/groups
  console.log('\n[2] Verifica presenza nel Marketplace pubblico GET /api/groups...');
  const marketRes = await fetch(`${BASE_URL}/api/groups`);
  const marketData = await marketRes.json();
  const foundInMarket = marketData.groups.find(g => g.id === createdGroupId);

  if (foundInMarket) {
    console.log(`✅ PASS: Gruppo ${createdGroupId} trovato nel Marketplace!`);
    console.log(`    Nome: ${foundInMarket.customServiceName} (${foundInMarket.planName})`);
    console.log(`    Posti liberi: ${foundInMarket.availableSlots}/${foundInMarket.totalSlots}`);
    console.log(`    Quota membro: ${(foundInMarket.memberTotalCents/100).toFixed(2)} €/mese`);
  } else {
    console.error(`❌ FAIL: Gruppo ${createdGroupId} non trovato nel Marketplace.`);
    process.exit(1);
  }

  // 3. Verifica persistenza nel DataRepository / database.json
  const repoGroup = await dataRepository.findGroupById(createdGroupId);
  if (repoGroup && repoGroup.status === 'PUBLISHED') {
    console.log(`✅ PASS: Gruppo salvato con successo nel file database.json!`);
  } else {
    console.error(`❌ FAIL: Gruppo non trovato nel repository.`);
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('   🎉 TEST SUPERATO: PERSISTENZA TOTALE CONFERMATA   ');
  console.log('====================================================');
}

testPersistence();
