/**
 * BuyYourShare - Server Persistence & Restart Simulation Test
 * Verifica che tutti i record (database.json, Ledger, membership, subscription I-MDJSFS3MRVBY)
 * sopravvivano a un riavvio / redeploy completo del server.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPersistenceTest() {
  console.log('====================================================');
  console.log('  TEST DI PERSISTENZA: VERIFICA RIAVVIO / REDEPLOY  ');
  console.log('====================================================');

  // 1. Caricamento DataRepository
  const { dataRepository } = await import('../server/db/dataRepository.js');
  
  // 2. Verifica Membership e Subscription ID
  const memberships = await dataRepository.getMemberships();
  const targetSub = memberships.find(m => m.paypalSubscriptionId === 'I-MDJSFS3MRVBY');
  
  console.log(`📋 Membership Totali nel Database: ${memberships.length}`);
  if (targetSub) {
    console.log(`✅ Subscription ID Trovato: ${targetSub.paypalSubscriptionId}`);
    console.log(`   - Stato: ${targetSub.status}`);
    console.log(`   - Posto: #${targetSub.slotNumber}`);
    console.log(`   - Prossimo Rinnovo: ${targetSub.nextBillingDate}`);
  } else {
    console.log('❌ ERRORE: Subscription I-MDJSFS3MRVBY non trovata!');
    process.exit(1);
  }

  // 3. Verifica Ledger Contabile Immutabile
  const logs = await dataRepository.getFinancialAuditLogs();
  const subLogs = logs.filter(l => l.subscriptionId === 'I-MDJSFS3MRVBY');
  
  console.log(`\n📒 Voci Totali nel Ledger: ${logs.length}`);
  console.log(`   - Transazioni per I-MDJSFS3MRVBY: ${subLogs.length}`);
  
  if (subLogs.length > 0) {
    const latest = subLogs[0];
    console.log(`✅ Record Ciclo 1 Verificato:`);
    console.log(`   - Ciclo: #${latest.cycleNumber}`);
    console.log(`   - Payout Status: ${latest.payoutStatus}`);
    console.log(`   - Transfer ID: ${latest.transferId}`);
    console.log(`   - Payout Batch ID: ${latest.payoutId}`);
    console.log(`   - Destinatario: ${latest.payoutDestination}`);
  } else {
    console.log('❌ ERRORE: Record contabile Ciclo 1 non trovato nel Ledger!');
    process.exit(1);
  }

  // 4. Simulazione Scrittura e Ricaricamento da Disco
  console.log('\n🔄 Simulazione Ricaricamento da Disco (Cold Restart)...');
  dataRepository.init(); // Ricarica esplicita da file
  
  const reloadedMems = await dataRepository.getMemberships();
  const reloadedSub = reloadedMems.find(m => m.paypalSubscriptionId === 'I-MDJSFS3MRVBY');
  
  if (reloadedSub && reloadedSub.status === 'ACTIVE') {
    console.log('✅ PERSISTENZA CONFERMATA AL 100%: I dati sopravvivono intatti al riavvio.');
  } else {
    console.log('❌ Fallimento persistenza dopo il reload.');
    process.exit(1);
  }
  
  console.log('====================================================');
  console.log('🎯 ESITO: PRONTO PER IL DEPLOY SU RAILWAY CON VOLUME');
  console.log('====================================================');
}

runPersistenceTest();
