async function check() {
  const resp = await fetch('http://localhost:3000/api/groups');
  const data = await resp.json();
  console.log('--- RISPOSTA GET /api/groups ---');
  console.log('Count:', data.groups.length);
  console.log('JSON:', JSON.stringify(data.groups));

  const paypalResp = await fetch('http://localhost:3000/api/webhooks/paypal/status');
  const paypalData = await paypalResp.json();
  console.log('\n--- VERIFICA INTEGRITÀ PAYPAL & LEDGER ---');
  console.log('Active Subscriptions Count:', paypalData.activeSubscriptionsCount);
  console.log('Subscription ID:', paypalData.activeSubscriptions[0]?.paypalSubscriptionId);
  console.log('Subscription Status:', paypalData.activeSubscriptions[0]?.status);
  console.log('Recorded Ledger Cycles Count:', paypalData.recordedCyclesCount);
  console.log('Cycle 1 Payout Status:', paypalData.recordedCycles[0]?.payoutStatus);
  console.log('Cycle 1 Payout Batch ID:', paypalData.recordedCycles[0]?.payoutId);
  console.log('Cycle 1 Transfer Item ID:', paypalData.recordedCycles[0]?.transferId);
}

check();
