/**
 * Test Card and PayPal Checkout Flows
 */

process.env.PORT = '3098';

const BASE_URL = 'http://localhost:3098';

async function testCheckout() {
  console.log('====================================================');
  console.log('   TEST CHECKOUT PAGAMENTI: CARTA & PAYPAL         ');
  console.log('====================================================\n');

  await import('../server/index.js');

  // 1. Registra / Autentica un utente compratore
  let token = null;
  let user = null;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'acquirente@test.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      termsConsent: true,
      privacyConsent: true
    })
  });
  const regData = await regRes.json();
  if (regData.token) {
    token = regData.token;
    user = regData.user;
  } else {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'acquirente@test.com', password: 'Password123!' })
    });
    const loginData = await loginRes.json();
    token = loginData.token;
    user = loginData.user;
  }
  console.log(`[1] Utente acquirente: ${user.fullName} (${user.email}) - Token: ${!!token}`);

  // 2. Prendi il gruppo Spotify o Gemini o YouTube
  const groupsRes = await fetch(`${BASE_URL}/api/groups`);
  const groupsData = await groupsRes.json();
  const targetGroup = groupsData.groups[0];
  console.log(`[2] Gruppo target per acquisto: ${targetGroup.customServiceName} (${targetGroup.id})`);

  // 3. Test Checkout CARTA (/api/checkout/stripe/process)
  console.log('\n[3] Test Checkout CARTA (/api/checkout/stripe/process)...');
  const cardSession = {
    groupId: targetGroup.id,
    groupName: targetGroup.customServiceName,
    planName: targetGroup.planName,
    slotNumber: 2,
    baseShareCents: targetGroup.baseMemberShareCents,
    platformFeeCents: 149,
    totalAmountCents: targetGroup.baseMemberShareCents + 149,
    memberId: user.id,
    memberEmail: user.email,
    memberName: user.fullName,
    ownerId: targetGroup.ownerId,
    paymentMethod: 'CARD_EEA'
  };

  const cardRes = await fetch(`${BASE_URL}/api/checkout/stripe/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      sessionData: cardSession,
      testScenario: 'success'
    })
  });

  const cardData = await cardRes.json();
  console.log('    Risposta Card Checkout:', cardRes.status, cardData);

  // 4. Test Checkout PAYPAL Plan & Activate/Capture
  console.log('\n[4] Test PayPal Plan & Safety Lock check...');
  const ppPlanRes = await fetch(`${BASE_URL}/api/checkout/paypal/plan?serviceName=${encodeURIComponent(targetGroup.customServiceName)}&amountCents=${cardSession.totalAmountCents}`);
  const ppPlanData = await ppPlanRes.json();
  console.log('    Risposta PayPal Plan:', ppPlanRes.status, ppPlanData);

  const ppActRes = await fetch(`${BASE_URL}/api/checkout/paypal/subscription-activate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      subscriptionId: 'I-TEST12345678',
      sessionData: cardSession
    })
  });
  const ppActData = await ppActRes.json();
  console.log('    Risposta PayPal Activate:', ppActRes.status, ppActData);
}

testCheckout();
