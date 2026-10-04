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

let activeGuide;
export async function requireParticipationDevice(container, user, api, esc, retry) {
  const ready = await participationDevice(api,user);
  if (ready) return ready;
  hideInstallSuggestion();
  activeGuide?.abort();
  const controller = new AbortController(); activeGuide = controller;
  container.querySelector('#participationDevice')?.remove();
  const box = document.createElement('section'); box.id = 'participationDevice'; box.className = 'billing-card device-guide';
  container.prepend(box);
  let checking=false, lastStage, completed=false;
  const finish=async()=>{if(completed)return;completed=true;controller.abort();box.remove();await retry();};
  const paint=async()=>{
    if(!box.isConnected||checking)return;
    checking=true;
    try {
      if(await participationDevice(api,user)){await finish();return;}
      const installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
      const stage=String(installed)+':'+(window.Notification ? Notification.permission : 'unsupported');
      if(stage===lastStage)return;lastStage=stage;
      box.innerHTML=`<span class="eyebrow">${installed?'ULTIMO PASSAGGIO':'PREPARA BYS · 1 DI 2'}</span><div class="device-guide-icon" aria-hidden="true">${installed?'🔔':'📲'}</div><h2>${installed?'Non perderti un messaggio':'Porta BYS sul tuo dispositivo'}</h2>${installed?'<div data-push></div>':'<p>Installa il marketplace e aprilo dalla sua icona. Poi attiveremo gli avvisi per il tuo gruppo.</p><button type="button" class="btn btn-primary" data-install>Installa BYS →</button><p data-help role="status"></p>'}<a href="#miei-abbonamenti" class="device-guide-back">Torna alle mie partecipazioni</a>`;
      if(installed)await renderPushSettings(box.querySelector('[data-push]'),user,api,esc,{compact:true,onReady:async()=>{if(await participationDevice(api,user)){await finish();}else throw new Error('Notifiche non ancora pronte. Riprova.');}});
      else box.querySelector('[data-install]').onclick=async e=>{
        const button=e.currentTarget;button.disabled=true;
        try{box.querySelector('[data-help]').textContent=await installMarketplace();}
        catch{box.querySelector('[data-help]').textContent='Apri il menu del browser e scegli Installa app o Aggiungi alla schermata Home. Poi apri l’icona BYS.';}
        finally{button.disabled=false;}
      };
    }catch{box.innerHTML='<h2>Riproviamo?</h2><p>Non è stato possibile verificare le notifiche.</p><button type="button" class="btn btn-primary">Riprova</button>';box.querySelector('button').onclick=paint;}
    finally{checking=false;}
  };
  window.addEventListener('focus',paint,{signal:controller.signal});
  window.addEventListener('hashchange',()=>controller.abort(),{once:true,signal:controller.signal});
  window.matchMedia('(display-mode: standalone)').addEventListener('change',paint,{signal:controller.signal});
  await paint();
  box.scrollIntoView({block:'start',behavior:'smooth'});
  return null;
}
