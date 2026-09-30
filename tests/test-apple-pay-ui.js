import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/ui/applePayAccess.js',import.meta.url),'utf8').replace('export async function','async function');
test('Apple session begins in click gesture, uses selected plan and activates only after capture',async()=>{
  let session,reloads=0,locked=false,pending=false,sourceWallet;
  const nodes=[];
  class Session{static canMakePayments(){return true;}static STATUS_SUCCESS=1;static STATUS_FAILURE=0;constructor(v,request){this.request=request;session=this;}begin(){this.begun=true;}completeMerchantValidation(v){this.merchant=v;}completePayment(v){this.result=v;}abort(){}}
  const host={isConnected:true,replaceChildren(...items){nodes.push(...items);}};
  const context=vm.createContext({setTimeout:(fn,ms)=>ms===500?fn():setTimeout(fn,ms),clearTimeout,ApplePaySession:Session,window:{ApplePaySession:Session,bysApplePay:{Applepay:()=>({config:async()=>({isEligible:true,countryCode:'IT',merchantCapabilities:['supports3DS'],supportedNetworks:['visa']}),validateMerchant:async()=>({merchantSession:'valid'}),confirmOrder:async data=>{sourceWallet=data.token;}})}},document:{createElement:()=>({style:{},setAttribute(){},remove(){}}),head:{append(el){queueMicrotask(()=>el.onload());}}}});
  vm.runInContext(source,context);
  const api=async(path)=>path.endsWith('/config')?{enabled:true,clientId:'test'}:path.endsWith('/orders')?{orderId:'ONE'}:{pending};
  await context.mountApplePayAccess(host,api,()=>reloads++,{busy:()=>locked,lock:v=>locked=v,plan:()=>({code:'YEARLY',amountCents:990})});
  nodes[0].onclick();assert.equal(session.begun,true);assert.equal(session.request.total.amount,'9.90');assert.equal(locked,true);assert.equal(reloads,0);
  await session.onvalidatemerchant({validationURL:'https://apple.test'});assert.equal(session.merchant,'valid');
  await session.onpaymentauthorized({payment:{token:'wallet-token'}});assert.equal(sourceWallet,'wallet-token');assert.equal(reloads,1);assert.equal(locked,false);
  pending=true;nodes[0].onclick();await session.onpaymentauthorized({payment:{token:'wallet-token'}});assert.equal(reloads,1);assert.match(nodes[1].textContent,/verifica/);
});
