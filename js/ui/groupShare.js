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
  const icon = (path) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${path}"/></svg>`;
  return `<div class="group-share-compact"><button class="share-trigger" type="button" data-share-group="${escape(url)}" data-share-title="${escape(group.customServiceName || 'Gruppo BuyYourShare')}">Condividi con</button><a class="share-social share-whatsapp" aria-label="Condividi su WhatsApp" title="WhatsApp" href="${escape(whatsappGroupUrl(group, window.location.origin))}" target="_blank" rel="noopener noreferrer">${icon('M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1l-.7.9c-.1.1-.3.2-.5.1a6.5 6.5 0 0 1-3.1-2.7c-.2-.3.2-.5.5-1 .1-.2 0-.4 0-.5l-.7-1.7c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.9-.8 2.1-.1 3.3 1.2 2.1 3 3.6 5.3 4.2 1.2.3 2.3-.1 2.7-.9.2-.4.3-.8.2-.9 0-.1-.2-.2-.4-.3z')}</a><a class="share-social share-facebook" aria-label="Condividi su Facebook" title="Facebook" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">${icon('M14 22v-9h3l.5-4H14V7c0-1 .3-2 2-2h2V1.5A25 25 0 0 0 15 1c-3 0-5 2-5 5v3H7v4h3v9z')}</a><a class="share-social share-telegram" aria-label="Condividi su Telegram" title="Telegram" href="https://t.me/share/url?url=${encodeURIComponent(url)}" target="_blank" rel="noopener noreferrer">${icon('M21.5 3.5 18 20c-.3 1.2-1 1.5-2 1l-5.3-4-2.6 2.5c-.3.3-.5.5-1 .5l.4-5.5L17.6 5.4c.4-.4-.1-.6-.6-.3L4.5 13l-5-1.6c-1.1-.3-1.1-1.1.2-1.6L20 2c.9-.3 1.7.2 1.5 1.5z')}</a><button type="button" class="share-social" aria-label="Copia link del gruppo" title="Copia link" data-copy-group="${escape(url)}">${icon('M8 7V3h13v14h-4v4H3V7h5zm2 0h7v8h2V5h-9v2zm-5 2v10h10V9H5z')}</button><span role="status" data-share-result></span></div>`;
}

if (typeof document !== 'undefined') document.addEventListener('click', async event => {
  const button = event.target.closest('[data-share-group], [data-copy-group]');
  if (!button) return;
  const result = button.parentElement.querySelector('[data-share-result]');
  try {
    if (!button.dataset.copyGroup && navigator.share) await navigator.share({ title: button.dataset.shareTitle, url: button.dataset.shareGroup });
    else { await navigator.clipboard.writeText(button.dataset.copyGroup || button.dataset.shareGroup); result.textContent = 'Link copiato'; }
  } catch (error) { if (error.name !== 'AbortError') result.textContent = 'Copia non disponibile. Usa Condividi oppure un social.'; }
});
