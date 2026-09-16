import { authService } from '../services/authService.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = cents => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const date = value => value ? new Date(value).toLocaleDateString('it-IT') : '—';
const direct = 'Le quote dei gruppi si pagano esclusivamente con PayPal, direttamente al conto collegato del capogruppo. BYS non incassa, custodisce né distribuisce tali somme e non offre un deposito a garanzia. L’abbonamento BYS paga esclusivamente l’accesso al P2P.';
const statuses = { inactive: 'Da attivare', pending: 'Pagamento o approvazione in attesa', active: 'Attivo', past_due: 'Pagamento da regolarizzare', suspended: 'Sospeso', canceled: 'Cancellato' };
const messages = {
  P2P_QUOTA_NOT_ENABLED: 'I pagamenti diretti PayPal sono in preparazione. Non inviare quote fuori da questo flusso.',
  P2P_QUOTA_NOT_CONFIGURED: 'Il collegamento PayPal dei capigruppo non è ancora disponibile.',
  P2P_QUOTA_LIVE_NOT_APPROVED: 'L’attivazione dei pagamenti diretti è in attesa di abilitazione PayPal.',
  PAYPAL_CONNECTION_REQUIRED: 'Collega prima il tuo conto PayPal Business.',
  PAYPAL_CONNECTION_INCOMPLETE: 'Completa il collegamento, conferma l’email su PayPal e aggiorna lo stato.',
  PAYPAL_CONNECTION_REVOKED: 'Il consenso PayPal è stato revocato. Contatta l’assistenza per collegare nuovamente il conto.',
  PAYPAL_PAYMENT_REVIEW_REQUIRED: 'Pagamento da verificare. Non effettuare un secondo pagamento: contatta l’assistenza.',
  PAYPAL_ACCOUNT_CHANGE_REQUIRES_REVIEW: 'Per cambiare il conto destinatario contatta l’assistenza.',
  SLOT_RESERVED: 'Il posto è riservato da un pagamento in corso.',
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
      const payee = await api('/api/p2p/payee');
      if (payee.status !== 'verified' || !payee.available) {
        shell(`<h2>Collega il PayPal del capogruppo</h2><p>Serve un conto PayPal Business abilitato a ricevere pagamenti. Le quote arriveranno direttamente a quel conto; possono applicarsi le tariffe e le verifiche di PayPal.</p>
          <p>Stato: ${esc(payee.status === 'not_connected' ? 'Da collegare' : payee.status === 'revoked' ? 'Consenso revocato' : 'Collegamento da completare')}</p>
          ${!payee.available ? `<p>${esc(messages[payee.reason] || 'Collegamento non disponibile.')}</p>` : `<form id="p2pPayee"><label>Email PayPal <input type="email" name="email" value="${esc(payee.email)}" required></label>
          <label><input name="consent" type="checkbox" required> Acconsento a condividere l’email e a collegare il mio conto PayPal a BYS per ricevere e verificare le quote. Confermerò le autorizzazioni su PayPal.</label>
          <button class="btn btn-primary">Collega con PayPal</button></form>${button('payeeRefresh', 'Ho completato: verifica collegamento')}`}
          <p>Consulta la <a href="https://www.paypal.com/it/legalhub/paypal/seller-protection" target="_blank" rel="noopener">Protezione vendite PayPal</a> e le relative condizioni: non tutti i pagamenti sono coperti.</p>`);
        container.querySelector('#p2pPayee')?.addEventListener('submit', async e => {
          e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
          try { const values = new FormData(e.target); const result = await api('/api/p2p/payee/connect', { email: values.get('email'), consent: values.get('consent') === 'on' }); window.location.assign(result.approvalUrl); }
          catch (err) { container.querySelector('#p2pMessage').textContent = err.message; btn.disabled = false; }
        });
        bind('payeeRefresh', async () => { await api('/api/p2p/payee/refresh', {}); await reload(); });
        return;
      }
      shell(`<h2>Crea un gruppo</h2><p>Piano capogruppo ${money(s.priceCents)}/mese. Nessuna commissione BYS sulle quote.</p>
        <form id="p2pCreate" style="display:grid;gap:16px;max-width:600px">
        <label>Nome servizio <input name="customServiceName" required maxlength="100"></label>
        <label>Nome piano <input name="planName" required maxlength="100"></label>
        <label>Costo totale mensile (€) <input name="realCostEuros" type="number" min="0.01" step="0.01" required></label>
        <label>Posti totali <input name="totalSlots" type="number" min="2" max="50" value="6" required></label>
        <label>Posti riservati al capogruppo <input name="ownerSlots" type="number" min="1" max="49" value="1" required></label>
        <p>Destinatario delle quote: il tuo conto PayPal collegato. Pagamento mensile della quota con conferma automatica; nessun addebito automatico della quota.</p>
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
        window.location.hash = '#miei-abbonamenti';
      });
      bind('p2pInstructions', async () => { const r = await api(`/api/access/${encodeURIComponent(id)}`); container.querySelector('#p2pDetails').textContent = [r.instructions?.instructions, r.instructions?.accessUrl, r.instructions?.additionalInfo].filter(Boolean).join('\n') || 'Istruzioni non ancora disponibili.'; });
      bind('p2pClose', async () => { if (window.confirm('Chiudere questo gruppo? Il piano capogruppo rimane invariato.')) { await api(`/api/groups/${encodeURIComponent(id)}/cancel`, {}); window.location.hash = '#miei-gruppi'; } });
      return;
    }
    if (route === '#miei-abbonamenti' || route === '#miei-gruppi') {
      const { requests, memberships } = await api('/api/p2p/direct-memberships');
      const { payments } = await api('/api/p2p/quota-payments');
      const { groups } = await api('/api/groups/my');
      const own = new Set(groups.map(g => g.id));
      const pending = requests.filter(r => r.status === 'pending');
      const paymentLabel = { creating: 'Richiesta in verifica', awaiting_approval: 'Da approvare su PayPal', capturing: 'Pagamento in verifica', pending: 'PayPal: pagamento in attesa', completed: 'Incasso confermato da PayPal', received_needs_review: 'Incasso ricevuto: assistenza necessaria', failed: 'Pagamento non riuscito', refunded: 'Pagamento rimborsato', reversed: 'Pagamento stornato' };
      shell(`<h2>${route === '#miei-gruppi' ? 'I miei gruppi' : 'Le mie partecipazioni'}</h2>
        ${groups.map(g => `<p>${link(`#gruppo-${g.id}`, esc(g.customServiceName))}</p>`).join('')}
        <h3>Quote PayPal</h3><p>Ogni quota copre un mese e non si rinnova automaticamente. Dopo l’approvazione su PayPal, premi «Verifica e completa pagamento». L’accesso si attiva solo dopo l’incasso confermato. Eventuali rimborsi o storni aggiornano lo stato.</p>
        ${pending.map((r, i) => {
          const p = payments.find(p => p.requestId === r.id);
          return `<article style="padding:16px;border:1px solid #cbd5e1;margin-bottom:12px"><p>${esc(r.memberName)} · posto ${r.slotNumber} ${link(`#gruppo-${r.groupId}`, 'Apri gruppo')}</p>
          ${p ? `<p>${esc(paymentLabel[p.status] || p.status)} · ${money(p.amountCents)}</p>` : ''}
          ${!own.has(r.groupId) && (!p || p.status === 'creating') ? button(`pay${i}`, p ? 'Recupera richiesta PayPal' : 'Prepara pagamento PayPal') : ''}
          ${!own.has(r.groupId) && p?.approvalUrl ? `<a class="btn btn-primary" href="${esc(p.approvalUrl)}">Paga ${money(p.amountCents)} con PayPal</a>` : ''}
          ${p ? button(`verify${i}`, own.has(r.groupId) ? 'Verifica incasso PayPal' : 'Verifica e completa pagamento') : button(`cancelRequest${i}`, 'Annulla richiesta')}</article>`;
        }).join('') || '<p>Nessuna quota in attesa.</p>'}
        <h3>Storico pagamenti</h3>${payments.map(p => `<p>${link(`#gruppo-${p.groupId}`, 'Gruppo')} · ${money(p.amountCents)} · ${esc(paymentLabel[p.status] || p.status)}${p.captureId ? ` · transazione ${esc(p.captureId)}` : ''}</p>`).join('') || '<p>Nessun pagamento.</p>'}
        <h3>Partecipazioni</h3>${memberships.map(m => `<p>${link(`#gruppo-${m.groupId}`, `Posto ${m.slotNumber}`)} · quota ${money(m.paidShareCents)} · fino al ${date(m.currentPeriodEnd)} · ${esc(m.status)} · PayPal diretto, nessun rinnovo automatico della quota</p>`).join('') || '<p>Nessuna partecipazione confermata.</p>'}`);
      pending.forEach((r, i) => {
        const p = payments.find(p => p.requestId === r.id);
        bind(`pay${i}`, async () => { await api(`/api/p2p/requests/${encodeURIComponent(r.id)}/order`, {}); await reload(); });
        bind(`verify${i}`, async () => { await api(`/api/p2p/quota-payments/${encodeURIComponent(p.id)}/refresh`, {}); await reload(); });
        bind(`cancelRequest${i}`, async () => { await api(`/api/p2p/requests/${encodeURIComponent(r.id)}/cancel`, {}); await reload(); });
      }); return;
    }
    const { groups } = await api('/api/groups');
    shell(`<h2>Gruppi disponibili</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px">${groups.map(g => `<article style="padding:24px;border:1px solid #cbd5e1;border-radius:16px">
      <h3>${esc(g.customServiceName)}</h3><p>${esc(g.planName)}</p><p>Quota da ${money(g.baseMemberShareCents)}/mese, direttamente al capogruppo.</p>${link(`#gruppo-${g.id}`, 'Vedi posti')}</article>`).join('') || '<p>Nessun gruppo disponibile.</p>'}</div>`);
  } catch (e) { shell(`<p role="alert">${esc(e.message)}</p>${link('#p2p-abbonamento', 'Gestisci abbonamento')}`); }
}
