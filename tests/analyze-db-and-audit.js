/**
 * Comprehensive Database & Audit Inspection Script
 */

import { dataRepository } from '../server/db/dataRepository.js';
import { config } from '../server/config/env.js';

async function analyze() {
  console.log('====================================================');
  console.log('       ANALISI COMPLETA DATABASE & AUDIT LOGS       ');
  console.log('====================================================\n');

  const users = await dataRepository.getAllUsersAdmin();
  const groups = await dataRepository.getGroups();
  const memberships = await dataRepository.getMemberships();
  const finLogs = await dataRepository.getFinancialAuditLogs();
  const adminLogs = await dataRepository.getAdminAuditLogs();

  console.log(`[1] UTENTI TOTALI NEL DB (${users.length}):`);
  users.forEach((u, i) => {
    console.log(`  ${i+1}. ID: ${u.id} | Email: ${u.email} | Nome: ${u.fullName} | Ruolo: ${u.role} | Sospeso: ${u.isSuspended} | Creato: ${u.createdAt}`);
  });

  console.log(`\n[2] GRUPPI TOTALI NEL DB (${groups.length}):`);
  groups.forEach((g, i) => {
    console.log(`  ${i+1}. ID: ${g.id} | Servizio: ${g.customServiceName} (${g.planName}) | Stato: ${g.status} | OwnerId: ${g.ownerId} | Posti: ${g.availableSlots}/${g.totalSlots} | Creato: ${g.createdAt}`);
  });

  console.log(`\n[3] MEMBERSHIPS TOTALI NEL DB (${memberships.length}):`);
  memberships.forEach((m, i) => {
    console.log(`  ${i+1}. ID: ${m.id} | Gruppo: ${m.groupId} | User: ${m.userId} | Stato: ${m.status} | Sub ID: ${m.paypalSubscriptionId || m.stripeSubscriptionId || 'N/A'}`);
  });

  console.log(`\n[4] AUDIT LOGS FINANZIARI NEL DB (${finLogs.length}):`);
  finLogs.forEach((l, i) => {
    console.log(`  ${i+1}. TX: ${l.transactionId || l.id} | Evento/Metodo: ${l.paymentMethod} | Quota: ${l.baseShareCents}c | Fee: ${l.buyyourshareFeeCents}c | Payout: ${l.payoutStatus} | Sub: ${l.subscriptionId}`);
  });

  console.log(`\n[5] AUDIT LOGS ADMIN (AZIONI RECENTI) (${adminLogs.length}):`);
  adminLogs.forEach((a, i) => {
    console.log(`  ${i+1}. Data: ${a.timestamp} | Azione: ${a.action} | Target: ${a.targetType} (${a.targetId}) | Eseguito da: ${a.performedBy} | Dettagli: ${JSON.stringify(a.details)}`);
  });

  console.log('\n[6] CONFIGURAZIONE PAYPAL ATTUALE:');
  console.log(`  Mode: ${config.paypal.mode}`);
  console.log(`  Base URL: ${config.paypal.apiBaseUrl}`);
  console.log(`  Safety Lock: ${config.paypal.safetyLockActive}`);
  console.log(`  Client ID presente: ${!!config.paypal.clientId} (Lunghezza: ${config.paypal.clientId?.length || 0})`);
  console.log(`  Client ID inizia con: ${config.paypal.clientId ? config.paypal.clientId.substring(0, 8) + '...' : 'N/A'}`);
  console.log(`  Client Secret presente: ${!!config.paypal.clientSecret}`);

  console.log('\n====================================================');
}

analyze();
