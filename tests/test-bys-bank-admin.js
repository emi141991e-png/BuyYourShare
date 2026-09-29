import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createHash, createHmac } from 'node:crypto';
import { verifyBysBankRequest } from '../server/services/bysBankAdmin.js';
const secret = 'test-only-shared-secret-at-least-32-characters';
const key = createHmac('sha256', secret).update('bys-bank-admin-v1').digest('hex');
const body = { reference: 'TRN-12345' };
function token(extra = {}, signingKey = key) { return jwt.sign({ scope:'bank-payments', method:'POST', path:'/payment/confirm', bodyHash:createHash('sha256').update(JSON.stringify(body)).digest('hex'), ...extra }, signingKey, {algorithm:'HS256',issuer:'buyyourshare-admin',audience:'p2p-bank-admin',subject:'admin-bys',jwtid:'single-use',expiresIn:60}); }
function repository() { const used = new Map(); return { consumeSsoTicket: async (id, expiresAt) => { assert.equal(typeof expiresAt,'number'); if (used.has(id)) return false; used.set(id,expiresAt); return true; } }; }
test('signed admin request is bound to body, operation and single use', async () => {
  const repo=repository(); const signed=token();
  assert.equal(await verifyBysBankRequest(signed,'POST','/payment/confirm',body,repo,secret),'admin-bys');
  await assert.rejects(verifyBysBankRequest(signed,'POST','/payment/confirm',body,repo,secret),/REPLAY/);
  for (const args of [['GET','/payment/confirm',body],['POST','/other/confirm',body],['POST','/payment/confirm',{reference:'TRN-99999'}]]) await assert.rejects(verifyBysBankRequest(signed,...args,repository(),secret));
});
test('ordinary SSO secrets/tokens, missing scope, expired signatures cannot administer bank payments', async () => {
  for (const signed of [token({},secret),token({scope:'user'}),token({iat:1})]) await assert.rejects(verifyBysBankRequest(signed,'POST','/payment/confirm',body,repository(),secret));
});
