import {requireParticipationDevice} from './participationDevice.js';
import {issueForm,watchButton,requirementsBox} from './communityFeatures.js';
import { accessPlan, accessRemainingDays } from '../config/accessPlans.js';
import {leaderProfile,mountLeaderRating} from './leaderRating.js';
import { renderBankAccess } from './bankAccess.js';
import { mountGooglePayAccess } from './googlePayAccess.js';
import { groupShareLink } from './groupShare.js';
import { renderManual } from './manualPayments.js';
import { renderNotificationCenter } from './notificationCenter.js';
import { authService } from '../services/authService.js';
import { mountSubscriptionButton } from './paypalSubscriptionButton.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const serviceTheme = name => /spotify/i.test(name || '') ? 'music' : /youtube/i.test(name || '') ? 'video' : 'digital';
const serviceArt = name => `<svg viewBox="0 0 40 40" width="36" height="36" fill="none" aria-hidden="true">${/spotify/i.test(name || '') ? '<path d="M9 15c8-4 17-3 23 1M11 21c6-3 13-2 19 1M13 27c5-2 10-1 15 1" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' : /youtube/i.test(name || '') ? '<rect x="4" y="9" width="32" height="23" rx="7" stroke="currentColor" stroke-width="2"/><path d="m17 15 10 6-10 6z" fill="currentColor"/>' : '<rect x="6" y="6" width="12" height="12" rx="4" stroke="currentColor" stroke-width="2"/><rect x="22" y="6" width="12" height="12" rx="4" stroke="currentColor" stroke-width="2"/><rect x="6" y="22" width="12" height="12" rx="4" stroke="currentColor" stroke-width="2"/><rect x="22" y="22" width="12" height="12" rx="4" stroke="currentColor" stroke-width="2"/>'}</svg>`;
const money = cents => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
const date = value => value ? new Date(value).toLocaleDateString('it-IT') : '—';
const direct = 'Le quote dei gruppi si pagano manualmente tramite bonifico o PayPal, direttamente al capogruppo. BYS non incassa, custodisce né distribuisce tali somme e non offre un deposito a garanzia. L’abbonamento BYS paga esclusivamente l’accesso al P2P.';
const statuses = { inactive: 'Da attivare', pending: 'Pagamento o approvazione in attesa', active: 'Attivo', past_due: 'Pagamento da regolarizzare', suspended: 'Sospeso', canceled: 'Cancellato' };
const messages = {
  RATING_PARTICIPATION_REQUIRED: 'Puoi valutare il capogruppo solo dopo una quota confermata nel suo gruppo.',
  RATING_INVALID: 'Scegli da una a cinque stelle.',
  ACCESS_PLAN_PAYMENT_PENDING: 'Esiste già un pagamento in corso per un altro piano. Completa o fai verificare quello prima di cambiare durata.',
  WALLET_PAYMENT_IN_PROGRESS: 'Hai un tentativo aperto con un altro metodo. Contatta BYS per verificarlo prima di cambiare metodo.',
  INVALID_ACCESS_PLAN: 'Scegli un piano disponibile.',
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
  if (!response.ok) throw Object.assign(new Error(messages[result.error] || result.message || result.error || 'Operazione non completata. Riprova.'), { code: result.error });
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
    const tabs = [['#home','Esplora'],['#miei-abbonamenti','I miei gruppi'],['#messaggi','Messaggi']];
    const activeTab = route === '#miei-gruppi' ? '#miei-abbonamenti' : route.startsWith('#privata-') ? '#messaggi' : route;
    container.innerHTML = `<section class="p2p-access ${billing ? 'p2p-billing' : ''}">
      <div class="workspace-heading"><div><span class="eyebrow">BUYYOURSHARE / MARKETPLACE</span><h1>Il tuo spazio di condivisione.</h1></div><div class="workspace-links"><a class="back-to-bys" href="https://buyyourshare.it/">← Torna a BuyYourShare</a><a class="workspace-help" href="https://buyyourshare.it/support">Hai bisogno di aiuto? ↗</a></div></div>
      <nav class="workspace-nav" aria-label="Marketplace">${tabs.map(([hash,label]) => `<a href="${hash}" class="workspace-tab ${activeTab === hash || hash === '#home' && route === '#cerca' ? 'is-current' : ''}" ${activeTab === hash ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
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
        shell(`<section class="market-hero market-story"><div class="market-story-copy"><span class="hero-kicker">C’È PIÙ GUSTO A CONDIVIDERE.</span><h2>Le passioni<br>si incontrano <em>qui.</em></h2><p>Musica, creatività, intrattenimento. Trova un posto nel gruppo giusto, oppure fai spazio a qualcuno nel tuo.</p><a href="#crea" class="hero-cta">+ Crea il tuo gruppo</a><a href="#miei-abbonamenti" class="hero-secondary">I miei gruppi →</a></div><figure class="market-story-art"><img src="/images/bys-passioni.webp" width="1536" height="1024" fetchpriority="high" alt="Amici che condividono le loro passioni per musica, creatività e cinema"><figcaption>Una passione in comune. Un posto per te.</figcaption></figure><aside class="access-preview"><span>PER PARTECIPARE AI GRUPPI</span><strong>0,99 €<small>/ mese</small></strong><p>Esplorare, creare e gestire i tuoi gruppi è gratuito. Per partecipare ai gruppi altrui serve un accesso BYS attivo.<br>Mensile 0,99 € · Trimestrale 2,69 € · Annuale 9,90 €.</p><a class="bys-access-cta" href="#p2p-abbonamento">Scegli il piano e attiva BYS →</a><small>Le quote ai capigruppo sono separate.</small></aside></section>
        <div class="quick-actions"><a href="#notifiche"><span class="quick-icon">◉</span><div><strong>Notifiche e promemoria</strong><span>Richieste, messaggi e scadenze</span></div><b>↗</b></a><a href="#miei-abbonamenti"><span class="quick-icon">↗</span><div><strong>Le tue partecipazioni</strong><span>Quote, rinnovi e chat private</span></div><b>↗</b></a><a href="#miei-gruppi"><span class="quick-icon">＋</span><div><strong>Gestisci i tuoi gruppi</strong><span>Accogli membri e conferma le quote</span></div><b>↗</b></a></div>
        <section><div class="section-heading"><div><span class="eyebrow">ESPLORA IL MARKETPLACE</span><h2>Un posto per te</h2><p>${groups.length} gruppi pubblici · consultazione gratuita</p></div><label class="group-search">Cerca un servizio<input id="groupSearch" type="search" placeholder="Nome del servizio…"></label></div><div class="bys-watch-panel"><div><strong>Non trovi il posto che cerchi?</strong><p>Scrivi il servizio nella ricerca e attiva un avviso. Ti informeremo quando ci sarà disponibilità.</p></div><div id="watchSearch"></div></div><div class="market-filters"><label><input id="availableOnly" type="checkbox"> Solo posti disponibili</label><label>Ordina per <select id="groupOrder"><option value="default">Più recenti</option><option value="price">Prezzo più basso</option><option value="rating">Valutazione capogruppo</option></select></label></div><div class="group-grid">${groups.map(g => `<article class="group-card" data-theme="${serviceTheme(g.customServiceName)}" data-group-name="${esc((g.customServiceName+' '+g.planName).toLowerCase())}"><div class="group-card-top"><span class="service-monogram">${serviceArt(g.customServiceName)}</span><span class="availability">${g.status === 'FULL' ? 'Completo' : 'Scopri i posti'}</span></div><h3>${esc(g.customServiceName)}</h3><p>${esc(g.planName)}</p><p class="leader-rating-summary">${g.owner?.rating?.count ? `★ ${esc(g.owner.rating.average)} / 5 · ${g.owner.rating.count} valutazioni` : "Capogruppo · nessuna valutazione"}</p><div class="group-price">${money(g.baseMemberShareCents)}<span>/ mese al capogruppo</span></div>${link(`#gruppo-${g.id}`, 'Vedi il gruppo →')}</article>`).join('')}</div><div class="empty-state" id="groupEmpty" ${groups.length ? 'hidden' : ''}><span class="empty-symbol" aria-hidden="true">＋</span><h3>Le condivisioni iniziano da qui</h3><p>Non ci sono ancora gruppi da mostrare. Crea il tuo e invita chi vuoi tramite WhatsApp.</p>${link('#crea','Crea il primo gruppo')}</div></section>`);
        if (user) void api('/api/p2p/subscription').then(({subscription:s})=>{
          if(generation!==turn)return;
          const preview=container.querySelector('.access-preview');if(!preview)return;
          if(s.accessAllowed) preview.innerHTML=`<span>IL TUO ACCESSO BYS</span><strong class="bys-access-active">✓ ATTIVO</strong><p>Puoi creare gruppi e richiedere un posto.<br>Scadenza: <b>${date(s.currentPeriodEnd)}</b></p><a class="bys-access-cta" href="#p2p-abbonamento">Gestisci il tuo accesso →</a><small>Non devi pagare di nuovo per ogni gruppo. Le quote ai capigruppo sono separate.</small>`;
          else if(s.status==='pending') preview.innerHTML='<span>VERIFICA IL TUO ACCESSO</span><strong>Pagamento in attesa</strong><p>Hai un’attivazione da completare o verificare. Se hai già autorizzato il pagamento, controlla lo stato prima di ripagare.</p><a class="bys-access-cta" href="#p2p-abbonamento">Verifica accesso BYS →</a>';
        }).catch(()=>{});
        const cards=[...container.querySelectorAll('[data-group-name]')];
        const filter=()=>{const q=container.querySelector('#groupSearch').value.trim().toLowerCase(),only=container.querySelector('#availableOnly').checked,order=container.querySelector('#groupOrder').value;const pairs=groups.map((g,i)=>({g,el:cards[i]}));pairs.sort((a,b)=>order==='price'?a.g.baseMemberShareCents-b.g.baseMemberShareCents:order==='rating'?(b.g.owner?.rating?.average||0)-(a.g.owner?.rating?.average||0):Date.parse(b.g.createdAt)-Date.parse(a.g.createdAt));let count=0;for(const {g,el} of pairs){const free=g.slotsInfo?.slots?.some(s=>!s.isOccupied&&!s.isOwnerSlot);el.hidden=!el.dataset.groupName.includes(q)||(only&&!free);if(!el.hidden)count++;container.querySelector('.group-grid').append(el);}const empty=container.querySelector('#groupEmpty');empty.hidden=count>0;if(!count&&groups.length){empty.querySelector('h3').textContent='Nessun gruppo corrisponde alla ricerca';empty.querySelector('p').textContent='Cambia i filtri oppure attiva un avviso per il servizio che cerchi.';}};
        for(const id of ['groupSearch','availableOnly','groupOrder'])container.querySelector('#'+id).addEventListener(id==='groupSearch'?'input':'change',filter);filter();
        watchButton(container.querySelector('#watchSearch'),{service:()=>container.querySelector('#groupSearch').value,user,api});


      } else {
        const { group: g } = await api(`/api/groups/${encodeURIComponent(route.slice(8))}`);
        const slots=g.slotsInfo.slots, owner=g.ownerId===user?.id;
        const available=slots.filter(slot=>!slot.isOccupied&&!slot.isOwnerSlot).length;
        shell(`<ol class="bys-journey" aria-label="Come partecipare"><li>1. Scegli il gruppo</li><li>2. Attiva BYS, se necessario</li><li>3. Richiedi il posto</li><li>4. Accorda la quota in chat</li></ol><section class="group-detail" data-theme="${serviceTheme(g.customServiceName)}"><a class="group-back" href="#home">← Esplora i gruppi</a><header class="group-detail-hero"><div class="group-detail-identity"><span class="group-detail-icon" aria-hidden="true">${serviceArt(g.customServiceName)}</span><div><span class="eyebrow">GRUPPO DI CONDIVISIONE</span><h2>${esc(g.customServiceName)}</h2><p>${esc(g.planName)} · Capogruppo: <strong>${esc(g.owner?.fullName||'Capogruppo')}</strong></p>${groupShareLink(g)}</div></div><div class="group-detail-price"><span>A partire da</span><strong>${money(g.baseMemberShareCents ?? slots.find(s=>!s.isOwnerSlot)?.baseShareCents ?? 0)}</strong><span>al mese per posto</span><small>Quota pagata direttamente al capogruppo</small></div></header><div class="group-detail-layout"><section class="group-seats-panel"><div class="group-seats-heading"><div><h3>I posti del gruppo</h3><p>${available} disponibili su ${slots.length} totali</p><div class="seat-meter" aria-hidden="true">${slots.map(slot=>`<i class="${slot.isOccupied||slot.isOwnerSlot?'filled':''}"></i>`).join('')}</div></div><button type="button" id="refreshGroup" class="btn btn-secondary">Aggiorna posti</button></div><div class="group-seats-grid">${slots.map(slot=>`<article class="group-seat ${slot.isOccupied||slot.isOwnerSlot?'is-taken':'is-free'}"><div class="group-seat-top"><span class="group-seat-number">${slot.slotNumber}</span><span class="group-seat-status">${slot.isOwnerSlot?'Capogruppo':slot.isOccupied?'Occupato':'Disponibile'}</span></div><h4>${slot.isOwnerSlot?'Posto del capogruppo':`Posto ${slot.slotNumber}`}</h4>${slot.isOwnerSlot?'<p>Gestisce il gruppo</p>':`<p><strong>${money(slot.baseShareCents)}</strong><span> / mese</span></p>`}${!slot.isOccupied&&!slot.isOwnerSlot?(owner?'<span class="group-seat-hint">Pronto per un nuovo membro</span>':button(`join${slot.slotNumber}`,'Richiedi questo posto')):''}</article>`).join('')}</div></section><aside class="group-info-panel"><h3>${owner?'Il tuo gruppo, in ordine':'Come partecipare'}</h3><p>${owner?'Condividi il gruppo e gestisci richieste e conversazioni dalla tua area.':'Richiedi un posto, attendi l’accettazione e concorda il pagamento nella chat privata con il capogruppo.'}</p>${link(owner?'#miei-gruppi':'#miei-abbonamenti',owner?'Gestisci richieste e chat':'Le mie partecipazioni')}<div class="group-rules"><h4>Regole del gruppo</h4><p>${esc(g.rulesAndRequirements||'Rispetta le regole della community e del servizio condiviso.')}</p></div><p class="group-direct-note">La quota va al capogruppo. L’accesso BYS è separato.</p></aside></div></section>`);
        bind('refreshGroup', reload);
        const panel=container.querySelector('.group-info-panel');
        requirementsBox(panel,g,{owner,user,api,esc});issueForm(panel,{groupId:g.id,user,api,esc});if(!owner&&!available)watchButton(panel,{service:g.customServiceName,groupId:g.id,user,api});
        panel.insertAdjacentHTML('beforeend',leaderProfile(g,esc));
        void mountLeaderRating(container,g,user,api);
        g.slotsInfo.slots.forEach(slot => bind(`join${slot.slotNumber}`, async function requestPlace() {
          if (!user) { window.location.hash = '#login'; return; }
          const current = await api('/api/manual');
          if(current.requests.some(r=>r.groupId===g.id&&r.userId===user.id&&!['canceled','rejected'].includes(r.status))){window.location.hash='#miei-abbonamenti';return;}
          const pushDeviceId = await requireParticipationDevice(container,user,api,esc,requestPlace);
          if(!pushDeviceId)return;
          if(!g.requirements){container.querySelector('#p2pMessage').textContent='Il capogruppo deve completare i requisiti prima di nuove richieste.';return;}
          if(!window.confirm('Hai letto paese, modalità di accesso e requisiti del gruppo? Conferma di rispettarli per inviare la richiesta.'))return;
          const { subscription } = await api('/api/p2p/subscription');
          if (!subscription.accessAllowed) { window.location.hash = '#p2p-abbonamento?group=' + encodeURIComponent(g.id); return; }
          await api(`/api/manual/groups/${encodeURIComponent(g.id)}/request`, { slotNumber: slot.slotNumber, requirementsAccepted:true, pushDeviceId }); window.location.hash = '#miei-abbonamenti';
        }));
      }
    } catch (e) { shell(`<p role="alert">${esc(e.message)}</p>`); }
    return;
  }
  if (!user) {
    shell(`<h2>Un abbonamento per accedere al P2P</h2><p>Membro: <strong>0,99 €/mese</strong>. Creare e gestire i tuoi gruppi: <strong>gratis</strong>.</p>
      <p>Google Pay attiva automaticamente il periodo scelto dopo la conferma del pagamento: 30 giorni, 3 mesi o 12 mesi. Con bonifico serve la verifica dell’incasso. Puoi impostare il bonifico periodico nella tua banca. Le quote dei gruppi sono separate.</p>${link('#login', 'Accedi')}${link('#register', 'Registrati')}`); return;
  }
  try {
    if (route === '#messaggi' || route === '#miei-gruppi' || route === '#miei-abbonamenti' || route.startsWith('#privata-')) {
      await renderManual({ container, route, user, api, shell, esc, money, date, button, link, bind, reload }); return;
    }
    if (route === '#notifiche') { await renderNotificationCenter({ container, user, api, shell, esc, bind, reload }); return; }
    const state = await api('/api/p2p/subscription');
    if (generation !== turn) return;
    const s = state.subscription;
    const returnGroup = route === '#p2p-abbonamento' ? new URLSearchParams(window.location.hash.split('?')[1] || '').get('group') : null;
    if (returnGroup && /^grp-[a-zA-Z0-9-]+$/.test(returnGroup)) {
      const groupRoute = '#gruppo-' + returnGroup;
      if (s.accessAllowed) { window.location.hash = groupRoute; return; }
      shell(`<section class="billing-card"><span class="billing-eyebrow">1. ACCESSO BYS · 2. RICHIESTA DEL POSTO · 3. CHAT PRIVATA</span><h2>Attiva BYS per partecipare al gruppo</h2><p>Questo pagamento attiva il tuo accesso al marketplace. Dopo la conferma tornerai al gruppo per richiedere il posto.</p><p>La quota del gruppo è separata: dopo l’accettazione concorderai il bonifico direttamente con il capogruppo nella chat privata. Il pagamento BYS non prenota il posto.</p>${link(groupRoute, 'Torna al gruppo')}<button id="joinRefresh" type="button" class="btn btn-secondary">Ho pagato · verifica accesso</button></section><section id="joinGoogle" class="billing-card"></section>`, true);
      const finish = async () => {
        const result = await api('/api/p2p/subscription');
        if (result.subscription.accessAllowed) window.location.hash = groupRoute;
        else container.querySelector('#p2pMessage').textContent = 'Pagamento ancora in verifica. Non pagare di nuovo: riprova la verifica tra qualche istante.';
      };
      bind('joinRefresh', finish);
      void mountGooglePayAccess(container.querySelector('#joinGoogle'), api, finish);
      return;
    }
    if (route === '#p2p-abbonamento' || (route !== '#crea' && (!s.accessAllowed || !state.available))) {
      shell(`<div class="billing-grid"><article class="billing-card">
        <div class="billing-top"><span class="billing-eyebrow">ABBONAMENTO BYS</span><span class="billing-status ${s.accessAllowed ? 'is-active' : ''}">${esc(statuses[s.status] || s.status)}</span></div>
        <h2>${s.accessAllowed ? 'Abbonamento BYS<br><span class="bys-active-heading">ATTIVO</span>' : 'Attiva il tuo accesso BYS'}</h2>
        <p class="billing-intro">${route === '#crea' ? 'Per creare il tuo gruppo, attiva l’accesso BYS. Sarai il capogruppo dei gruppi che crei.' : 'Attiva BYS per partecipare ai gruppi altrui. Creare e gestire i tuoi gruppi è gratuito.'}</p>
        <div class="billing-price">${money(s.priceCents)}<span>/ mese</span></div>
        <p class="billing-caption">${!state.paypalAvailable || s.paymentMethod === 'BANK' ? 'Pagamento con bonifico · Conferma dell’incasso a cura di BYS' : 'PayPal: rinnovo automatico mensile. In alternativa scegli il bonifico qui sotto.'}</p>
        <dl class="billing-details"><div><dt>Il piano include</dt><dd>Partecipazione ai gruppi altrui</dd></div><div><dt>${s.cancelAtPeriodEnd ? 'Accesso fino al' : 'Prossimo rinnovo'}</dt><dd>${s.cancelAtPeriodEnd ? date(s.currentPeriodEnd) : s.nextBillingDate ? date(s.nextBillingDate) : 'Dopo l’attivazione'}</dd></div></dl>
        ${!s.accessAllowed ? `<p class="billing-notice">${state.paypalAvailable ? 'Scegli il metodo di pagamento per attivare le funzioni P2P.' : 'Per richiedere un posto nei gruppi altrui, scegli qui sotto il piano e il metodo di pagamento. La quota al capogruppo è separata.'}</p>` : '<p class="billing-notice is-active">Il tuo accesso P2P è attivo.</p>'}
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
      if (['BANK', 'GOOGLE_PAY', 'APPLE_PAY', 'PAYPAL_ONETIME'].includes(s.paymentMethod)) {
        container.querySelector('.billing-price span').textContent = '/ ' + accessPlan(s.accessPlanCode).period;
        const details = container.querySelector('.billing-details');
        details.innerHTML = `<div><dt>Il piano include</dt><dd>Partecipazione ai gruppi altrui</dd></div><div><dt>Accesso fino al</dt><dd>${date(s.currentPeriodEnd)}</dd></div>`;
        const notice = container.querySelector('.billing-notice');
        if (notice) notice.textContent = s.accessAllowed ? 'Il tuo accesso BYS è attivo.' : 'Accesso e assistenza inclusa sospesi: rinnova per riattivarli. Il supporto per problemi di pagamento resta disponibile.';
        if (['GOOGLE_PAY', 'APPLE_PAY', 'PAYPAL_ONETIME'].includes(s.paymentMethod)) {
          container.querySelector('.billing-price span').textContent = '/ ' + accessPlan(s.accessPlanCode).period;
          container.querySelector('.billing-caption').textContent = `${s.paymentMethod === 'APPLE_PAY' ? 'Apple Pay' : s.paymentMethod === 'PAYPAL_ONETIME' ? 'PayPal' : 'Google Pay'} · Pagamento singolo, senza rinnovo automatico`;
        }
      }
      if (s.accessAllowed) {
        container.querySelector('.billing-grid').classList.add('bys-renewal-overview');
        container.querySelector('.billing-price').innerHTML = `${accessRemainingDays(s.currentPeriodEnd)}<span> giorni residui totali</span>`;
        container.querySelector('.billing-caption').textContent = `Ultimo acquisto: ${accessPlan(s.accessPlanCode).label} · ${money(s.priceCents)}. Il totale include i giorni precedenti ancora disponibili.`;
      }
      const bankTarget = document.createElement('section'); bankTarget.className = 'billing-card';
      container.querySelector('.billing-grid').after(bankTarget);
      void renderBankAccess(bankTarget, api, esc, reload);
      const googleTarget = document.createElement('section'); googleTarget.className = 'billing-card';
      bankTarget.before(googleTarget);
      // Keep payment choices ahead of the long introduction for first-time access.
      if (!s.accessAllowed) {
        const overview = container.querySelector('.billing-grid');
        overview.before(googleTarget);
        const details = document.createElement('details');
        details.className = 'bys-access-explainer';
        const summary = document.createElement('summary');
        summary.textContent = 'Il tuo accesso BYS · dettagli e verifica del pagamento';
        overview.before(details);
        details.append(summary, overview);
        // Pending payments must remain visible so users do not pay twice.
        details.open = s.status === 'pending' || !state.available;
      }
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
      shell(`<h2>Crea un gruppo</h2><p>Creare e gestire il tuo gruppo è gratuito. Ricevi le quote direttamente dai membri, senza commissioni BYS. I promemoria di rinnovo vengono inviati automaticamente; tu verifichi gli accrediti.</p>
        <form id="p2pCreate" style="display:grid;gap:16px;max-width:600px">
        <label>Nome servizio <input name="customServiceName" required maxlength="100"></label>
        <label>Nome piano <input name="planName" required maxlength="100"></label>
        <label>Costo totale mensile (€) <input name="realCostEuros" type="number" min="0.01" step="0.01" required></label>
        <label>Posti totali <input name="totalSlots" type="number" min="2" max="50" value="6" required></label>
        <label>Posti riservati al capogruppo <input name="ownerSlots" type="number" min="1" max="49" value="1" required></label>
        <fieldset><legend>Dove ricevere le quote (almeno una modalità)</legend><label>Email PayPal <input name="paypalEmail" type="email" maxlength="254"></label><label>IBAN <input name="payoutIban" maxlength="42"></label><label>Intestatario IBAN <input name="payoutLegalName" maxlength="160"></label></fieldset><p>I recapiti saranno visibili solo dopo avere accettato la richiesta. Le quote sono manuali: verifica ogni accredito prima di confermarlo.</p>
        <label>Istruzioni di accesso (solo membri confermati) <textarea name="instructions" maxlength="2000" required></textarea></label>
        <fieldset><legend>Requisiti visibili prima della richiesta</legend><label>Paese / area<input name="country" required maxlength="80" placeholder="Es. Italia"></label><label>Modalità di accesso<input name="accessMethod" required maxlength="120" placeholder="Es. Invito via email"></label><label>Chi può partecipare<textarea name="eligibility" required maxlength="600" placeholder="Indica i requisiti previsti dal piano e dal fornitore, senza dati privati."></textarea></label></fieldset><label>Regole del gruppo <textarea name="rulesAndRequirements" maxlength="2000"></textarea></label>
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
