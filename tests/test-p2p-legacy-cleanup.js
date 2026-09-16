import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareLegacyCleanup } from '../server/services/p2pLegacyCleanup.js';
const ids=['grp-1787421251818','grp-1787422031454'];
const fixture=()=>({groups:ids.map(id=>({id})),memberships:[{groupId:ids[0]},{groupId:ids[0]},{groupId:ids[1]}],chats:ids.map((groupId,i)=>({id:`c${i}`,groupId})),chatMessages:[{chatId:'c0'},{chatId:'c1'}],accessInstructions:ids.map(groupId=>({groupId})),users:[{id:'u'}],p2pSubscriptions:[{userId:'u',migrationCredit:true}],transactions:[{id:'t'}]});
test('authorized cleanup removes only listed groups and dependent content, preserving paid credit and history',()=>{
 const d=fixture(); const result=prepareLegacyCleanup(d,ids);
 for(const key of ['groups','memberships','chats','chatMessages','accessInstructions'])assert.equal(result[key].length,0);
 for(const key of ['users','p2pSubscriptions','transactions'])assert.deepEqual(result[key],d[key]);
 assert.equal(d.groups.length,2); assert.equal(prepareLegacyCleanup(result,ids),null);
});
test('cleanup rejects changed scope, new participation requests and unreconciled billing',()=>{
 assert.throws(()=>prepareLegacyCleanup(fixture(),[ids[0],'unapproved']));
 const d=fixture();d.memberships.push({groupId:ids[0]});assert.throws(()=>prepareLegacyCleanup(d,ids));
 const e=fixture();e.p2pJoinRequests=[{groupId:ids[0]}];assert.throws(()=>prepareLegacyCleanup(e,ids));
 const f=fixture();f.memberships[0].paypalSubscriptionId='I-active';assert.throws(()=>prepareLegacyCleanup(f,ids));
});
