import test from 'node:test';
import assert from 'node:assert/strict';
import {getGroupSlotsBreakdown} from '../server/engine/MoneyEngine.js';
test('public participant profiles expose display names without private account data',()=>{
 const g={id:'g',ownerId:'o',totalSlots:3,ownerSlots:1,realSubscriptionCostCents:900};
 const members=[{groupId:'g',userId:'m',slotNumber:2,status:'ACTIVE',paymentProvider:'MANUAL'}];
 const users=[{id:'o',fullName:'Leader'},{id:'m',username:'musicfan',fullName:'Private Name',email:'private@example.test'}];
 for(const viewer of [null,{id:'outsider'},{id:'o'},{id:'m'}])assert.deepEqual(getGroupSlotsBreakdown(g,members,viewer,users).slots[1].assignedUser,{fullName:'musicfan',avatarUrl:null});
});
