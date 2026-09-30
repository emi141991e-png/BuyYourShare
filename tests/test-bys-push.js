import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import {bysPushRoutes} from '../server/routes/bysPush.js';
test('BYS push bridge binds device operations to the signed account and rejects tampering and replay',async()=>{
 process.env.P2P_SSO_SECRET='push-test-secret-32-characters-long';const consumed=new Set(),calls=[];
 const service={repo:{data:{users:[{id:'u',bysUserId:'a'},{id:'v',bysUserId:'b'}]},consumeSsoTicket:async id=>{if(consumed.has(id))return false;consumed.add(id);return true;}},config:id=>({devices:[{id}]}),subscribe:async(...args)=>{calls.push(args);return{id:'device'};}};
 const app=express();app.use(express.json());app.use(bysPushRoutes(service));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const token=(method,path,body,scope='user-push')=>jwt.sign({scope,method,path,bodyHash:createHash('sha256').update(JSON.stringify(body)).digest('hex')},createHmac('sha256',process.env.P2P_SSO_SECRET).update('bys-bank-admin-v1').digest('hex'),{issuer:'buyyourshare-admin',audience:'p2p-bank-admin',subject:'a',jwtid:randomUUID(),expiresIn:60});
 const call=(method,path,body,t)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 try{
  const t=token('GET','/config',{});const r=await call('GET','/config',{},t);assert.deepEqual((await r.json()).devices,[{id:'u'}]);assert.equal((await call('GET','/config',{},t)).status,403);
  const body={userId:'v',consent:true,subscription:{},label:'Browser'};assert.equal((await call('POST','/subscribe',body,token('POST','/subscribe',body))).status,200);assert.equal(calls[0][0],'u');assert.equal(calls[0][3],'bys');
  assert.equal((await call('POST','/subscribe',{...body,consent:false},token('POST','/subscribe',body))).status,403);
  assert.equal((await call('GET','/config',{},token('GET','/config',{},'marketplace'))).status,403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
