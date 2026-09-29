import { groupShareLink } from './groupShare.js';
let chatTimer;
export function requestsForView(requests, route, userId) {
  if (route.startsWith('#privata-')) return requests.filter(r => r.id === route.slice(9));
  return requests.filter(r => route === '#miei-gruppi' ? r.ownerId === userId : r.userId === userId);
}
export async function renderManual({ container, route, user, api, shell, esc, money, date, button, link, bind, reload }) {
  clearInterval(chatTimer);
  const { requests, ownedGroups = [] } = await api('/api/manual');
  const labels = { pending: 'In attesa del capogruppo', accepted: 'Posto riservato: pagamento da inviare', reported: 'Pagamento dichiarato: attesa conferma', confirmed: 'Quota confermata dal capogruppo', canceled: 'Richiesta annullata' };
  const selected = route.startsWith('#privata-') ? requests.find(r => r.id === route.slice(9)) : null;
  if (route.startsWith('#privata-') && !selected) { shell('<div class="empty-state"><h2>Conversazione non disponibile</h2><p>La richiesta non esiste oppure non appartiene al tuo account.</p><a class="btn btn-secondary" href="#miei-abbonamenti">Torna alle partecipazioni</a></div>'); return; }
  const list = requestsForView(requests, route, user.id);
  const managing = route === '#miei-gruppi';
  const waiting = list.filter(r => managing ? ['pending','reported'].includes(r.status) : r.status === 'accepted').length;
  const chatMarkup = messages => messages.map(m => `<article class="chat-bubble ${m.senderId === user.id ? 'is-mine' : ''}"><div class="chat-bubble-meta"><strong>${m.senderId === user.id ? 'Tu' : m.senderId ? (selected?.ownerId === user.id ? 'Membro' : 'Capogruppo') : 'Sistema'}</strong><span>${m.createdAt ? esc(new Date(m.createdAt).toLocaleString('it-IT', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})) : ''}</span></div><p>${esc(m.messageContent)}</p></article>`).join('') || '<p class="chat-empty">La conversazione inizia qui. Scrivi per accordarti con l’altra persona.</p>';
  const groups = selected ? [] : ownedGroups;
  shell(`<div class="section-heading"><div><span class="eyebrow">${selected ? 'CONVERSAZIONE RISERVATA' : managing ? 'AREA CAPOGRUPPO' : 'AREA MEMBRO'}</span><h2>${selected ? 'Chat e dettagli della quota' : managing ? 'I miei gruppi' : 'Le mie partecipazioni'}</h2><p>${selected ? 'Accordatevi qui e ritrovate tutti gli aggiornamenti.' : waiting ? waiting === 1 ? 'Una richiesta richiede la tua attenzione' : waiting + ' richieste richiedono la tua attenzione' : 'Gruppi, quote e rinnovi sotto controllo'}</p></div><div id="manualRefresh"></div></div>${groups.filter(g => managing && g.ownerId === user.id).map((g, i) => `<article class="billing-card"><span class="eyebrow">IL TUO GRUPPO · ${esc(({CLOSED: 'Chiuso', DRAFT: 'Bozza', PUBLISHED: 'Pubblicato', FULL: 'Completo'})[g.status] || g.status)}</span><h3>${esc(g.customServiceName)}</h3><div style="display:flex;gap:10px;flex-wrap:wrap">${link(`#gruppo-${g.id}`, "Apri gruppo")}${['PUBLISHED','FULL','active','available'].includes(g.status) ? groupShareLink(g) : ''}${button(`editInstructions${i}`, "Gestisci istruzioni di accesso")}</div><div id="groupInstructions${i}"></div></article>`).join('')}<details class="payment-note"><summary>Pagamenti e promemoria: cosa sapere</summary><p>Solo i partecipanti alla chat privata possono leggere la conversazione. BYS non verifica gli accrediti. Per automatizzare un bonifico periodico, impostalo nella tua banca e concordalo con il capogruppo. I promemoria vengono pubblicati qui e nella sezione Notifiche, tre giorni prima e alla scadenza.</p>${link('#notifiche','Apri notifiche e promemoria')}</details>
    ${list.map((r, i) => {
      const owner = r.ownerId === user.id, d = r.paymentDestination;
      return `<article class="billing-card participation-card"><div class="participation-top"><span class="eyebrow">${owner ? 'CAPOGRUPPO' : 'MEMBRO'} · POSTO ${r.slotNumber}</span><span class="participation-status status-${esc(r.status)}">${esc(labels[r.status] || r.status)}</span></div><h3>${esc(r.groupName)}</h3><p>${owner ? "Membro" : "Capogruppo"}: <strong>${esc(owner ? r.memberName || "Membro" : r.ownerName || "Capogruppo")}</strong></p><p class="participation-price">${money(r.amountCents)} <span>/ mese al capogruppo</span></p>
      ${r.periodEnd ? `<p>Periodo confermato fino al ${date(r.periodEnd)}${Date.parse(r.periodEnd) <= Date.now() ? ' · Rinnovo in attesa' : ''}</p>` : ''}
      ${r.status === 'accepted' ? `<p>Posto riservato fino al ${esc(new Date(r.reservedUntil).toLocaleString('it-IT'))}. Non inviare denaro dopo la scadenza.</p>` : ''}
      ${d ? `<div style="background:#eff6ff;padding:16px;border-radius:12px"><strong>Paga direttamente al capogruppo</strong>${d.iban ? `<p>IBAN: ${esc(d.iban)}<br>Intestatario: ${esc(d.accountHolder)}</p>` : ''}${d.paypalEmail ? `<p>Email PayPal: ${esc(d.paypalEmail)}</p>` : ''}<p>Concordate la causale e le modalità in chat. Non è un pagamento a BYS.</p></div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0">${owner && r.status === 'pending' && !['CLOSED','DRAFT'].includes(r.groupStatus) ? button(`accept${i}`, 'Accetta e riserva 48 ore') : ''}
      ${!owner && (r.status === 'accepted' || (r.status === 'confirmed' && Date.parse(r.periodEnd) - Date.now() <= 3 * 86400000)) ? button(`report${i}`, 'Ho pagato al capogruppo') : ''}
      ${owner && r.status === 'reported' ? button(`confirm${i}`, 'Confermo: quota accreditata') : ''}
      ${['pending','accepted'].includes(r.status) || (r.status === 'confirmed' && Date.parse(r.periodEnd) <= Date.now()) ? button(`cancel${i}`, 'Annulla partecipazione') : ''}
      ${selected ? "" : link(`#privata-${r.id}`, r.unreadMessages ? 'Chat · ' + r.unreadMessages + ' non letti' : 'Apri chat privata')}${link(`#gruppo-${r.groupId}`, 'Gruppo')}${groupShareLink({ id: r.groupId, customServiceName: r.groupName })}${r.periodEnd && Date.parse(r.periodEnd) > Date.now() ? button(`access${i}`, 'Istruzioni di accesso') : ''}</div><pre id="accessText${i}" style="white-space:pre-wrap"></pre></article>`;
    }).join('') || `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">${managing ? '+' : '↗'}</span><h3>${managing ? 'Le richieste arriveranno qui' : 'Trova il tuo prossimo gruppo'}</h3><p>${managing ? 'Crea un gruppo e condividilo su WhatsApp. Potrai accettare i membri e verificare le quote da questa pagina.' : 'Non hai ancora richieste di partecipazione. Esplora il marketplace e scegli un gruppo.'}</p>${link(managing ? '#crea' : '#cerca', managing ? 'Crea un gruppo' : 'Esplora i gruppi')}</div>`}
    ${selected ? '<section class="private-chat"><h3>La vostra conversazione</h3><div id="privateMessages" aria-live="polite" role="log" aria-label="Messaggi della chat privata"></div><form id="privateForm"><label>Messaggio privato<textarea name="content" required maxlength="2000" style="width:100%"></textarea></label><button class="btn btn-primary">Invia messaggio</button></form></section>' : ''}`);
  const refresh = document.createElement('button'); refresh.className = 'btn btn-secondary'; refresh.textContent = 'Aggiorna stato delle richieste'; refresh.type = 'button';
  container.querySelector('#manualRefresh').append(refresh); refresh.addEventListener('click', reload);
  groups.filter(g => managing && g.ownerId === user.id).forEach((g, i) => bind(`editInstructions${i}`, async () => {
    const result = await api(`/api/access/${encodeURIComponent(g.id)}`);
    const area = container.querySelector(`#groupInstructions${i}`);
    area.innerHTML = `<form style="display:grid;gap:12px;margin-top:16px"><label>Istruzioni per i membri confermati<textarea name="instructions" maxlength="2000" required style="width:100%">${esc(result.instructions?.instructions || '')}</textarea></label><label>Link di accesso (facoltativo)<input name="accessUrl" type="url" value="${esc(result.instructions?.accessUrl || '')}" style="width:100%"></label><button class="btn btn-primary">Salva istruzioni</button><p role="status"></p></form>`;
    area.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const submit = e.target.querySelector('button'); submit.disabled = true;
      try {
        await api(`/api/access/${encodeURIComponent(g.id)}`, { ...(result.instructions || {}), ...Object.fromEntries(new FormData(e.target)) });
        area.querySelector('[role="status"]').textContent = 'Istruzioni aggiornate.';
      } catch (error) { area.querySelector('[role="status"]').textContent = error.message; }
      finally { submit.disabled = false; }
    };
  }));
  list.forEach((r, i) => ['accept','report','confirm','cancel'].forEach(action => bind(`${action}${i}`, async () => {
    if (action === 'confirm' && !window.confirm('Hai verificato l’effettivo accredito sul tuo conto? Confermi un mese di accesso al gruppo.')) return;
    await api(`/api/manual/${encodeURIComponent(r.id)}/${action}`, { periodEnd: r.periodEnd || null }); await reload();
  })));
  list.forEach((r,i) => bind(`access${i}`,async () => {
    const result = await api(`/api/access/${encodeURIComponent(r.groupId)}`);
    container.querySelector(`#accessText${i}`).textContent = [result.instructions?.instructions, result.instructions?.accessUrl].filter(Boolean).join('\n');
  }));
  if (selected) {
    const { messages } = await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`);
    const feed = container.querySelector('#privateMessages');
    if (!feed) return;
    const form = container.querySelector('#privateForm');
    const textarea = form.querySelector('textarea');
    textarea.placeholder = 'Scrivi al ' + (selected.ownerId === user.id ? 'membro' : 'capogruppo') + '…';
    const shortcuts = document.createElement('div'); shortcuts.className = 'chat-shortcuts';
    const suggestions = selected.ownerId === user.id ? ['Ciao! Puoi scrivermi qui per qualsiasi dubbio sul gruppo.', 'Il rinnovo si avvicina: trovi le coordinate nei dettagli della quota.', 'Controllo l’accredito e ti confermo appena lo ricevo.'] : ['Ciao! Vorrei informazioni sul gruppo.', 'Vorrei concordare il prossimo rinnovo.', 'Ho un dubbio sulle coordinate di pagamento.'];
    for (const [i, text] of suggestions.entries()) { const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent=['Saluta','Parla del rinnovo','Chiedi chiarimenti'][i];b.onclick=()=>{textarea.value=text;textarea.focus();};shortcuts.append(b); }
    form.prepend(shortcuts);
    const connection=document.createElement('p');connection.setAttribute('role','status');form.append(connection);
    let lastMessageId = null;
    const updateFeed = async items => {
      const latest=items.at(-1)?.id;
      if(latest===lastMessageId)return;
      const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<100;
      feed.innerHTML=chatMarkup(items);
      if(!lastMessageId||nearBottom)feed.scrollTop=feed.scrollHeight;
      lastMessageId=latest;
      if(latest)try {await api(`/api/manual/${encodeURIComponent(selected.id)}/read`,{lastMessageId:latest});}catch{/* Read marker can retry on the next visit. */}
    };
    await updateFeed(messages);
    let loading = false;
    chatTimer = setInterval(async () => {
      if (!feed.isConnected) { clearInterval(chatTimer); return; }
      if (loading || document.hidden) return;
      loading = true;
      try {
        const result = await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`);
        if (feed.isConnected) { await updateFeed(result.messages); connection.textContent=''; }
      } catch { connection.textContent='Collegamento interrotto. I messaggi restano visibili; riprovo automaticamente.'; }
      finally { loading = false; }
    }, 10000);
    let pendingSend;
    form.addEventListener('submit', async e => {
      e.preventDefault(); const btn = form.querySelector('button:not([type="button"])'); btn.disabled = true;
      const content=textarea.value;
      if(!pendingSend||pendingSend.content!==content)pendingSend={content,clientMessageId:crypto.randomUUID()};
      try { await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`, pendingSend); if(textarea.value===content)textarea.value='';pendingSend=null;connection.textContent='Messaggio inviato.';const result=await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`);await updateFeed(result.messages); }
      catch (err) { connection.textContent=err.message+' Il testo è conservato: puoi riprovare.'; }
      finally {btn.disabled=false;}
    });
  }
}
