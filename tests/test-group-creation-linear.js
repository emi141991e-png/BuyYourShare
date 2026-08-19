/**
 * Verification Test: Group Creation with Linear IBAN Step & Instant Marketplace Publication
 */

process.env.PORT = '3099';

const BASE_URL = 'http://localhost:3099';

async function runGroupCreationTest() {
  console.log('================================================================');
  console.log('   TEST: CREAZIONE GRUPPO LINEARE, IBAN STEP 1 & PUBBLICAZIONE   ');
  console.log('================================================================\n');

  await import('../server/index.js');

  // 1. Registra un utente Capogruppo reale
  const testEmail = `capogruppo_${Date.now()}@example.com`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Giuseppe',
      lastName: 'Verdi',
      email: testEmail,
      password: 'Password123!',
      confirmPassword: 'Password123!',
      termsConsent: true,
      privacyConsent: true
    })
  });
  const regData = await regRes.json();
  const token = regData.token;
  const user = regData.user;
  console.log(`[1] Registrazione Capogruppo: ${user.fullName} (${user.email}) - Success: ${regData.success}`);

  // 2. Invia Creazione Gruppo con Prezzo Personalizzato (es. 15,99 €) e IBAN
  const groupPayload = {
    serviceId: 'srv-youtube',
    customServiceName: 'YouTube Premium',
    planName: 'Famiglia (5 Membri)',
    realCostEuros: '15.99',
    totalSlots: 5,
    ownerSlots: 1,
    accessUrl: 'https://youtube.com/invite/test12345',
    instructions: 'Clicca sul link di invito per unirti al gruppo famiglia.',
    additionalInfo: 'Musica senza pubblicità inclusa',
    accessCode: '',
    payoutIban: 'IT89N0306909606100000012345',
    payoutLegalName: 'Giuseppe Verdi',
    payoutBankName: 'Banca Intesa',
    publishImmediately: true
  };

  console.log(`\n[2] Invocazione POST /api/groups con costo 15.99 € e IBAN in Step 1...`);
  const createRes = await fetch(`${BASE_URL}/api/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(groupPayload)
  });

  const createData = await createRes.json();
  console.log('    Risposta POST /api/groups status:', createRes.status);
  console.log('    Gruppo Creato:', {
    id: createData.group?.id,
    name: createData.group?.customServiceName,
    realCostCents: createData.group?.realSubscriptionCostCents,
    baseMemberShareCents: createData.group?.baseMemberShareCents,
    totalSlots: createData.group?.totalSlots,
    status: createData.group?.status,
    isPublished: createData.group?.isPublished
  });

  // 3. Verifica Visibilità Immediata nel Marketplace pubblico
  console.log(`\n[3] Verifica Visibilità Immediata in GET /api/groups...`);
  const listRes = await fetch(`${BASE_URL}/api/groups`);
  const listData = await listRes.json();
  const found = (listData.groups || []).find(g => g.id === createData.group?.id);
  console.log(`    Gruppo trovato nel Marketplace pubblico: ${!!found} (Status: ${found?.status}, Slots Disponibili: ${found?.availableSlots})`);

  if (found && found.status === 'PUBLISHED' && found.realSubscriptionCostCents === 1599) {
    console.log('\n✅ TEST SUPERATO CON SUCCESSO: Gruppo pubblicato immediatamente con prezzo e dati esatti scelti dal Capogruppo!');
    process.exit(0);
  } else {
    console.error('\n❌ ERRORE: Gruppo non visibile o dati non corretti.');
    process.exit(1);
  }
}

runGroupCreationTest();
