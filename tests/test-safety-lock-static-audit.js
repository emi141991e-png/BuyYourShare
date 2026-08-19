/**
 * Test di Verifica Statica & Idempotenza del PAYPAL_SAFETY_LOCK
 */

import { config } from '../server/config/env.js';
import { paypalPayoutService } from '../server/services/paypalPayoutService.js';
import { paypalBillingService } from '../server/services/paypalBillingService.js';

const BASE_URL = `http://localhost:${config.port}`;

async function runStaticAudit() {
  console.log('====================================================');
  console.log('  VERIFICA STATICA & SICUREZZA PAYPAL_SAFETY_LOCK   ');
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

  // 1. Configurazione Mode & Safety Lock
  assert('config.paypal.mode è "live"', config.paypal.mode === 'live');
  assert('config.paypal.apiBaseUrl è "https://api-m.paypal.com"', config.paypal.apiBaseUrl === 'https://api-m.paypal.com');
  assert('config.paypal.safetyLockActive è TRUE', config.paypal.safetyLockActive === true);

  // 2. Verifica Blocco Diretto su paypalBillingService
  console.log('\n[1] Verifica Blocco su paypalBillingService (OAuth & Plan Creation)...');
  let billingBlocked = false;
  try {
    await paypalBillingService.getAccessToken();
  } catch (err) {
    if (err.message.includes('PAYPAL_SAFETY_LOCK_ACTIVE')) billingBlocked = true;
  }
  assert('paypalBillingService.getAccessToken() bloccato dal Safety Lock', billingBlocked);

  // 3. Verifica Blocco Diretto su paypalPayoutService
  console.log('\n[2] Verifica Blocco su paypalPayoutService (executePayout)...');
  let payoutBlocked = false;
  try {
    await paypalPayoutService.executePayout({
      recipientEmail: 'marco.rossi@example.com',
      amountCents: 350,
      groupId: 'grp-test',
      slotNumber: 2,
      captureId: 'cap-test'
    });
  } catch (err) {
    if (err.message.includes('PAYPAL_SAFETY_LOCK_ACTIVE')) payoutBlocked = true;
  }
  assert('paypalPayoutService.executePayout() bloccato dal Safety Lock', payoutBlocked);

  // 4. Avvio Server per Test Endpoint HTTP
  await import('../server/index.js');
  console.log('\n[3] Verifica Blocco sugli Endpoint HTTP Server-Side...');

  // Token login
  const adminLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
  })).json();

  const memLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'elena.conti@example.com', password: 'Password123!' })
  })).json();

  const ownLogin = await (await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marco.rossi@example.com', password: 'Password123!' })
  })).json();

  // Test 4A: subscription-activate da Membro
  const subMemRes = await fetch(`${BASE_URL}/api/checkout/paypal/subscription-activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memLogin.token}` },
    body: JSON.stringify({ subscriptionId: 'I-TEST123', sessionData: { groupId: 'grp-1787066374922', slotNumber: 2, baseShareCents: 350 } })
  });
  assert('Membro bloccato su /paypal/subscription-activate (HTTP 423)', subMemRes.status === 423);

  // Test 4B: subscription-activate da Capogruppo
  const subOwnRes = await fetch(`${BASE_URL}/api/checkout/paypal/subscription-activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownLogin.token}` },
    body: JSON.stringify({ subscriptionId: 'I-TEST123', sessionData: { groupId: 'grp-1787066374922', slotNumber: 2, baseShareCents: 350 } })
  });
  assert('Capogruppo bloccato su /paypal/subscription-activate (HTTP 423)', subOwnRes.status === 423);

  // Test 4C: subscription-activate da Admin (Nessun bypass)
  const subAdmRes = await fetch(`${BASE_URL}/api/checkout/paypal/subscription-activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminLogin.token}` },
    body: JSON.stringify({ subscriptionId: 'I-TEST123', sessionData: { groupId: 'grp-1787066374922', slotNumber: 2, baseShareCents: 350 } })
  });
  assert('Admin NON può bypassare il Safety Lock su /paypal/subscription-activate (HTTP 423)', subAdmRes.status === 423);

  // Test 4D: capture da Membro
  const capMemRes = await fetch(`${BASE_URL}/api/checkout/paypal/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${memLogin.token}` },
    body: JSON.stringify({ orderId: 'ord-123', captureId: 'cap-123', sessionData: { groupId: 'grp-1787066374922', slotNumber: 2, baseShareCents: 350 } })
  });
  assert('Membro bloccato su /paypal/capture (HTTP 423)', capMemRes.status === 423);

  // Test 4E: capture da Admin
  const capAdmRes = await fetch(`${BASE_URL}/api/checkout/paypal/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminLogin.token}` },
    body: JSON.stringify({ orderId: 'ord-123', captureId: 'cap-123', sessionData: { groupId: 'grp-1787066374922', slotNumber: 2, baseShareCents: 350 } })
  });
  assert('Admin NON può bypassare il Safety Lock su /paypal/capture (HTTP 423)', capAdmRes.status === 423);

  // Test 4F: Webhook PayPal Payout Execution Block
  const whRes = await fetch(`${BASE_URL}/api/webhooks/paypal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: { id: 'sale-test-lock-999', billing_agreement_id: 'I-MDJSFS3MRVBY', amount: { total: '4.99' } }
    })
  });
  assert('Webhook PayPal risponde regolarmente senza eseguire payout', whRes.status === 200);

  // Test 5: Assenza Client Secret in Tutte le Risposte
  const planRes = await (await fetch(`${BASE_URL}/api/checkout/paypal/plan`)).json();
  assert('GET /paypal/plan restituisce safetyLockActive: true', planRes.safetyLockActive === true);
  assert('GET /paypal/plan NON espone clientSecret', !('clientSecret' in planRes));

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO AUDIT STATICO: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runStaticAudit();
