let sdkPromise;
let loadedClientId;
export function subscriptionButtonOptions(api, show, refresh) {
  return {
    style: { layout: 'vertical', label: 'subscribe', shape: 'rect' },
    async createSubscription() {
      // Server owns plan selection, identity and idempotency. Never create in the browser.
      const result = await api('/api/p2p/subscription/sdk-start', {});
      if (!/^I-[A-Z0-9]+$/i.test(result.subscriptionId || '')) throw new Error('Richiesta PayPal non valida. Aggiorna lo stato.');
      return result.subscriptionId;
    },
    async onApprove() {
      show('Approvazione ricevuta. Verifico il pagamento con PayPal…');
      // The callback alone cannot unlock access. Ignore browser-supplied IDs.
      await api('/api/p2p/subscription/refresh', {});
      await refresh();
    },
    onCancel() { show('Checkout chiuso. La richiesta resta recuperabile: aggiorna lo stato prima di riprovare.'); },
    onError() { show('PayPal non ha completato il checkout. Aggiorna lo stato; non avviare un secondo abbonamento.'); }
  };
}
export async function mountSubscriptionButton(target, config, api, show, refresh) {
  if (!config?.enabled || config.mode !== 'sandbox' || !config.clientId) return;
  try {
    if (loadedClientId && loadedClientId !== config.clientId) throw new Error('SDK configuration changed');
    if (!sdkPromise) {
      loadedClientId = config.clientId;
      sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const query = new URLSearchParams({ 'client-id': config.clientId, components: 'buttons', vault: 'true', intent: 'subscription', currency: 'EUR' });
        script.src = 'https://www.paypal.com/sdk/js?' + query;
        script.dataset.namespace = 'bysSubscriptionPayPal';
        script.onload = () => resolve(window.bysSubscriptionPayPal);
        script.onerror = () => { script.remove(); sdkPromise = null; loadedClientId = null; reject(new Error('SDK unavailable')); };
        document.head.append(script);
      });
    }
    const sdk = await sdkPromise;
    if (!target.isConnected) return;
    await sdk.Buttons(subscriptionButtonOptions(api, show, refresh)).render(target);
  } catch { show('Pulsante PayPal non disponibile. Puoi usare il collegamento di approvazione esistente.'); }
}
