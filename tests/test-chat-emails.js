import test from 'node:test';
import assert from 'node:assert/strict';
import {P2pManual} from '../server/services/p2pManual.js';
import {ChatEmails} from '../server/services/chatEmails.js';

function setup() {
  let clock=100000;
  const repo={data:{groups:[{id:'g',ownerId:'owner'}],users:[{id:'owner',email:'owner@example.test'},{id:'member',email:'member@example.test'}],p2pManualRequests:[{id:'r',groupId:'g',userId:'member'}]},save:async()=>{}};
  let queue=Promise.resolve();
  const subscriptions={repo,exclusive:fn=>{const p=queue.catch(()=>{}).then(fn);queue=p;return p;}};
  const sent=[];
  const mailer={sendMail:async mail=>{sent.push(mail);return {status:'DELIVERED_RESEND'};}};
  return {repo,sent,mailer,manual:new P2pManual(subscriptions,()=>clock),worker:new ChatEmails(subscriptions,mailer,()=>clock),advance:()=>clock+=3600001};
}
test('both directions, duplicate requests, read messages and historical messages',async()=>{
  const x=setup();
  x.repo.data.notifications=[{id:'chat:old',userId:'member',requestId:'r'}];
  await x.manual.send('member','r','private account details','one');
  await x.manual.send('member','r','private account details','one');
  await x.manual.send('owner','r','private response','two');
  await x.manual.markRead('owner','r',x.manual.chat('owner','r').at(-1).id);
  await Promise.all([x.worker.flush(),x.worker.flush()]);
  await x.worker.flush();
  assert.deepEqual(x.sent.map(m=>m.to),['owner@example.test','member@example.test']);
  assert.ok(x.sent.every(m=>m.text.includes('%23privata-r')));
  assert.ok(x.sent.every(m=>!m.text.includes('private account details')&&!m.html.includes('private response')));
  assert.notEqual(x.sent[0].idempotencyKey,x.sent[1].idempotencyKey);
});
test('failed delivery retries with same identity and survives worker restart',async()=>{
  const x=setup();await x.manual.send('member','r','Ciao','one');
  x.mailer.sendMail=async mail=>{x.sent.push(mail);return {status:'FAILED'};};
  await x.worker.flush();await x.worker.flush();assert.equal(x.sent.length,1);
  x.advance();x.mailer.sendMail=async mail=>{x.sent.push(mail);return {status:'DELIVERED_RESEND'};};
  const restarted=new ChatEmails(x.worker.subscriptions,x.mailer,()=>4000001);
  await restarted.flush();await restarted.flush();
  assert.equal(x.sent.length,2);assert.equal(x.sent[0].idempotencyKey,x.sent[1].idempotencyKey);
});
test('failed message save and unauthorized sender do not cause emails',async()=>{
  const x=setup();await assert.rejects(x.manual.send('stranger','r','bad','one'));
  x.repo.save=async()=>{throw new Error('disk');};
  await assert.rejects(x.manual.send('member','r','Ciao','one'));
  x.repo.save=async()=>{};await x.worker.flush();assert.equal(x.sent.length,0);
});
