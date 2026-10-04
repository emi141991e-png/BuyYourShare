import test from 'node:test';
import assert from 'node:assert/strict';
let installed=false,permission='granted',local={userId:'member',id:'device'},subscription={endpoint:'test'};
globalThis.window={matchMedia:()=>({get matches(){return installed},addEventListener(){}}),addEventListener(){},isSecureContext:false,Notification:{}};
globalThis.Notification={get permission(){return permission}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{standalone:false,serviceWorker:{getRegistration:async()=>({pushManager:{getSubscription:async()=>subscription}})}}});
globalThis.localStorage={getItem:()=>JSON.stringify(local)};
const {participationDevice}=await import('../js/ui/participationDevice.js');
const api=async()=>({devices:[{id:'device'}]});
test('new participation requires installed window, actual permission and current account device',async()=>{
 assert.equal(await participationDevice(api,{id:'member'}),null);
 installed=true;permission='denied';assert.equal(await participationDevice(api,{id:'member'}),null);
 permission='granted';local.userId='other';assert.equal(await participationDevice(api,{id:'member'}),null);
 local.userId='member';subscription=null;assert.equal(await participationDevice(api,{id:'member'}),null);
 subscription={endpoint:'test'};assert.equal(await participationDevice(async()=>({devices:[]}),{id:'member'}),null);
 assert.equal(await participationDevice(api,{id:'member'}),'device');
});
