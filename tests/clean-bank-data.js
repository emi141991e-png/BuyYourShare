import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('server/data/database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('=== UTENTI PRIMA DELLA PULIZIA ===');
db.users.forEach(u => {
  console.log(`- ${u.id} (${u.fullName}): IBAN=${u.iban || 'null'}, Bank=${u.bankName || 'null'}, PayoutEmail=${u.paypalPayoutEmail || 'null'}`);
});

// Rimozione completa di tutti i dati bancari fittizi
db.users.forEach(u => {
  delete u.iban;
  delete u.bankName;
  delete u.bankLast4;
  delete u.fiscalCode;
  delete u.accountHolderName;
  delete u.stripePayoutIban;
  // Se paypalPayoutEmail era un'email fittizia di test / sandbox, rimuoviamola o impostiamola a null se non reale
  if (u.paypalPayoutEmail && (u.paypalPayoutEmail.includes('example.com') || u.paypalPayoutEmail.includes('sb-'))) {
    delete u.paypalPayoutEmail;
  }
});

// Pulizia anche in stripeAccounts mock se presenti
if (db.stripeAccounts) {
  db.stripeAccounts.forEach(sa => {
    delete sa.iban;
    delete sa.bankLast4;
  });
}

// Salvataggio atomico del database
fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

console.log('\n=== UTENTI DOPO LA PULIZIA ===');
const dbClean = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
dbClean.users.forEach(u => {
  console.log(`- ${u.id} (${u.fullName}): IBAN=${u.iban || 'NON_CONFIGURATO'}, Bank=${u.bankName || 'NON_CONFIGURATO'}`);
});

console.log('\n✅ PULIZIA COMPLETATA CON SUCCESSO!');
