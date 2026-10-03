import { showAccessConfirmation } from './accessConfirmation.js';
import { walletErrorCode } from './walletError.js';

let sdkPromise;
function loadSdk(clientId) {
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture&components=buttons`;
    script.setAttribute('data-namespace', 'bysPayPalOneTime');
    const fail = () => { clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error('PAYPAL_SCRIPT')); };
    const timer = setTimeout(fail, 20000);
    script.onload = () => { clearTimeout(timer); resolve(window.bysPayPalOneTime); };
    script.onerror = fail;
    document.head.append(script);
  });
  return sdkPromise;
}

export async function mountPayPalOneTimeAccess(target, api, reload, controls) {
  let locked = false;
  const unlock = () => { if (locked) controls.lock(false); locked = false; };
  try {
    const config = await api('/api/p2p/paypal-onetime/config');
    if (!target.isConnected || !config.enabled) return;
    target.innerHTML = (config.environment === 'TEST' ? '<p><strong>PayPal · prova sandbox</strong><br>Nessun addebito reale. Usa il conto personale di prova.</p>' : '<p><strong>Oppure paga con PayPal</strong></p>') + '<div data-paypal-onetime></div><p role="status" aria-live="polite"></p>';
    const status = target.querySelector('[role="status"]');
    const sdk = await loadSdk(config.clientId);
    if (!target.isConnected) return;
    const buttons = sdk.Buttons({
      fundingSource: sdk.FUNDING.PAYPAL,
      style: { layout: 'vertical', label: 'pay', color: 'gold', height: 48, tagline: false },
      onClick: (_data, actions) => {
        if (controls.busy()) return actions.reject();
        controls.lock(true); locked = true;
        status.textContent = '';
        return actions.resolve();
      },
      createOrder: async () => {
        const created = await api('/api/p2p/paypal-onetime/orders', { planCode: controls.plan().code });
        if (created.alreadyPaid) {
          status.textContent = 'Pagamento precedente recuperato. Accesso attivo.';
          unlock(); showAccessConfirmation(created.subscription, reload);
          throw new Error('PREVIOUS_PAYMENT_RECOVERED');
        }
        return created.orderId;
      },
      onApprove: async data => {
        try {
          const result = await api(`/api/p2p/paypal-onetime/orders/${encodeURIComponent(data.orderID)}/capture`, {});
          if (result.failed) status.textContent = 'Pagamento rifiutato. Nessun accesso attivato.';
          else if (result.pending || result.reviewRequired) status.textContent = 'Pagamento in verifica. Non effettuare un secondo pagamento.';
          else if (result.subscription?.accessAllowed) showAccessConfirmation(result.subscription, reload);
          else status.textContent = 'Controlla lo stato del pagamento prima di riprovare.';
        } catch (error) {
          status.textContent = 'Pagamento non confermato. Non ripagare. Codice: ' + walletErrorCode(error, 'CONFERMA_PAYPAL');
        } finally { unlock(); }
      },
      onCancel: () => { unlock(); status.textContent = 'Finestra PayPal chiusa. Puoi riprendere il tentativo con lo stesso piano.'; },
      onError: error => { unlock(); if (error?.message !== 'PREVIOUS_PAYMENT_RECOVERED') status.textContent = 'PayPal non ha completato il pagamento. Codice: ' + walletErrorCode(error, 'PAYPAL'); }
    });
    if (buttons.isEligible()) await buttons.render(target.querySelector('[data-paypal-onetime]'));
    else status.textContent = 'PayPal non disponibile in questo browser.';
  } catch {
    unlock();
    if (target.isConnected) target.textContent = 'La prova PayPal non è disponibile al momento. Ricarica la pagina per riprovare.';
  }
}
