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
    target.innerHTML = '<h3>Google Pay · 0,99 € per 30 giorni</h3><p>Pagamento singolo, senza rinnovo automatico. I giorni residui si conservano se rinnovi in anticipo. Alla scadenza le funzioni riservate e l’assistenza inclusa si sospendono fino a un nuovo pagamento.</p><p>Restano disponibili il conto, il rinnovo e il supporto per problemi di pagamento. Le quote ai capigruppo sono separate.</p><div data-google-button></div><p role="status" data-google-status></p><a href="#notifiche">Attiva i promemoria e le notifiche push</a>';
    const automatic = document.createElement('p');
    automatic.textContent = 'Accesso attivato automaticamente dopo la conferma del pagamento, senza approvazione dell’amministratore.';
    target.querySelector('[data-google-button]').before(automatic);
    const status = target.querySelector('[data-google-status]');
    if (config.environment === 'TEST') status.textContent = 'Ambiente di prova: nessun pagamento reale.';
    await Promise.all([script('https://pay.google.com/gp/p/js/pay.js'), script(`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&currency=EUR&components=googlepay`, 'bysGooglePay')]);
    const paypal = window.bysGooglePay.Googlepay();
    const settings = await paypal.config();
    let orderId, busy = false;
    const client = new google.payments.api.PaymentsClient({ environment: config.environment, paymentDataCallbacks: {
      onPaymentAuthorized: async data => {
        try {
          ({ orderId } = await api('/api/p2p/google-pay/orders', {}));
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
    target.querySelector('[data-google-button]').append(client.createButton({ allowedPaymentMethods: settings.allowedPaymentMethods, onClick: () => {
      if (busy) return; busy = true;
      client.loadPaymentData({ ...base, merchantInfo: settings.merchantInfo, callbackIntents: ['PAYMENT_AUTHORIZATION'],
        transactionInfo: { currencyCode: 'EUR', countryCode: 'IT', totalPriceStatus: 'FINAL', totalPrice: '0.99', totalPriceLabel: 'Accesso BYS · 30 giorni' }
      }).catch(() => { status.textContent = 'Procedura interrotta. Se hai autorizzato il pagamento, attendi la verifica senza ripagarlo.'; }).finally(() => { busy = false; });
    } }));
  } catch { if (target.isConnected) target.textContent = 'Google Pay temporaneamente non disponibile. Il bonifico resta disponibile.'; }
}
