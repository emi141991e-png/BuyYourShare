import { renderPushSettings } from './pushSettings.js';

export function notificationTarget(n) {
  const bankAdminUrl = 'https://buyyourshare.it/admin/marketplace-payments';
  if (n.actionUrl === bankAdminUrl || (typeof n.id === 'string' && n.id.startsWith('bank-report:'))) return bankAdminUrl;
  if (typeof n.requestId === 'string' && /^[\w-]+$/.test(n.requestId)) return `#privata-${n.requestId}`;
  const target = n.actionUrl;
  return typeof target === 'string' && /^#(?:miei-gruppi|miei-abbonamenti|p2p-abbonamento|notifiche|(?:gruppo|chat|privata)-[\w-]+)$/.test(target) ? target : null;
}

export async function renderNotificationCenter({ container, user, api, shell, esc, bind, reload }) {
  const { notifications } = await api('/api/notifications');
  notifications.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const unread = notifications.filter(n => !n.isRead).length;
  const timestamp = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  shell(`<div class="section-heading"><div><span class="eyebrow">IL TUO CENTRO AGGIORNAMENTI</span><h2>Notifiche</h2><p>${unread ? `${unread} da leggere` : 'Sei in pari con gli aggiornamenti'} · richieste, chat e promemoria</p></div><button class="btn btn-secondary" id="refreshNotifications">Aggiorna</button></div>
    <div class="notification-layout"><section class="notification-inbox"><div class="notification-toolbar"><div role="group" aria-label="Filtra notifiche"><button class="filter-chip is-selected" id="allNotifications" aria-pressed="true">Tutte (${notifications.length})</button><button class="filter-chip" id="newNotifications" aria-pressed="false">Da leggere (${unread})</button></div>${unread ? '<button class="text-action" id="readAllNotifications">Segna tutte come lette</button>' : ''}</div>
    <div id="notificationList">${notifications.map((n, i) => `<article class="notification-item ${!n.isRead ? 'is-unread' : ''}" data-unread="${!n.isRead}"><div class="notification-dot" aria-hidden="true"></div><div class="notification-content"><div class="notification-meta"><span>${n.isRead ? 'Letta' : 'Nuova'}</span><time>${esc(timestamp(n.createdAt))}</time></div><h3>${esc(n.title || 'Aggiornamento BYS')}</h3><p>${esc(n.message)}</p><div class="notification-actions">${notificationTarget(n) ? `<a class="text-action" id="openNotification${i}" href="${esc(notificationTarget(n))}">Apri dettaglio →</a>` : ''}${!n.isRead ? `<button class="text-action" id="readNotification${i}">Segna come letta</button>` : ''}</div></div></article>`).join('')}</div><div id="notificationEmpty" class="empty-state" ${notifications.length ? 'hidden' : ''}><span class="empty-symbol" aria-hidden="true">✓</span><h3>Nessuna notifica da mostrare</h3><p>Qui troverai richieste di partecipazione, messaggi e promemoria delle quote.</p></div></section>
    <aside><div id="pushSettings" class="billing-card push-panel"></div><div class="help-card"><h3>Non perderti un rinnovo</h3><p>Le notifiche nel sito sono sempre consultabili. Attiva le push per ricevere messaggi, richieste e promemoria sul dispositivo.</p></div></aside></div>`);
  bind('refreshNotifications', reload);
  bind('readAllNotifications', async () => { await api('/api/notifications/read', {}); await reload(); });
  notifications.forEach((n, i) => {
    bind(`readNotification${i}`, async () => { await api('/api/notifications/read', { ids: [n.id] }); await reload(); });
    // Follow the original link even if marking as read is temporarily unavailable.
    container.querySelector(`#openNotification${i}`)?.addEventListener('click', () => { void api('/api/notifications/read', { ids: [n.id] }).catch(() => {}); });
  });
  function filter(onlyNew) {
    container.querySelectorAll('.notification-item').forEach(el => { el.hidden = onlyNew && el.dataset.unread !== 'true'; });
    container.querySelector('#notificationEmpty').hidden = onlyNew ? unread > 0 : notifications.length > 0;
    for (const [id, active] of [['allNotifications', !onlyNew], ['newNotifications', onlyNew]]) { const el = container.querySelector(`#${id}`); el.classList.toggle('is-selected', active); el.setAttribute('aria-pressed', String(active)); }
  }
  container.querySelector('#allNotifications').addEventListener('click', () => filter(false));
  container.querySelector('#newNotifications').addEventListener('click', () => filter(true));
  await renderPushSettings(container.querySelector('#pushSettings'), user, api, esc);
}
