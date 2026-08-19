/**
 * Read-Only Deep Database Audit Script
 * Nessuna modifica, nessuna cancellazione, sola lettura.
 */

import { dataRepository } from '../server/db/dataRepository.js';

async function check() {
  console.log('====================================================');
  console.log('       VERIFICA ESCLUSIVAMENTE IN LETTURA           ');
  console.log('====================================================\n');

  const groups = await dataRepository.getGroups();
  const users = await dataRepository.getAllUsersAdmin();
  const memberships = await dataRepository.getMemberships();
  const financialLogs = await dataRepository.getFinancialAuditLogs();

  // 1. Gruppo Spotify di Marco Rossi
  const spotifyGroup = groups.find(g => g.id === 'grp-1787066374922');
  console.log('[1] GRUPPO SPOTIFY MARCO ROSSI (grp-1787066374922):');
  if (spotifyGroup) {
    console.log(`  - Esiste: SI`);
    console.log(`  - Nome Servizio: ${spotifyGroup.customServiceName}`);
    console.log(`  - Piano: ${spotifyGroup.planName}`);
    console.log(`  - Stato: ${spotifyGroup.status}`);
    console.log(`  - Visibile Marketplace: ${spotifyGroup.status === 'PUBLISHED' ? 'SI' : 'NO'}`);
    console.log(`  - Posti Totali: ${spotifyGroup.totalSlots}`);
    console.log(`  - Posti Disponibili: ${spotifyGroup.availableSlots}`);
    console.log(`  - Quota Membro Totale: ${(spotifyGroup.memberTotalCents/100).toFixed(2)} €/mese (Base: ${(spotifyGroup.baseMemberShareCents/100).toFixed(2)} € + Fee: ${(spotifyGroup.platformFeeCents/100).toFixed(2)} €)`);
    console.log(`  - OwnerId: ${spotifyGroup.ownerId}`);
  } else {
    console.log(`  - Esiste: NO`);
  }

  // Memberships & Ledger per Spotify
  const spotifyMemberships = memberships.filter(m => m.groupId === 'grp-1787066374922');
  const spotifyLogs = financialLogs.filter(l => l.groupId === 'grp-1787066374922');
  console.log(`  - Memberships collegate a grp-1787066374922: ${spotifyMemberships.length}`);
  spotifyMemberships.forEach(m => {
    console.log(`      * MemId: ${m.id} | UserId: ${m.userId} | Slot: ${m.slotNumber} | Role: ${m.role} | Stato: ${m.status} | Sub: ${m.paypalSubscriptionId || 'N/A'}`);
  });
  console.log(`  - Record Ledger collegati a grp-1787066374922: ${spotifyLogs.length}`);
  spotifyLogs.forEach(l => {
    console.log(`      * TX: ${l.transactionId} | Importo: ${(l.totalAmountCents/100).toFixed(2)} € | Metodo: ${l.paymentMethod} | Payout: ${l.payoutStatus}`);
  });

  // 2. Gli 8 Gruppi YouTube Test Draft
  console.log('\n[2] GLI 8 GRUPPI YOUTUBE TEST DRAFT:');
  const ytGroups = groups.filter(g => g.id.startsWith('grp-1787072') || g.id.startsWith('grp-1787083') || g.id.startsWith('grp-1787084') || g.id.startsWith('grp-1787085') || g.id.startsWith('grp-1787086') || g.id.startsWith('grp-1787087'));
  ytGroups.forEach((g, idx) => {
    const gMembers = memberships.filter(m => m.groupId === g.id);
    const gLogs = financialLogs.filter(l => l.groupId === g.id);
    console.log(`  ${idx+1}. ID: ${g.id} | Stato: ${g.status} | Membri non-owner: ${gMembers.filter(m => m.role !== 'OWNER').length} | Ledger: ${gLogs.length}`);
  });

  // 3. Gli 11 Utenti example.com
  console.log('\n[3] GLI 11 UTENTI @EXAMPLE.COM:');
  const exUsers = users.filter(u => u.email.endsWith('@example.com'));
  exUsers.forEach((u, idx) => {
    const uMemberships = memberships.filter(m => m.userId === u.id);
    const uOwnedGroups = groups.filter(g => g.ownerId === u.id);
    const uLogs = financialLogs.filter(l => l.memberId === u.id || l.connectedAccountId === u.id);
    console.log(`  ${idx+1}. ID: ${u.id} | Email: ${u.email} | Nome: ${u.fullName} | Gruppi creati: ${uOwnedGroups.length} | Memberships: ${uMemberships.length} | Transazioni Ledger: ${uLogs.length} | IBAN presente: ${!!u.iban}`);
  });

  console.log('\n[4] VERIFICA MARKETPLACE PUBBLICO:');
  const publicMarket = await dataRepository.getGroups({ status: 'PUBLISHED' });
  console.log(`  Gruppi restituiti per il Marketplace: ${publicMarket.length}`);
  publicMarket.forEach(g => {
    console.log(`    - ID: ${g.id} | ${g.customServiceName} (${g.planName}) | Posti liberi: ${g.availableSlots}/${g.totalSlots} | Prezzo: ${(g.memberTotalCents/100).toFixed(2)} €/mese`);
  });

  console.log('\n====================================================');
}

check();
