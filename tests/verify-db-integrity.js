import fs from 'fs';
import path from 'path';

const dbPath = path.resolve('server/data/database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const group = db.groups.find(g => g.id === 'grp-1787066374922');
console.log('Group Marco Rossi:', group ? `${group.id} (${group.customServiceName}) - Status: ${group.status} - Slots: ${group.availableSlots}/${group.totalSlots}` : 'NOT FOUND');

const subMem = db.memberships?.find(m => m.paypalSubscriptionId === 'I-MDJSFS3MRVBY');
console.log('Subscription I-MDJSFS3MRVBY in Memberships:', subMem ? `Found: ${subMem.id} - Group: ${subMem.groupId} - Status: ${subMem.status}` : 'NOT FOUND');

const subLog = db.financialAuditLogs?.find(l => l.paypalSubscriptionId === 'I-MDJSFS3MRVBY' || l.transactionId === 'I-MDJSFS3MRVBY');
console.log('Subscription I-MDJSFS3MRVBY in Ledger:', subLog ? `Found - Amount: ${subLog.totalAmountCents}c` : 'NOT FOUND');

console.log('Total Ledger Entries:', db.financialAuditLogs?.length);
console.log('Total Groups in DB:', db.groups?.length);
console.log('Published Groups:', db.groups?.filter(g => g.status === 'PUBLISHED').length);
