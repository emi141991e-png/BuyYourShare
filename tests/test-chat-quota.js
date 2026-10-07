import test from 'node:test';
import assert from 'node:assert/strict';
import {chatQuotaState} from '../js/ui/chatQuota.js';
const now=Date.parse('2026-10-07');
const base={ownerId:'o',userId:'m',status:'accepted',reservedUntil:'2026-10-08'};
test('chat actions follow role, reservation, report and renewal state',()=>{
 assert.equal(chatQuotaState(base,'m',now).action,'report');
 assert.equal(chatQuotaState(base,'o',now).action,undefined);
 assert.equal(chatQuotaState(base,'outsider',now).action,undefined);
 assert.equal(chatQuotaState({...base,reservedUntil:'2026-10-06'},'m',now).action,undefined);
 assert.equal(chatQuotaState({...base,status:'reported'},'m',now).action,undefined);
 assert.equal(chatQuotaState({...base,status:'reported'},'o',now).action,'confirm');
 assert.equal(chatQuotaState({...base,status:'confirmed',periodEnd:'2026-11-07'},'m',now).action,undefined);
 assert.equal(chatQuotaState({...base,status:'confirmed',periodEnd:'2026-10-08'},'m',now).action,'report');
 assert.equal(chatQuotaState({...base,status:'confirmed',periodEnd:'2026-10-08',leaveAtPeriodEnd:true},'m',now).action,undefined);
 for(const status of ['pending','canceled'])assert.equal(chatQuotaState({...base,status},'m',now).action,undefined);
});
