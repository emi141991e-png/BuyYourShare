const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only public identifiers and service names enter the message, never membership data.
export function whatsappGroupUrl({ id, customServiceName }, origin) {
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || !id) throw new Error('Invalid group link');
  const url = new URL(`/gruppi/${encodeURIComponent(id)}`, base.origin);
  const name = String(customServiceName || 'Abbonamento condiviso').replace(/[\r\n]+/g, ' ').slice(0, 100);
  const text = `Guarda questo gruppo ${name} su BuyYourShare!\nConsulta i posti disponibili e le condizioni:\n${url.href}\n\nPuoi esplorarlo gratuitamente. Per partecipare serve l’accesso BYS da 0,99 €/mese; la quota del gruppo si paga separatamente al capogruppo.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function groupShareLink(group) {
  const url = `${window.location.origin}/gruppi/${encodeURIComponent(group.id)}`;
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn btn-secondary" type="button" data-share-group="${escape(url)}" data-share-title="${escape(group.customServiceName || 'Gruppo BuyYourShare')}">Condividi gruppo</button><a class="btn btn-secondary" href="${escape(whatsappGroupUrl(group, window.location.origin))}" target="_blank" rel="noopener noreferrer">WhatsApp</a><a class="btn btn-secondary" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">Facebook</a><a class="btn btn-secondary" href="https://t.me/share/url?url=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">Telegram</a><details><summary>Copia link</summary><input aria-label="Link pubblico del gruppo" readonly value="${escape(url)}"></details><span role="status" data-share-result></span></div>`;
}

if (typeof document !== 'undefined') document.addEventListener('click', async event => {
  const button = event.target.closest('[data-share-group]');
  if (!button) return;
  const result = button.parentElement.querySelector('[data-share-result]');
  try {
    if (navigator.share) await navigator.share({ title: button.dataset.shareTitle, url: button.dataset.shareGroup });
    else { await navigator.clipboard.writeText(button.dataset.shareGroup); result.textContent = 'Link copiato'; }
  } catch (error) { if (error.name !== 'AbortError') result.textContent = 'Copia il link dal campo Copia link.'; }
});
