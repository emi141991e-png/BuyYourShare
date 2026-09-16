import { authService } from '../services/authService.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = cents => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const date = value => value ? new Date(value).toLocaleDateString('it-IT') : '—';
const direct = 'Le quote dei gruppi si pagano direttamente al capogruppo. BYS non incassa, custodisce né distribuisce tali somme e non offre un deposito a garanzia. L’abbonamento BYS paga esclusivamente l’accesso al P2P.';
const statuses = { inactive: 'Da attivare', pending: 'Pagamento o approvazione in attesa', active: 'Attivo', past_due: 'Pagamento da regolarizzare', suspended: 'Sospeso', canceled: 'Cancellato' };
const messages = {
  P2P_ACTIVE_SUBSCRIPTION_REQUIRED: 'Attiva o regolarizza l’abbonamento P2P per continuare.',
  P2P_LEADER_PLAN_REQUIRED: 'Conferma il passaggio al piano capogruppo prima di creare il gruppo.',
  MEMBER_SUBSCRIPTION_INACTIVE: 'Il membro deve prima attivare o regolarizzare il proprio abbonamento BYS.',
  P2P_CREATE_REQUIRES_RECONCILIATION: 'La richiesta PayPal deve essere verificata dall’assistenza. Non effettuare un nuovo pagamento.',
  P2P_LEGACY_BILLING_REQUIRES_RECONCILIATION: 'Attivazione temporaneamente sospesa: è in corso la verifica dei precedenti abbonamenti dei gruppi.',
  P2P_BILLING_NOT_ENABLED: 'Il nuovo abbonamento P2P non è ancora disponibile.',
  SLOT_UNAVAILABLE: 'Il posto non è più disponibile. Non inviare la quota senza accordarti con il capogruppo.',
  P2P_PROVIDER_UNAVAILABLE: 'PayPal non è al momento disponibile. Riprova ad aggiornare lo stato; non avviare un secondo pagamento.'
};
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${authService.getToken()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(messages[result.error] || result.message || 'Operazione non completata. Riprova.');
  return result;
}
const button = (id, text) => `<button class="btn btn-primary" id="${id}" type="button">${text}</button>`;
const link = (hash, text) => `<a class="btn btn-secondary" href="${esc(hash)}">${text}</a>`;
let generation = 0;

// All marketplace actions use server-authorized state. Old checkout views are not rendered.
export async function renderP2pAccess(container, route, user) {
  const turn = ++generation;
  container.innerHTML = '<p role="status">Caricamento P2P…</p>';
  const shell = content => {
    if (generation !== turn) return;
    container.innerHTML = `<section class="p2p-access" style="max-width:1000px;margin:auto;padding:24px;display:grid;gap:20px">
      <h1>BuyYourShare P2P</h1><nav style="display:flex;gap:10px;flex-wrap:wrap" aria-label="P2P">
      ${link('#cerca', 'Gruppi')}${link('#crea', 'Crea gruppo')}${link('#miei-abbonamenti', 'Le mie partecipazioni')}${link('#miei-gruppi', 'I miei gruppi')}${link('#p2p-abbonamento', 'Abbonamento BYS')}</nav>
      <p style="padding:16px;background:#eff6ff;border-radius:12px;color:#16345b">${direct}</p>
      <div id="p2pMessage" role="status" aria-live="polite"></div>${content}</section>`;
  };
  function bind(id, fn) {
    const el = container.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener('click', async () => {
      el.disabled = true;
      try { await fn(); } catch (e) {
        const box = container.querySelector('#p2pMessage'); if (box) box.textContent = e.message;
      } finally { el.disabled = false; }
    });
  }
  const reload = () => renderP2pAccess(container, route, user);
  if (!user) {
    shell(`<h2>Un abbonamento per accedere al P2P</h2><p>Membro: <strong>0,99 €/mese</strong>. Capogruppo: <strong>0,49 €/mese</strong>.</p>
      <p>Rinnovo automatico mensile fino alla cancellazione. Le quote dei gruppi sono separate.</p>${link('#login', 'Accedi')}${link('#register', 'Registrati')}`); return;
  }
  try {
    const state = await api('/api/p2p/subscription');
    if (generation !== turn) return;
    const s = state.subscription;
    if (route === '#p2p-abbonamento' || !s.accessAllowed || !state.available || (route === '#crea' && s.role !== 'GROUP_LEADER')) {
      shell(`<h2>Abbonamento di accesso BYS</h2>
        <p><strong>${s.role === 'GROUP_LEADER' ? 'Capogruppo' : 'Membro'} · ${money(s.priceCents)}/mese</strong></p>
        <p>Stato: <strong>${esc(statuses[s.status] || s.status)}</strong></p>
        <p>${s.cancelAtPeriodEnd ? `Rinnovo disattivato. Accesso fino al ${date(s.currentPeriodEnd)}.` : `Rinnovo automatico mensile. Prossima data: ${date(s.nextBillingDate)}.`}</p>
        ${s.pendingRole ? '<p>Passaggio a capogruppo in attesa di consenso PayPal. Fino alla conferma rimane il piano membro.</p>' : ''}
        ${!s.accessAllowed ? '<p>Puoi gestire il pagamento e cancellare il rinnovo da questa pagina. Le funzioni P2P restano sospese finché il pagamento non risulta attivo.</p>' : ''}
        ${!state.available ? `<p>${esc(messages[state.unavailableReason] || 'Attivazione temporaneamente non disponibile.')}</p>` : ''}
        <div style="display:flex;gap:12px;flex-wrap:wrap">
        ${state.available && ['inactive', 'canceled'].includes(s.status) ? `${s.role === 'MEMBER' ? button('p2pMember', 'Attiva membro · 0,99 €/mese') : ''}${button('p2pLeader', 'Attiva capogruppo · 0,49 €/mese')}` : ''}
        ${state.available && s.status === 'pending' && !s.providerStatus ? button('p2pRetry', 'Recupera richiesta PayPal in corso') : ''}
        ${s.approvalUrl ? `<a class="btn btn-primary" href="${esc(s.approvalUrl)}">Continua e approva su PayPal</a>` : ''}
        ${state.available && s.accessAllowed && s.role === 'MEMBER' && !s.cancelAtPeriodEnd ? button('p2pUpgrade', 'Passa a capogruppo · 0,49 €/mese') : ''}
        ${button('p2pRefresh', 'Aggiorna stato PayPal')}
        ${s.providerStatus && !s.cancelAtPeriodEnd && s.status !== 'canceled' ? button('p2pCancel', 'Disattiva rinnovo automatico') : ''}</div>
        <p>Il passaggio a capogruppo modifica lo stesso abbonamento con il tuo consenso su PayPal: 0,49 € dal prossimo ciclo, senza secondo abbonamento o addebiti di conguaglio. Potrai creare il gruppo dopo la conferma. La chiusura dei gruppi non cambia automaticamente il piano.</p>`);
      for (const [id, role] of [['p2pMember', 'MEMBER'], ['p2pLeader', 'GROUP_LEADER']]) bind(id, async () => { await api('/api/p2p/subscription/start', { role }); await reload(); });
      bind('p2pUpgrade', async () => { await api('/api/p2p/subscription/upgrade', {}); await reload(); });
      bind('p2pRetry', async () => { await api('/api/p2p/subscription/start', { role: s.role }); await reload(); });
      bind('p2pRefresh', async () => { await api('/api/p2p/subscription/refresh', {}); await reload(); });
      bind('p2pCancel', async () => {
        if (window.confirm('Disattivare il rinnovo automatico? L’accesso resta valido fino alla fine del periodo già pagato.')) {
          await api('/api/p2p/subscription/cancel', {}); await reload();
        }
      }); return;
    }
    if (route.startsWith('#chat-')) {
      const id = route.slice('#chat-'.length);
      const { chat } = await api(`/api/chat/${encodeURIComponent(id)}`);
      shell(`<h2>Chat · ${esc(chat.groupName)}</h2><div>${chat.messages.map(m => `<p><strong>${esc(m.senderName || 'Sistema')}</strong>: ${esc(m.messageContent)}</p>`).join('')}</div>
        <form id="p2pChat"><label>Messaggio <textarea name="content" maxlength="2000" required></textarea></label><button class="btn btn-primary">Invia</button></form>`);
      container.querySelector('#p2pChat').addEventListener('submit', async e => {
        e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
        try { await api(`/api/chat/${encodeURIComponent(id)}/messages`, Object.fromEntries(new FormData(e.target))); await reload(); }
        catch (error) { container.querySelector('#p2pMessage').textContent = error.message; } finally { btn.disabled = false; }
      }); return;
    }
    if (route === '#notifiche') {
      const { notifications } = await api('/api/notifications');
      shell(`<h2>Notifiche</h2>${notifications.map(n => `<article><h3>${esc(n.title)}</h3><p>${esc(n.message)}</p></article>`).join('') || '<p>Nessuna notifica.</p>'}`); return;
    }
    if (route === '#crea') {
      shell(`<h2>Crea un gruppo</h2><p>Piano capogruppo ${money(s.priceCents)}/mese. Nessuna commissione BYS sulle quote.</p>
        <form id="p2pCreate" style="display:grid;gap:16px;max-width:600px">
        <label>Nome servizio <input name="customServiceName" required maxlength="100"></label>
        <label>Nome piano <input name="planName" required maxlength="100"></label>
        <label>Costo totale mensile (€) <input name="realCostEuros" type="number" min="0.01" step="0.01" required></label>
        <label>Posti totali <input name="totalSlots" type="number" min="2" max="50" value="6" required></label>
        <label>Posti riservati al capogruppo <input name="ownerSlots" type="number" min="1" max="49" value="1" required></label>
        <label>Istruzioni di pagamento diretto (visibili a chi richiede un posto) <textarea name="directPaymentInstructions" maxlength="2000" required></textarea></label>
        <label>Istruzioni di accesso (solo membri confermati) <textarea name="instructions" maxlength="2000" required></textarea></label>
        <label>Regole del gruppo <textarea name="rulesAndRequirements" maxlength="2000"></textarea></label>
        <button class="btn btn-primary" type="submit">Crea gruppo</button></form>`);
      container.querySelector('#p2pCreate').addEventListener('submit', async e => {
        e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
        try {
          const result = await api('/api/groups', Object.fromEntries(new FormData(e.target)));
          window.location.hash = `#gruppo-${result.group.id}`;
        } catch (err) { container.querySelector('#p2pMessage').textContent = err.message; } finally { btn.disabled = false; }
      }); return;
    }
    if (route.startsWith('#gruppo-')) {
      const id = route.slice('#gruppo-'.length);
      const { group: g } = await api(`/api/groups/${encodeURIComponent(id)}`);
      const owner = g.ownerId === user.id;
      shell(`<h2>${esc(g.customServiceName)} · ${esc(g.planName)}</h2><p>${esc(g.rulesAndRequirements)}</p>
        <p>Capogruppo: ${esc(g.owner?.fullName)}. Quote mensili versate direttamente al capogruppo.</p>
        <div style="display:flex;flex-wrap:wrap;gap:12px">${g.slotsInfo.slots.map(slot => `<div style="padding:16px;border:1px solid #cbd5e1;border-radius:12px">
          <p>Posto ${slot.slotNumber} · ${money(slot.baseShareCents)}/mese</p>
          ${!owner && !slot.isOccupied ? button(`request${slot.slotNumber}`, 'Richiedi il posto') : `<p>${slot.isOwnerSlot ? 'Capogruppo' : slot.isOccupied ? 'Occupato' : 'Disponibile'}</p>`}</div>`).join('')}</div>
        <div>${button('p2pInstructions', 'Istruzioni di accesso')}${link(`#chat-${id}`, 'Chat gruppo')}${owner ? button('p2pClose', 'Chiudi gruppo') : ''}</div><pre id="p2pDetails" style="white-space:pre-wrap"></pre>`);
      for (const slot of g.slotsInfo.slots) bind(`request${slot.slotNumber}`, async () => {
        await api(`/api/p2p/groups/${encodeURIComponent(id)}/request`, { slotNumber: slot.slotNumber });
        const pay = await api(`/api/p2p/groups/${encodeURIComponent(id)}/direct-payment`);
        container.querySelector('#p2pDetails').textContent = `${pay.message}\n${pay.ownerName}\n${pay.contactEmail || ''}\n${pay.instructions}\nAttendi l’accordo sul posto prima di pagare. Il capogruppo confermerà la ricezione.`;
      });
      bind('p2pInstructions', async () => { const r = await api(`/api/access/${encodeURIComponent(id)}`); container.querySelector('#p2pDetails').textContent = [r.instructions?.instructions, r.instructions?.accessUrl, r.instructions?.additionalInfo].filter(Boolean).join('\n') || 'Istruzioni non ancora disponibili.'; });
      bind('p2pClose', async () => { if (window.confirm('Chiudere questo gruppo? Il piano capogruppo rimane invariato.')) { await api(`/api/groups/${encodeURIComponent(id)}/cancel`, {}); window.location.hash = '#miei-gruppi'; } });
      return;
    }
    if (route === '#miei-abbonamenti' || route === '#miei-gruppi') {
      const { requests, memberships } = await api('/api/p2p/direct-memberships');
      const { groups } = await api('/api/groups/my');
      const own = new Set(groups.map(g => g.id));
      shell(`<h2>${route === '#miei-gruppi' ? 'I miei gruppi' : 'Le mie partecipazioni'}</h2>
        ${groups.map(g => `<p>${link(`#gruppo-${g.id}`, esc(g.customServiceName))}</p>`).join('')}
        <h3>Richieste di partecipazione</h3><p>Conferma solo quote ricevute direttamente. BYS non verifica né esegue questi pagamenti. Ogni conferma assegna un mese di accesso al gruppo; per un nuovo periodo il membro invia una nuova richiesta.</p>
        ${requests.filter(r => r.status === 'pending').map((r, i) => `<article style="padding:16px;border:1px solid #cbd5e1;margin-bottom:12px">
          <p>${esc(r.memberName)} · posto ${r.slotNumber} ${link(`#gruppo-${r.groupId}`, 'Apri gruppo')}</p>
          ${own.has(r.groupId) ? button(`confirm${i}`, 'Conferma quota ricevuta direttamente') : button(`pay${i}`, 'Mostra istruzioni pagamento diretto')}
          ${button(`cancelRequest${i}`, 'Annulla richiesta')}</article>`).join('') || '<p>Nessuna richiesta in attesa.</p>'}
        <h3>Partecipazioni confermate</h3>${memberships.map(m => `<p>${link(`#gruppo-${m.groupId}`, `Posto ${m.slotNumber}`)} · quota ${money(m.paidShareCents)} · fino al ${date(m.currentPeriodEnd)} · pagamento diretto, senza addebito automatico BYS</p>`).join('') || '<p>Nessuna partecipazione confermata.</p>'}
        <pre id="p2pDetails" style="white-space:pre-wrap"></pre>`);
      requests.filter(r => r.status === 'pending').forEach((r, i) => {
        bind(`confirm${i}`, async () => { if (window.confirm('Confermi di avere ricevuto direttamente la quota per questo posto?')) { await api(`/api/p2p/requests/${encodeURIComponent(r.id)}/confirm`, { paymentReceived: true }); await reload(); } });
        bind(`cancelRequest${i}`, async () => { await api(`/api/p2p/requests/${encodeURIComponent(r.id)}/cancel`, {}); await reload(); });
        bind(`pay${i}`, async () => { const p = await api(`/api/p2p/groups/${encodeURIComponent(r.groupId)}/direct-payment`); container.querySelector('#p2pDetails').textContent = `${p.ownerName}\n${p.contactEmail || ''}\n${p.instructions}\n${p.message}`; });
      }); return;
    }
    const { groups } = await api('/api/groups');
    shell(`<h2>Gruppi disponibili</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px">${groups.map(g => `<article style="padding:24px;border:1px solid #cbd5e1;border-radius:16px">
      <h3>${esc(g.customServiceName)}</h3><p>${esc(g.planName)}</p><p>Quota da ${money(g.baseMemberShareCents)}/mese, direttamente al capogruppo.</p>${link(`#gruppo-${g.id}`, 'Vedi posti')}</article>`).join('') || '<p>Nessun gruppo disponibile.</p>'}</div>`);
  } catch (e) { shell(`<p role="alert">${esc(e.message)}</p>${link('#p2p-abbonamento', 'Gestisci abbonamento')}`); }
}
