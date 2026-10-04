import test from 'node:test';
import assert from 'node:assert/strict';
import {quotaState,confirmedThisMonth} from '../js/ui/groupWorkspace.js';
test('quota states distinguish reported payment, expiry and departure',()=>{
 assert.equal(quotaState({status:'reported'})[0],'review');
 assert.equal(quotaState({status:'confirmed',periodEnd:'2026-10-10'},Date.parse('2026-10-04'))[0],'paid');
 assert.equal(quotaState({status:'confirmed',periodEnd:'2026-10-01'},Date.parse('2026-10-04'))[0],'due');
 assert.equal(quotaState({status:'confirmed',leaveAtPeriodEnd:true})[1],'In uscita');
});
test('monthly summary counts confirmation records, not pending declarations, in Italian time',()=>{
 const rows=[{amountCents:999,status:'reported'},{confirmations:[{confirmedAt:'2026-09-30T22:30:00Z',amountCents:350},{confirmedAt:'2026-09-20T12:00:00Z',amountCents:350},{confirmedAt:'invalid',amountCents:999},{confirmedAt:'2026-10-02T12:00:00Z',amountCents:349}]}];
 assert.equal(confirmedThisMonth(rows,new Date('2026-10-04')),699);
});
