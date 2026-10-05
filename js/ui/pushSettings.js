const STORAGE = 'bys_push_device';
const text = {
  PUSH_UNAVAILABLE: 'Il servizio push non è disponibile. I promemoria nel marketplace restano attivi.',
  PUSH_DEVICE_OTHER_ACCOUNT: 'Questo browser è collegato a un altro account. Esci da quell’account prima di attivare le notifiche qui.',
  UNSUPPORTED_PUSH_PROVIDER: 'Questo browser non è ancora supportato per le notifiche push.',
  PUSH_TEST_RATE_LIMIT: 'Attendi un minuto prima di inviare un’altra prova.'
};
function localDevice() { try { return JSON.parse(localStorage.getItem(STORAGE) || 'null'); } catch { return null; } }
function decode(value) { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
export async function stopPushOnLogout(token) {
  const device = localDevice();
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration('/');
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
    }
    if (device && token) await fetch(`/api/push/${encodeURIComponent(device.id)}/remove`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
  } catch { /* The endpoint is removed by the delivery worker if expired. */ }
  localStorage.removeItem(STORAGE);
}
export async function renderPushSettings(target, user, api, esc, options = {}) {
  if (!target) return;
  target.innerHTML = '<p>Controllo delle notifiche push…</p>';
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    target.innerHTML = '<h3>Promemoria push</h3><p>Questo browser non supporta le notifiche push. Su iPhone e iPad aggiungi il marketplace alla schermata Home da Safari e aprilo dall’icona. Le notifiche nel sito restano disponibili.</p>'; return;
  }
  try {
    const config = await api('/api/push/config');
    if (!target.isConnected) return;
    const device = localDevice();
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!target.isConnected) return;
    const enabled = !!subscription && device?.userId === user.id && config.devices.some(d => d.id === device.id) && Notification.permission === 'granted';
    const blocked = Notification.permission === 'denied';
    target.classList.add('bys-notifications-control');
    target.innerHTML = `<div class="push-main"><div><h3>${enabled ? '✓ Notifiche attive' : 'Non perdere messaggi e scadenze'}</h3><p>${enabled ? 'Chat, richieste, quote e posti disponibili: avvisi attivi su questo dispositivo.' : blocked ? 'Consenti le notifiche nelle impostazioni del sito del browser, poi premi Riprova.' : 'Chat, richieste, quote e posti disponibili. Un solo consenso per gli avvisi BYS.'}</p></div>
      ${!enabled && !blocked ? `<button type="button" class="btn btn-primary bys-enable-push" id="enablePush">🔔 ${options.compact ? 'Attiva notifiche e continua →' : 'Attiva notifiche'}</button>` : blocked ? '<button type="button" class="btn btn-secondary" id="retryPush">Riprova</button>' : options.compact ? '<button type="button" class="btn btn-primary" id="continuePush">Continua al gruppo →</button>' : '<a class="btn btn-secondary" href="#notifiche">Vedi gli avvisi →</a>'}</div>
      ${!options.banner && !options.compact ? `<details class="push-management"><summary>Gestisci notifiche e dispositivi</summary>${enabled ? '<button type="button" class="btn btn-secondary" id="testPush">Invia notifica di prova</button>' : ''}<div>${config.devices.map((d, i) => `<p>${esc(d.label)} · ${esc(new Date(d.createdAt).toLocaleDateString('it-IT'))} <button class="btn btn-secondary" type="button" id="removePush${i}">Disattiva dispositivo</button></p>`).join('')}</div><small>Puoi disattivarle quando vuoi. La consegna dipende da connessione e impostazioni del dispositivo.</small></details>` : ''}
      <p id="pushFeedback" role="status" aria-live="polite"></p>`;
    target.querySelector('#retryPush')?.addEventListener('click', () => void renderPushSettings(target,user,api,esc,options));
    target.querySelector('#continuePush')?.addEventListener('click', () => void options.onReady?.());
    const feedback = message => { const el = target.querySelector('#pushFeedback'); if (el) el.textContent = message; };
    const perform = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { feedback(text[e.message] || e.message || 'Operazione non riuscita. Riprova.'); } finally { if (btn.isConnected) btn.disabled = false; } };
    target.querySelector('#enablePush')?.addEventListener('click', e => {
      // Called directly inside the gesture, before asynchronous work (Safari requirement).
      const permission = Notification.requestPermission();
      void perform(e.currentTarget, async () => {
        if (await permission !== 'granted') { feedback('Permesso non concesso. Restano attivi i promemoria nel sito.'); return; }
        await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (subscription && device && device.userId !== user.id) { await subscription.unsubscribe(); subscription = null; localStorage.removeItem(STORAGE); }
        if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decode(config.publicKey) });
        let result;
        try { result = await api('/api/push/subscribe', { subscription: subscription.toJSON(), consent: true, label: /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone / iPad' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Browser computer' }); }
        catch (error) {
          if (error.message === 'UNSUPPORTED_PUSH_PROVIDER') throw new Error(`Il servizio notifiche di questo browser (${new URL(subscription.endpoint).hostname}) non è supportato. Apri il marketplace in Chrome, Edge o Safari per attivare le push.`);
          throw error;
        }
        localStorage.setItem(STORAGE, JSON.stringify({ userId: user.id, id: result.id }));
        if (options.onReady) { await options.onReady(); return; }
        await renderPushSettings(target, user, api, esc, options);
      });
    });
    target.querySelector('#testPush')?.addEventListener('click', e => void perform(e.currentTarget, async () => {
      await api(`/api/push/${encodeURIComponent(device.id)}/test`, {});
      feedback('Prova programmata: dovrebbe arrivare entro un minuto. Se non compare, controlla le notifiche e la modalità Non disturbare del dispositivo.');
      let attempts = 0;
      const timer = setInterval(async () => {
        if (!target.isConnected || ++attempts > 12) { clearInterval(timer); return; }
        try {
          const result = await api('/api/push/config');
          const status = result.devices.find(d => d.id === device.id)?.lastTestStatus;
          if (status === 'sent') { feedback('Il servizio push ha accettato l’invio. Controlla che la notifica sia comparsa sul dispositivo.'); clearInterval(timer); }
          else if (['failed', 'expired', 'canceled'].includes(status) || !result.devices.some(d => d.id === device.id)) { feedback('Notifica non consegnata al servizio. Disattiva e riattiva questo dispositivo, poi riprova.'); clearInterval(timer); }
        } catch { /* Retain the visible retry guidance. */ }
      }, 5000);
    }));
    config.devices.forEach((d, i) => target.querySelector(`#removePush${i}`)?.addEventListener('click', e => void perform(e.currentTarget, async () => {
      await api(`/api/push/${encodeURIComponent(d.id)}/remove`, {});
      if (device?.id === d.id) { const reg = await navigator.serviceWorker.getRegistration('/'); await (await reg?.pushManager.getSubscription())?.unsubscribe(); localStorage.removeItem(STORAGE); }
      await renderPushSettings(target, user, api, esc, options);
    })));
  } catch (e) { target.innerHTML = `<p role="status">${esc(text[e.message] || 'Impossibile controllare le notifiche.')}</p><button type="button" class="btn btn-secondary" data-retry>Riprova</button>`; target.querySelector('[data-retry]')?.addEventListener('click',()=>void renderPushSettings(target,user,api,esc,options)); }
}
