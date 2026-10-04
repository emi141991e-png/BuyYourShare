import {installMarketplace, hideInstallSuggestion} from './installApp.js';
import {renderPushSettings} from './pushSettings.js';

export async function participationDevice(api, user) {
  if (!(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)) return null;
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return null;
  let device; try { device = JSON.parse(localStorage.getItem('bys_push_device') || 'null'); } catch { return null; }
  if (device?.userId !== user.id) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  if (!await registration?.pushManager.getSubscription()) return null;
  const config = await api('/api/push/config');
  return config.devices.some(d => d.id === device.id) ? device.id : null;
}

export async function requireParticipationDevice(container, user, api, esc, retry) {
  const ready = await participationDevice(api,user);
  if (ready) return ready;
  hideInstallSuggestion();
  container.querySelector('#participationDevice')?.remove();
  const box = document.createElement('section'); box.id = 'participationDevice'; box.className = 'billing-card';
  box.innerHTML = `<h2>Prima di richiedere un posto</h2><p>Per le nuove partecipazioni devi aprire il marketplace come app e attivare le notifiche di chat e rinnovo. Le tue chat e le partecipazioni già esistenti restano accessibili.</p><h3>1. Installa e apri il marketplace</h3><button type="button" class="btn btn-primary" data-install>Installa il marketplace</button><p data-help role="status"></p><h3>2. Attiva le notifiche</h3><div data-push></div><h3>3. Controlla che arrivino</h3><p>Usa “Invia notifica di prova” e verifica l’avviso sul dispositivo. Poi continua al gruppo.</p><button type="button" class="btn btn-primary" data-continue>Ho completato: continua al gruppo</button><p data-result role="status"></p><a href="#miei-abbonamenti" class="btn btn-secondary">Le mie partecipazioni</a>`;
  container.prepend(box);
  box.querySelector('[data-install]').onclick = async () => {
    try { box.querySelector('[data-help]').textContent = await installMarketplace(); }
    catch { box.querySelector('[data-help]').textContent = 'Usa il menu del browser → Installa app / Aggiungi alla schermata Home. Poi apri l’icona del marketplace.'; }
  };
  box.querySelector('[data-continue]').onclick = async e => {
    const b=e.currentTarget; b.disabled=true;
    try {
      if (await participationDevice(api,user)) { box.remove(); await retry(); }
      else box.querySelector('[data-result]').textContent = 'Apri il marketplace dalla sua icona e attiva le notifiche su questo dispositivo. Se sono bloccate, consentile nelle impostazioni del browser. Non effettuare altri pagamenti.';
    } catch { box.querySelector('[data-result]').textContent = 'Verifica non riuscita. Riprova tra poco.'; }
    finally { b.disabled=false; }
  };
  await renderPushSettings(box.querySelector('[data-push]'),user,api,esc);
  box.scrollIntoView({block:'start',behavior:'smooth'});
  return null;
}
