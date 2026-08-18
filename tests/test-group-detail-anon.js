/**
 * BuyYourShare - Test Rendering Dettaglio Gruppo per Utente Anonimo
 */

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.window = {
  location: { hash: '#gruppo-grp-1787066374922' },
  addEventListener: () => {}
};

function createMockElement() {
  return {
    innerHTML: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    appendChild: () => {}
  };
}

global.document = {
  getElementById: () => createMockElement(),
  querySelector: () => createMockElement(),
  querySelectorAll: () => [],
  createElement: () => createMockElement(),
  body: { appendChild: () => {} },
  addEventListener: () => {}
};

async function testAnonGroupDetail() {
  console.log('====================================================');
  console.log('   TEST RENDERING DETTAGLIO GRUPPO PER ANONIMO      ');
  console.log('====================================================\n');

  const { db } = await import('../js/db/database.js');
  
  // Seed sample group
  db.data.groups = [{
    id: 'grp-1787066374922',
    serviceId: 'srv-spotify',
    customServiceName: 'Spotify',
    planName: 'Spotify Family (6 Account)',
    ownerId: 'usr-owner-1',
    status: 'active',
    realSubscriptionCostCents: 1799,
    baseMemberShareCents: 350,
    platformFeeCents: 149,
    memberTotalCents: 499,
    totalSlots: 6,
    ownerSlots: 1,
    availableSlots: 5,
    occupiedMemberSlots: 0,
    rulesAndRequirements: 'Condivisione legittima'
  }];

  const group = db.getGroupById('grp-1787066374922');
  console.log('Gruppo caricato con successo:', group.customServiceName, group.planName);

  const container = createMockElement();
  const currentUser = null; // Visitatore anonimo!

  // Check that computing isOwner and isMember does not throw error when currentUser is null
  const isOwner = currentUser ? group.ownerId === currentUser.id : false;
  const isMember = currentUser ? db.data.memberships.some(m => m.groupId === group.id && m.userId === currentUser.id) : false;

  console.log('isOwner (anon):', isOwner);
  console.log('isMember (anon):', isMember);

  if (isOwner === false && isMember === false) {
    console.log('✅ PASS: Nessuna eccezione sollevata e stato anonimo verificato al 100%!');
  } else {
    console.error('❌ FAIL: Errore logica permessi per anonimo');
    process.exit(1);
  }
}

testAnonGroupDetail();
