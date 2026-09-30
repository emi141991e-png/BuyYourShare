const loads = new Map();
function load(src, namespace) {
  if (!loads.has(src)) loads.set(src, new Promise((resolve,reject) => {
    const el=document.createElement('script'); el.src=src;
    if(namespace) el.setAttribute('data-namespace',namespace);
    const fail=()=>{clearTimeout(timer);el.remove();loads.delete(src);reject(new Error('Apple Pay non disponibile al momento.'));};
    const timer=setTimeout(fail,20000);el.onerror=fail;el.onload=()=>{clearTimeout(timer);resolve();};document.head.append(el);
  }));return loads.get(src);
}
export async function mountApplePayAccess(host, api, reload, selection) {
  // Unsupported devices should retain the existing Google Pay / bank checkout.
  if (!window.ApplePaySession || !window.ApplePaySession.canMakePayments()) return;
  try {
    const config=await api('/api/p2p/apple-pay/config');if(!config.enabled || !host.isConnected)return;
    await Promise.all([load('https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js'),load(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=EUR&components=applepay`,'bysApplePay')]);
    const paypal=window.bysApplePay.Applepay();const settings=await paypal.config();
    if(!settings.isEligible || !host.isConnected)return;
    const button=document.createElement('apple-pay-button');button.setAttribute('buttonstyle','black');button.setAttribute('type','buy');button.setAttribute('locale','it');
    button.style.cssText='display:block;--apple-pay-button-width:100%;--apple-pay-button-height:52px;--apple-pay-button-border-radius:12px;margin-top:12px';
    const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    host.replaceChildren(button,status);
    button.onclick=()=>{
      if(selection.busy())return;
      const plan=selection.plan();selection.lock(true);status.textContent='';
      let session, authorized=false;
      const release=()=>selection.lock(false);
      try {
        // Begin directly in the click gesture; network calls belong to session events.
        session=new ApplePaySession(4,{countryCode:settings.countryCode,currencyCode:'EUR',merchantCapabilities:settings.merchantCapabilities,supportedNetworks:settings.supportedNetworks,total:{label:'BuyYourShare',type:'final',amount:(plan.amountCents/100).toFixed(2)}});
        session.onvalidatemerchant=async event=>{try{const result=await paypal.validateMerchant({validationUrl:event.validationURL,displayName:'BuyYourShare'});session.completeMerchantValidation(result.merchantSession);}catch{session.abort();release();status.textContent='Apple Pay non disponibile. Riprova più tardi.';}};
        session.oncancel=()=>{release();status.textContent=authorized?'Se hai autorizzato il pagamento, attendi la verifica prima di riprovare.':'Pagamento annullato.';};
        session.onpaymentauthorized=async event=>{
          authorized=true;
          try {
            const {orderId}=await api('/api/p2p/apple-pay/orders',{planCode:plan.code});
            await paypal.confirmOrder({orderId,token:event.payment.token,billingContact:event.payment.billingContact});
            const result=await api(`/api/p2p/apple-pay/orders/${encodeURIComponent(orderId)}/capture`,{});
            session.completePayment(ApplePaySession.STATUS_SUCCESS);
            if(result.pending) status.textContent='Pagamento in verifica. Non ripagarlo: aggiorna lo stato tra qualche minuto.';
            else {status.textContent='Pagamento confermato. Accesso BYS attivato.';setTimeout(reload,500);}
          }catch{session.completePayment(ApplePaySession.STATUS_FAILURE);status.textContent='Pagamento non confermato. Verifica lo stato prima di effettuare un nuovo pagamento.';}
          finally{release();}
        };session.begin();
      }catch{release();status.textContent='Impossibile aprire Apple Pay su questo dispositivo.';}
    };
  }catch{if(host.isConnected)host.textContent='Apple Pay temporaneamente non disponibile.';}
}
