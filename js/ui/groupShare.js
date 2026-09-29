const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Only public identifiers and service names enter the message, never membership data.
export function whatsappGroupUrl({ id, customServiceName }, origin) {
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || !id) throw new Error('Invalid group link');
  const url = new URL('/', base.origin);
  url.hash = `gruppo-${encodeURIComponent(id)}`;
  const name = String(customServiceName || 'Abbonamento condiviso').replace(/[\r\n]+/g, ' ').slice(0, 100);
  const text = `Guarda questo gruppo ${name} su BuyYourShare!\nConsulta i posti disponibili e le condizioni:\n${url.href}\n\nPuoi esplorarlo gratuitamente. Per partecipare serve l’accesso BYS da 0,99 €/mese; la quota del gruppo si paga separatamente al capogruppo.`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function groupShareLink(group) {
  return `<a class="btn btn-secondary" href="${escape(whatsappGroupUrl(group, window.location.origin))}" target="_blank" rel="noopener noreferrer" aria-label="Condividi il gruppo su WhatsApp (si apre in una nuova scheda)">Condividi su WhatsApp</a>`;
}

