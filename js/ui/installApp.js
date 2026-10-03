// Installation is separate from push permission and never starts without a tap.
const KEY = 'bys_install_later_until';
const standalone = window.matchMedia('(display-mode: standalone)');
let installPrompt = null;
let card = null;
let dismissed = false;
const installed = () => standalone.matches || navigator.standalone === true;
function snoozed() {
  try { return Date.now() < Number(localStorage.getItem(KEY) || 0); } catch { return false; }
}
function close(days = 7) {
  dismissed = true;
  try { localStorage.setItem(KEY, String(Date.now() + days * 86400000)); } catch { /* Session dismissal still works. */ }
  card?.remove(); card = null;
}
function instructions() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return ios
    ? 'Apri questo sito in Safari, tocca Condividi e scegli “Aggiungi alla schermata Home”. Poi conferma con “Aggiungi”.'
    : 'Apri il marketplace in Chrome o Edge e cerca “Installa app” nel menu del browser o nella barra degli indirizzi. Su Safari per Mac scegli File → Aggiungi al Dock. Se la voce non compare, usa un browser aggiornato.';
}
function show() {
  if (installed() || dismissed || snoozed() || !window.isSecureContext) return;
  if (card) { card.querySelector('[data-install]').textContent = installPrompt ? 'Installa' : 'Come installare'; return; }
  card = document.createElement('aside');
  card.setAttribute('aria-label', 'Installa il marketplace');
  card.style.cssText = 'position:fixed;z-index:1200;left:16px;bottom:calc(84px + env(safe-area-inset-bottom, 0px));width:min(390px,calc(100vw - 32px));box-sizing:border-box;padding:20px;background:#fff;color:#172033;border:1px solid #dce3f2;border-radius:20px;box-shadow:0 12px 42px #13234d26;max-height:65vh;overflow:auto;font-size:15px;line-height:1.5';
  card.innerHTML = `<div style="display:flex;gap:12px;align-items:center;margin-bottom:10px"><img src="/push-icon-192.png" alt="" width="42" height="42" style="border-radius:12px"><strong style="font-size:18px">BYS sempre a portata di mano</strong></div><p style="margin:0 0 14px">Aggiungi il marketplace al desktop o alla schermata Home e aprilo con un tocco.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary" data-install>${installPrompt ? 'Installa' : 'Come installare'}</button><button type="button" class="btn btn-secondary" data-later>Non ora</button></div><p data-help role="status" style="margin:12px 0 0;font-size:13px;color:#526078">L’installazione non attiva abbonamenti o notifiche.</p>`;
  document.body.append(card);
  card.querySelector('[data-later]').addEventListener('click', () => close());
  card.querySelector('[data-install]').addEventListener('click', async event => {
    if (!installPrompt) { card.querySelector('[data-help]').textContent = instructions(); return; }
    const prompt = installPrompt; installPrompt = null;
    event.currentTarget.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      close(choice.outcome === 'accepted' ? 180 : 7);
    } catch {
      if (card) { card.querySelector('[data-help]').textContent = instructions(); card.querySelector('[data-install]').disabled = false; card.querySelector('[data-install]').textContent = 'Come installare'; }
    }
  });
}
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; show(); });
window.addEventListener('appinstalled', () => close(180));
standalone.addEventListener('change', () => { if (installed()) close(180); });
// Register only the notification worker: no private pages or data are cached.
if (window.isSecureContext && 'serviceWorker' in navigator) navigator.serviceWorker.register('/push-sw.js', { scope: '/' }).catch(() => {});
setTimeout(show, 2500);
