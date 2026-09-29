import { renderBankAccess } from './bankAccess.js';
import { mountGooglePayAccess } from './googlePayAccess.js';
import { groupShareLink } from './groupShare.js';
import { renderManual } from './manualPayments.js';
import { renderNotificationCenter } from './notificationCenter.js';
import { authService } from '../services/authService.js';
import { mountSubscriptionButton } from './paypalSubscriptionButton.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = cents => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const date = value => value ? new Date(value).toLocaleDateString('it-IT') : '—';
const direct = 'Le quote dei gruppi si pagano manualmente tramite bonifico o PayPal, direttamente al capogruppo. BYS non incassa, custodisce né distribuisce tali somme e non offre un deposito a garanzia. L’abbonamento BYS paga esclusivamente l’accesso al P2P.';
const statuses = { inactive: 'Da attivare', pending: 'Pagamento o approvazione in attesa', active: 'Attivo', past_due: 'Pagamento da regolarizzare', suspended: 'Sospeso', canceled: 'Cancellato' };
const messages = {
  BANK_PAYPAL_OPEN: 'Risulta un pagamento automatico da verificare. Contatta BYS prima di inviare un secondo pagamento.',
  BANK_PAYMENT_IN_PROGRESS: 'Stai usando il bonifico: completa la verifica con amministratore prima di passare a PayPal.',
  PAYMENT_DESTINATION_REQUIRED: 'Il capogruppo deve indicare almeno un IBAN con intestatario oppure una email PayPal.',
  INVALID_IBAN: 'Controlla IBAN e intestatario: il codice IBAN non è valido.',
  INVALID_PAYPAL_EMAIL: 'Inserisci una email PayPal valida.',
  INVALID_TRANSITION: 'Lo stato è cambiato. Aggiorna la pagina e controlla la richiesta.',
  RESERVATION_EXPIRED: 'La prenotazione è scaduta. Richiedi di nuovo il posto prima di pagare.',
  PAYMENT_REVIEW_REQUIRED: 'Il pagamento è stato dichiarato: chiarisci l’esito in chat prima di annullare.',
  P2P_QUOTA_NOT_ENABLED: 'I pagamenti diretti PayPal sono in preparazione. Non inviare quote fuori da questo flusso.',
  P2P_QUOTA_NOT_CONFIGURED: 'Il collegamento PayPal dei capigruppo non è ancora disponibile.',
  P2P_QUOTA_LIVE_NOT_APPROVED: 'L’attivazione dei pagamenti diretti è in attesa di abilitazione PayPal.',
  PAYPAL_CONNECTION_REQUIRED: 'Collega prima il tuo conto PayPal.',
  PAYPAL_CONNECTION_INCOMPLETE: 'Completa il collegamento, conferma l’email su PayPal e aggiorna lo stato.',
  PAYPAL_CONNECTION_REVOKED: 'Il consenso PayPal è stato revocato. Contatta l’assistenza per collegare nuovamente il conto.',
  PAYPAL_PAYMENT_REVIEW_REQUIRED: 'Pagamento da verificare. Non effettuare un secondo pagamento: contatta l’assistenza.',
  PAYPAL_ACCOUNT_CHANGE_REQUIRES_REVIEW: 'Per cambiare il conto destinatario contatta l’assistenza.',
  SLOT_RESERVED: 'Il posto è riservato da un pagamento in corso.',
  P2P_ACTIVE_SUBSCRIPTION_REQUIRED: 'Attiva o regolarizza l’abbonamento P2P per continuare.',
  P2P_LEADER_PLAN_REQUIRED: 'Scegli il ruolo capogruppo prima di creare il gruppo.',
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
  if (!response.ok) throw new Error(messages[result.error] || result.message || result.error || 'Operazione non completata. Riprova.');
  return result;
}
const button = (id, text) => `<button class="btn btn-primary" id="${id}" type="button">${text}</button>`;
const link = (hash, text) => `<a class="btn btn-secondary" href="${esc(hash)}">${text}</a>`;
let generation = 0;

// All marketplace actions use server-authorized state. Old checkout views are not rendered.
export async function renderP2pAccess(container, route, user) {
  const turn = ++generation;
  container.innerHTML = '<p role="status">Caricamento P2P…</p>';
  const shell = (content, billing = false) => {
    if (generation !== turn) return;
    const tabs = [['#home','Esplora'],['#crea','Crea gruppo'],['#miei-abbonamenti','Partecipazioni'],['#miei-gruppi','I miei gruppi'],['#notifiche','Notifiche'],['#p2p-abbonamento','Accesso BYS']];
    container.innerHTML = `<section class="p2p-access ${billing ? 'p2p-billing' : ''}">
      <div class="workspace-heading"><div><span class="eyebrow">BUYYOURSHARE / MARKETPLACE</span><h1>Il tuo spazio di condivisione.</h1></div><div class="workspace-links"><a class="back-to-bys" href="https://buyyourshare.it/">← Torna a BuyYourShare</a><a class="workspace-help" href="https://buyyourshare.it/support">Hai bisogno di aiuto? ↗</a></div></div>
      <nav class="workspace-nav" aria-label="Marketplace">${tabs.map(([hash,label]) => `<a href="${hash}" class="workspace-tab ${route === hash || hash === '#home' && route === '#cerca' ? 'is-current' : ''}" ${route === hash ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <div id="p2pMessage" role="status" aria-live="polite"></div>${content}
      <details class="payment-note"><summary>Come funzionano l’accesso BYS e le quote?</summary><p>${direct}</p></details></section>`;

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
  const publicRoute = ['#home', '#cerca', ''].includes(route) || route.startsWith('#gruppo-');
  if (publicRoute) {
    try {
      if (!route.startsWith('#gruppo-')) {
        const { groups } = await api('/api/groups');
        shell(`<section class="market-hero"><div><span class="hero-kicker">PIÙ CONNESSIONI. MENO COMPLICAZIONI.</span><h2>Trova il tuo gruppo.<br>Condividi le possibilità.</h2><p>Esplora gli abbonamenti disponibili, conosci il capogruppo e organizza tutto in un unico spazio.</p><a href="#crea" class="hero-cta">+ Crea un gruppo</a><a href="#miei-abbonamenti" class="hero-secondary">Le mie partecipazioni →</a></div><aside class="access-preview"><span>UN ACCESSO, DUE POSSIBILITÀ</span><strong>0,99 €<small>/ mese</small></strong><p>Partecipa ai gruppi e crea i tuoi.<br>Bonifico mensile, anche periodico dalla tua banca.</p><a href="#p2p-abbonamento">Scopri il tuo accesso →</a><small>Le quote ai capigruppo sono separate.</small></aside></section>
        <div class="quick-actions"><a href="#notifiche"><span class="quick-icon">◉</span><div><strong>Notifiche e promemoria</strong><span>Richieste, messaggi e scadenze</span></div><b>↗</b></a><a href="#miei-abbonamenti"><span class="quick-icon">↗</span><div><strong>Le tue partecipazioni</strong><span>Quote, rinnovi e chat private</span></div><b>↗</b></a><a href="#miei-gruppi"><span class="quick-icon">＋</span><div><strong>Gestisci i tuoi gruppi</strong><span>Accogli membri e conferma le quote</span></div><b>↗</b></a></div>
        <section><div class="section-heading"><div><span class="eyebrow">ESPLORA IL MARKETPLACE</span><h2>Un posto per te</h2><p>${groups.length} gruppi pubblici · consultazione gratuita</p></div>${groups.length ? '<label class="group-search">Cerca un servizio<input id="groupSearch" type="search" placeholder="Nome del servizio…"></label>' : ''}</div><div class="group-grid">${groups.map(g => `<article class="group-card" data-group-name="${esc((g.customServiceName+' '+g.planName).toLowerCase())}"><div class="group-card-top"><span class="service-monogram">${esc((g.customServiceName || 'B').slice(0,1).toUpperCase())}</span><span class="availability">${g.status === 'FULL' ? 'Completo' : 'Scopri i posti'}</span></div><h3>${esc(g.customServiceName)}</h3><p>${esc(g.planName)}</p><div class="group-price">${money(g.baseMemberShareCents)}<span>/ mese al capogruppo</span></div>${link(`#gruppo-${g.id}`, 'Vedi il gruppo →')}</article>`).join('')}</div><div class="empty-state" id="groupEmpty" ${groups.length ? 'hidden' : ''}><span class="empty-symbol" aria-hidden="true">＋</span><h3>Le condivisioni iniziano da qui</h3><p>Non ci sono ancora gruppi da mostrare. Crea il tuo e invita chi vuoi tramite WhatsApp.</p>${link('#crea','Crea il primo gruppo')}</div></section>`);
        container.querySelector('#groupSearch')?.addEventListener('input', e => { const q = e.target.value.trim().toLowerCase(); let visible = 0; container.querySelectorAll('[data-group-name]').forEach(el => { el.hidden = !el.dataset.groupName.includes(q); if (!el.hidden) visible++; }); const empty = container.querySelector('#groupEmpty'); empty.hidden = visible > 0; if (!visible) { empty.querySelector('h3').textContent = 'Nessun gruppo trovato'; empty.querySelector('p').textContent = 'Prova un altro nome oppure crea un nuovo gruppo.'; } });

      } else {
        const { group: g } = await api(`/api/groups/${encodeURIComponent(route.slice(8))}`);
        shell(`<h2>${esc(g.customServiceName)} · ${esc(g.planName)}</h2><div style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0">${groupShareLink(g)}</div><p>${esc(g.rulesAndRequirements)}</p><p>Capogruppo: ${esc(g.owner?.fullName)}</p><p>Richiedi un posto, attendi l’accettazione e concorda il pagamento nella chat privata.</p>${g.slotsInfo.slots.map(slot => `<article class="billing-card"><h3>Posto ${slot.slotNumber} · ${money(slot.baseShareCents)}/mese</h3>${slot.isOccupied ? '<p>Occupato</p>' : g.ownerId === user?.id ? '<p>Disponibile</p>' : button(`join${slot.slotNumber}`, 'Richiedi il posto')}</article>`).join('')}${link('#miei-gruppi', 'Gestisci richieste e chat')}`);
        g.slotsInfo.slots.forEach(slot => bind(`join${slot.slotNumber}`, async () => {
          if (!user) { window.location.hash = '#login'; return; }
          const { subscription } = await api('/api/p2p/subscription');
          if (!subscription.accessAllowed) { window.location.hash = '#p2p-abbonamento'; return; }
          await api(`/api/manual/groups/${encodeURIComponent(g.id)}/request`, { slotNumber: slot.slotNumber }); window.location.hash = '#miei-abbonamenti';
        }));
      }
    } catch (e) { shell(`<p role="alert">${esc(e.message)}</p>`); }
    return;
  }
  if (!user) {
    shell(`<h2>Un abbonamento per accedere al P2P</h2><p>Membro: <strong>0,99 €/mese</strong>. Capogruppo: <strong>0,99 €/mese</strong>.</p>
      <p>Google Pay, quando disponibile, attiva automaticamente 30 giorni dopo la conferma del pagamento. Con bonifico serve la verifica dell’incasso. Puoi impostare il bonifico periodico nella tua banca. Le quote dei gruppi sono separate.</p>${link('#login', 'Accedi')}${link('#register', 'Registrati')}`); return;
  }
  try {
    if (route === '#miei-gruppi' || route === '#miei-abbonamenti' || route.startsWith('#privata-')) {
      await renderManual({ container, route, user, api, shell, esc, money, date, button, link, bind, reload }); return;
    }
    if (route === '#notifiche') { await renderNotificationCenter({ container, user, api, shell, esc, bind, reload }); return; }
    const state = await api('/api/p2p/subscription');
    if (generation !== turn) return;
    const s = state.subscription;
    if (route === '#p2p-abbonamento' || !s.accessAllowed || !state.available) {
      shell(`<div class="billing-grid"><article class="billing-card">
        <div class="billing-top"><span class="billing-eyebrow">ABBONAMENTO BYS</span><span class="billing-status ${s.accessAllowed ? 'is-active' : ''}">${esc(statuses[s.status] || s.status)}</span></div>
        <h2>Un unico piano.<br>Il tuo modo di condividere.</h2>
        <p class="billing-intro">${route === '#crea' ? 'Per creare il tuo gruppo, attiva l’accesso BYS. Sarai il capogruppo dei gruppi che crei.' : 'Partecipa ai gruppi e crea i tuoi con un unico abbonamento.'}</p>
        <div class="billing-price">${money(s.priceCents)}<span>/ mese</span></div>
        <p class="billing-caption">${!state.paypalAvailable || s.paymentMethod === 'BANK' ? 'Pagamento con bonifico · Conferma dell’incasso a cura di BYS' : 'PayPal: rinnovo automatico mensile. In alternativa scegli il bonifico qui sotto.'}</p>
        <dl class="billing-details"><div><dt>Il piano include</dt><dd>Membro e capogruppo</dd></div><div><dt>${s.cancelAtPeriodEnd ? 'Accesso fino al' : 'Prossimo rinnovo'}</dt><dd>${s.cancelAtPeriodEnd ? date(s.currentPeriodEnd) : s.nextBillingDate ? date(s.nextBillingDate) : 'Dopo l’attivazione'}</dd></div></dl>
        ${!s.accessAllowed ? `<p class="billing-notice">${state.paypalAvailable ? 'Scegli il metodo di pagamento per attivare le funzioni P2P.' : 'Trovi qui sotto i dati del bonifico e la tua causale personale.'}</p>` : '<p class="billing-notice is-active">Il tuo accesso P2P è attivo.</p>'}
        ${s.cancelAtPeriodEnd ? '<p class="billing-notice">Rinnovo disattivato: conservi il periodo già pagato.</p>' : ''}
        ${state.paypalAvailable && s.pendingRole ? '<p class="billing-notice">Cambio ruolo in attesa di conferma PayPal.</p>' : ''}
        ${!state.available ? `<p class="billing-notice">${esc(messages[state.unavailableReason] || 'Attivazione temporaneamente non disponibile.')}</p>` : ''}
        ${state.available && state.checkout?.enabled && !s.accessAllowed && ['inactive','canceled','pending'].includes(s.status) ? '<div class="billing-notice"><strong>Collaudo PayPal sandbox</strong><p>Usa solo un conto di prova. Nessun pagamento reale.</p><div id="p2pSdkButton"></div></div>' : ''}
        <div class="billing-actions">
        ${state.paypalAvailable && state.available && ['inactive', 'canceled'].includes(s.status) ? button(s.role === 'GROUP_LEADER' ? 'p2pLeader' : 'p2pMember', 'Attiva il tuo accesso · 0,99 €/mese') : ''}
        ${state.paypalAvailable && state.available && s.status === 'pending' && !s.providerStatus ? button('p2pRetry', 'Recupera richiesta PayPal') : ''}
        ${state.paypalAvailable && s.approvalUrl ? `<a class="btn btn-primary" href="${esc(s.approvalUrl)}">Continua su PayPal <span aria-hidden="true">↗</span></a>` : ''}
        ${state.available && s.accessAllowed ? link('#crea', 'Continua · Crea il tuo gruppo') : ''}
        <button class="billing-refresh" id="p2pRefresh" type="button">Aggiorna stato del pagamento</button></div>
        ${s.paymentMethod === 'PAYPAL' && s.providerStatus && !['APPROVAL_PENDING', 'CANCELLED', 'EXPIRED'].includes(s.providerStatus) && !s.cancelAtPeriodEnd && s.status !== 'canceled' ? '<div class="billing-manage"><button id="p2pCancel" type="button">Disattiva rinnovo automatico</button></div>' : ''}
        </article><aside class="billing-aside"><span class="billing-eyebrow">SEMPLICE, TRASPARENTE</span><h3>Un accesso,<br>due possibilità.</h3><div><span class="billing-step">01</span><h4>Partecipa a un gruppo</h4><p>Scegli il gruppo e gestisci le tue partecipazioni in un unico spazio.</p></div><div><span class="billing-step">02</span><h4>Crea il tuo gruppo</h4><p>Diventa capogruppo senza un secondo abbonamento o costi aggiuntivi di accesso.</p></div><div class="billing-separate"><h4>Le quote restano separate</h4><p>Le quote dei membri vanno direttamente al capogruppo tramite bonifico o PayPal. BYS incassa solo l’abbonamento di accesso.</p></div></aside></div>`, true);
      if (['BANK', 'GOOGLE_PAY'].includes(s.paymentMethod)) {
        const details = container.querySelector('.billing-details');
        details.innerHTML = `<div><dt>Il piano include</dt><dd>Membro e capogruppo</dd></div><div><dt>Accesso fino al</dt><dd>${date(s.currentPeriodEnd)}</dd></div>`;
        const notice = container.querySelector('.billing-notice');
        if (notice) notice.textContent = s.accessAllowed ? 'Il tuo accesso BYS è attivo.' : 'Accesso e assistenza inclusa sospesi: rinnova per riattivarli. Il supporto per problemi di pagamento resta disponibile.';
        if (s.paymentMethod === 'GOOGLE_PAY') {
          container.querySelector('.billing-price span').textContent = '/ 30 giorni';
          container.querySelector('.billing-caption').textContent = 'Google Pay · Pagamento singolo, senza rinnovo automatico';
        }
      }
      const bankTarget = document.createElement('section'); bankTarget.className = 'billing-card';
      container.querySelector('.billing-grid').after(bankTarget);
      void renderBankAccess(bankTarget, api, esc, reload);
      const googleTarget = document.createElement('section'); googleTarget.className = 'billing-card';
      bankTarget.before(googleTarget);
      void mountGooglePayAccess(googleTarget, api, reload);
      const sdkTarget = container.querySelector('#p2pSdkButton');
      if (sdkTarget) void mountSubscriptionButton(sdkTarget, state.checkout, api, message => {
        if (sdkTarget.isConnected) container.querySelector('#p2pMessage').textContent = message;
      }, reload);
      for (const [id, role] of [['p2pMember', 'MEMBER'], ['p2pLeader', 'GROUP_LEADER']]) bind(id, async () => { await api('/api/p2p/subscription/start', { role }); await reload(); });
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
      shell(`<h2>Crea un gruppo</h2><p>Il tuo accesso BYS da ${money(s.priceCents)}/mese include la creazione di gruppi. Sarai il capogruppo di questo gruppo, senza un secondo abbonamento. Nessuna commissione BYS sulle quote.</p>
        <form id="p2pCreate" style="display:grid;gap:16px;max-width:600px">
        <label>Nome servizio <input name="customServiceName" required maxlength="100"></label>
        <label>Nome piano <input name="planName" required maxlength="100"></label>
        <label>Costo totale mensile (€) <input name="realCostEuros" type="number" min="0.01" step="0.01" required></label>
        <label>Posti totali <input name="totalSlots" type="number" min="2" max="50" value="6" required></label>
        <label>Posti riservati al capogruppo <input name="ownerSlots" type="number" min="1" max="49" value="1" required></label>
        <fieldset><legend>Dove ricevere le quote (almeno una modalità)</legend><label>Email PayPal <input name="paypalEmail" type="email" maxlength="254"></label><label>IBAN <input name="payoutIban" maxlength="42"></label><label>Intestatario IBAN <input name="payoutLegalName" maxlength="160"></label></fieldset><p>I recapiti saranno visibili solo dopo avere accettato la richiesta. Le quote sono manuali: verifica ogni accredito prima di confermarlo.</p>
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
    shell('<p>Seleziona una voce del marketplace.</p>');
  } catch (e) { shell(`<p role="alert">${esc(e.message)}</p>${link('#p2p-abbonamento', 'Gestisci abbonamento')}`); }
}
