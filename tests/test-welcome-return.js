import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarketplaceWelcome} from '../js/ui/marketplaceWelcome.js';
test('login and registration preserve only a valid group destination',()=>{
 for(const next of ['#gruppo-grp-123','https://evil.example','" onclick="x','#home']) {
  globalThis.window={location:{hash:'#login?next='+encodeURIComponent(next)}};
  const box={};renderMarketplaceWelcome(box);
  const login=new URL(box.innerHTML.match(/href="(https:\/\/buyyourshare.it\/api[^"]+)"/)[1]);
  const register=new URL(box.innerHTML.match(/href="(https:\/\/buyyourshare.it\/register[^"]+)"/)[1]);
  assert.equal(login.searchParams.get('next'),next==='#gruppo-grp-123'?next:'#home');
  assert.equal(register.searchParams.get('callbackUrl'),login.pathname+login.search);
 }
});
