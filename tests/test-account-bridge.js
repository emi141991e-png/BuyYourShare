import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import {bysMarketplaceAdmin} from '../server/routes/bysMarketplaceAdmin.js';
test('account bridge returns only linked user data and cannot access admin snapshot',async()=>{
 process.env.P2P_SSO_SECRET='account-test-secret-32-characters-long';
 const data={users:[{id:'u',bysUserId:'a'},{id:'v',bysUserId:'b'}],groups:[{id:'g',ownerId:'u',customServiceName:'Mine'},{id:'h',ownerId:'v',customServiceName:'Other'}],p2pManualRequests:[{id:'r',userId:'u',groupId:'h',status:'accepted'},{id:'s',userId:'v',groupId:'g',status:'confirmed'}]};
 const app=express();app.use(express.json());app.use(bysMarketplaceAdmin({repo:{data,consumeSsoTicket:async()=>true},view:()=>({accessAllowed:true,currentPeriodEnd:'2030-01-01'})}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const token=(path,sub='a')=>jwt.sign({scope:'marketplace-account',method:'GET',path,bodyHash:createHash('sha256').update('{}').digest('hex')},createHmac('sha256',process.env.P2P_SSO_SECRET).update('bys-bank-admin-v1').digest('hex'),{issuer:'buyyourshare-admin',audience:'p2p-bank-admin',subject:sub,jwtid:randomUUID(),expiresIn:60});
 try{
 const get=path=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{headers:{Authorization:'Bearer '+token(path)}});
 const res=await get('/account');assert.equal(res.status,200);const body=await res.json();assert.deepEqual(body.groups.map(g=>g.id),['g']);assert.deepEqual(body.participations.map(r=>r.id),['r']);assert.equal(body.users,undefined);assert.equal((await get('/')).status,403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
