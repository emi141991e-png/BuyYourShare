/**
 * Test Suite: Rimozione Dati Bancari Fittizi, Configurazione PayPal LIVE e Safety Lock
 */

import { config } from '../server/config/env.js';
import { dataRepository } from '../server/db/dataRepository.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('  TEST: RIMOZIONE DATI BANCARI & PAYPAL LIVE READY   ');
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

  // 1. VERIFICA RIMOZIONE DATI BANCARI FITTIZI
  console.log('[TEST 1] Verifica Assenza Totale Dati Bancari Fittizi nel Database...');
  const allUsers = await dataRepository.getAllUsersAdmin();
  const usersWithIban = allUsers.filter(u => u.iban || u.bankName || u.bankLast4);
  assert('Nessun utente possiede IBAN o banca fittizia nel DB', usersWithIban.length === 0, `Trovati: ${usersWithIban.length}`);

  // 2. VERIFICA CONFIGURAZIONE PAYPAL LIVE
  console.log('\n[TEST 2] Verifica Configurazione Endpoint PayPal LIVE...');
  assert('PayPal Mode è impostato su LIVE (default)', config.paypal.mode === 'live');
  assert('PayPal API Base URL punta a https://api-m.paypal.com', config.paypal.apiBaseUrl === 'https://api-m.paypal.com');
  assert('Safety Lock è ATTIVO per default per proteggere i test', config.paypal.safetyLockActive === true);

  // 3. VERIFICA SICUREZZA CLIENT SECRET
  console.log('\n[TEST 3] Verifica Isolamento Client Secret...');
  const dashMetrics = await dataRepository.getAdminDashboardMetrics();
  const serializedMetrics = JSON.stringify(dashMetrics);
  assert('Dashboard metrics non espongono PayPal Client Secret', !serializedMetrics.includes(config.paypal.clientSecret || 'secret_leak'));
  assert('Dashboard metrics non espongono Stripe Secret', !serializedMetrics.includes(config.stripe.secretKey));

  // 4. VERIFICA INTEGRITÀ GRUPPO REALE MARCO ROSSI
  console.log('\n[TEST 4] Verifica Integrità Gruppo Reale Marco Rossi...');
  const realGroup = await dataRepository.findGroupById('grp-1787066374922');
  assert('Gruppo Marco Rossi esiste', !!realGroup);
  assert('Gruppo Marco Rossi è Spotify Family (6 Account)', realGroup?.planName === 'Spotify Family (6 Account)');
  assert('Gruppo Marco Rossi è PUBLISHED', realGroup?.status === 'PUBLISHED');
  assert('Gruppo Marco Rossi ha 5 posti disponibili', realGroup?.availableSlots === 5);
  assert('Gruppo Marco Rossi quota membro 4,99 € (499 cents)', realGroup?.memberTotalCents === 499);

  // 5. VERIFICA INTEGRITÀ LEDGER CICLO 1
  console.log('\n[TEST 5] Verifica Integrità Storico Ledger Ciclo 1...');
  const auditLogs = await dataRepository.getFinancialAuditLogs();
  assert('Ledger contiene 9 transazioni contabili storiche', auditLogs.length === 9);
  
  const memberships = await dataRepository.getMemberships({ groupId: 'grp-1042' });
  const realSub = memberships.find(m => m.paypalSubscriptionId === 'I-MDJSFS3MRVBY');
  assert('Subscription I-MDJSFS3MRVBY presente e attiva', !!realSub && realSub.status === 'ACTIVE');

  // 6. VERIFICA MARKETPLACE PUBBLICO (ESCLUSIVAMENTE GRUPPI REALI PUBBLICATI)
  console.log('\n[TEST 6] Verifica Marketplace Pubblico...');
  const publicGroups = await dataRepository.getGroups({ status: 'PUBLISHED' });
  assert('Marketplace contiene esattamente 1 gruppo reale pubblicato', publicGroups.length === 1);
  assert('L\'unico gruppo pubblicato è quello di Marco Rossi', publicGroups[0].id === 'grp-1787066374922');

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO SUITE: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runTestSuite();
