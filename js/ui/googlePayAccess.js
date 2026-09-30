import { accessMoney } from '../config/accessPlans.js';
const scripts = new Map();
function script(src, namespace) {
  if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src;
    if (namespace) el.setAttribute('data-namespace', namespace);
    el.onload = resolve; el.onerror = () => { scripts.delete(src); el.remove(); reject(new Error('Caricamento Google Pay non riuscito.')); };
    document.head.append(el);
  }));
  return scripts.get(src);
}
export async function mountGooglePayAccess(target, api, reload) {
  try {
    const config = await api('/api/p2p/google-pay/config');
    if (!config.enabled || !target.isConnected) { target.remove(); return; }
    target.classList.add('bys-pay-card');
    target.innerHTML = '<div class="bys-pay-heading"><span class="bys-pay-badge">ATTIVAZIONE AUTOMATICA</span><h3>Il tuo prossimo gruppo inizia qui.</h3><p>Scegli quanto restare con BYS. Un solo accesso per partecipare e creare gruppi.</p></div><div class="bys-pay-options" role="group" aria-label="Scegli la durata"></div><div class="bys-pay-checkout"><div><span>Totale da pagare</span><strong data-plan-total></strong><small data-plan-duration></small></div><div class="bys-pay-action"><div data-google-button></div><p>Accesso attivo dopo la conferma del pagamento.</p></div></div><p role="status" aria-live="polite" data-google-status></p><p class="bys-pay-note">Pagamento singolo, senza rinnovo automatico. Se rinnovi in anticipo conservi i giorni residui. Le quote dei gruppi sono separate.</p><a class="bys-pay-reminders" href="#notifiche">Attiva i promemoria di rinnovo →</a><details class="bys-pay-details"><summary>Cosa succede alla scadenza?</summary><p>Le funzioni riservate e l’assistenza inclusa si sospendono fino al rinnovo. Il conto, il rinnovo e il supporto sui pagamenti restano disponibili.</p></details>';
    const select = document.createElement('select'); select.setAttribute('aria-label','Piano accesso BYS con Google Pay'); select.hidden=true;
    for (const plan of config.plans) { const option = document.createElement('option'); option.value=plan.code; option.textContent=plan.label; select.append(option); }
    target.append(select);
    const options = target.querySelector('.bys-pay-options');
    const renderChoice = () => {
      const plan=config.plans.find(p=>p.code===select.value);
      target.querySelector('[data-plan-total]').textContent=accessMoney(plan.amountCents);
      target.querySelector('[data-plan-duration]').textContent=`Accesso per ${plan.period}`;
      for(const button of options.children) button.setAttribute('aria-pressed',String(button.dataset.plan===plan.code));
    };
    for(const plan of config.plans) {
      const button=document.createElement('button'); button.type='button';button.dataset.plan=plan.code;
      const label=document.createElement('span');label.textContent=plan.label;
      const price=document.createElement('strong');price.textContent=accessMoney(plan.amountCents);
      const duration=document.createElement('small');duration.textContent=plan.period;
      button.append(label,price,duration);button.onclick=()=>{if(select.disabled)return;select.value=plan.code;renderChoice();};options.append(button);
    }
    renderChoice();
    let chosen = config.plans[0];
    const status = target.querySelector('[data-google-status]');
    if (config.environment === 'TEST') status.textContent = 'Ambiente di prova: nessun pagamento reale.';
    await Promise.all([script('https://pay.google.com/gp/p/js/pay.js'), script(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=EUR&components=googlepay`, 'bysGooglePay')]);
    const paypal = window.bysGooglePay.Googlepay();
    const settings = await paypal.config();
    let orderId, busy = false; select.disabled=false;
    const client = new google.payments.api.PaymentsClient({ environment: config.environment, paymentDataCallbacks: {
      onPaymentAuthorized: async data => {
        try {
          ({ orderId } = await api('/api/p2p/google-pay/orders', {planCode:chosen.code}));
          const result = await paypal.confirmOrder({ orderId, paymentMethodData: data.paymentMethodData });
          if (result.status === 'PAYER_ACTION_REQUIRED') await paypal.initiatePayerAction({ orderId });
          else if (!['APPROVED', 'COMPLETED'].includes(result.status)) throw new Error('Autorizzazione non completata.');
          const captured = await api(`/api/p2p/google-pay/orders/${encodeURIComponent(orderId)}/capture`, {});
          if (captured.pending) status.textContent = 'Pagamento in verifica. Non ripagarlo: aggiorna lo stato tra qualche minuto.';
          else { status.textContent = 'Pagamento confermato. Accesso aggiornato.'; setTimeout(reload, 500); }
          return { transactionState: 'SUCCESS' };
        } catch (e) {
          status.textContent = 'Pagamento non confermato. Attendi la verifica prima di riprovare. ' + e.message;
          return { transactionState: 'ERROR', error: { intent: 'PAYMENT_AUTHORIZATION', reason: 'OTHER_ERROR', message: 'Pagamento da verificare. Non effettuare un secondo pagamento.' } };
        }
      }
    } });
    const base = { apiVersion: 2, apiVersionMinor: 0, allowedPaymentMethods: settings.allowedPaymentMethods };
    const ready = await client.isReadyToPay(base);
    if (!ready.result || settings.isEligible === false) { status.textContent = 'Google Pay non è disponibile su questo dispositivo o conto. Puoi utilizzare il bonifico.'; return; }
    target.querySelector('[data-google-button]').append(client.createButton({ buttonType: 'checkout', buttonColor: 'black', buttonLocale: 'it', buttonSizeMode: 'fill', buttonRadius: 16, onClick: () => {
      if (busy) return; busy = true; select.disabled=true; chosen=config.plans.find(p=>p.code===select.value);
      client.loadPaymentData({ ...base, merchantInfo: settings.merchantInfo, callbackIntents: ['PAYMENT_AUTHORIZATION'],
        transactionInfo: { currencyCode: 'EUR', countryCode: 'IT', totalPriceStatus: 'FINAL', totalPrice: (chosen.amountCents/100).toFixed(2), totalPriceLabel: `Accesso BYS · ${chosen.period}` }
      }).catch(() => { status.textContent = 'Procedura interrotta. Se hai autorizzato il pagamento, attendi la verifica senza ripagarlo.'; }).finally(() => { busy = false; select.disabled=false; });
    } }));
  } catch { if (target.isConnected) target.textContent = 'Google Pay temporaneamente non disponibile. Il bonifico resta disponibile.'; }
}
