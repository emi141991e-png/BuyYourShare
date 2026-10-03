import {issueForm,participationProgress,communityInbox} from './communityFeatures.js';
import { groupShareLink } from './groupShare.js';
let chatTimer;
export function requestsForView(requests, route, userId) {
  if (route.startsWith('#privata-')) return requests.filter(r => r.id === route.slice(9));
  return requests.filter(r => route === '#miei-gruppi' ? r.ownerId === userId : r.userId === userId);
}
export async function renderManual({ container, route, user, api, shell, esc, money, date, button, link, bind, reload }) {
  clearInterval(chatTimer);
  const { requests, ownedGroups = [] } = await api('/api/manual');
  if (route === '#messaggi') {
    const conversations=requests.filter(r=>r.userId===user.id||r.ownerId===user.id).sort((a,b)=>(b.unreadMessages||0)-(a.unreadMessages||0));
    shell(`<div class="section-heading"><div><h2>Messaggi</h2><p>Le conversazioni dei gruppi a cui partecipi e di quelli che gestisci.</p></div>${link('#notifiche','Notifiche e promemoria')}</div><div class="bys-inbox">${conversations.map(r=>`<a class="billing-card" href="#privata-${esc(r.id)}"><h3>${esc(r.groupName)}</h3><p>${r.ownerId===user.id?'Membro':'Capogruppo'}: ${esc(r.ownerId===user.id?r.memberName||'Membro':r.ownerName||'Capogruppo')}</p><strong>${r.unreadMessages?`${Number(r.unreadMessages)} messaggi da leggere`:'Apri conversazione'} →</strong></a>`).join('')||'<div class="empty-state"><h3>Qui troverai le tue chat</h3><p>Quando richiedi un posto, la conversazione con il capogruppo sarà disponibile qui.</p><a href="#home" class="btn btn-primary">Esplora i gruppi</a></div>'}</div>`);
    return;
  }
  const labels = { pending: 'In attesa del capogruppo', accepted: 'Posto riservato: pagamento da inviare', reported: 'Pagamento dichiarato: attesa conferma', confirmed: 'Quota confermata dal capogruppo', canceled: 'Richiesta annullata' };
  const selected = route.startsWith('#privata-') ? requests.find(r => r.id === route.slice(9)) : null;
  if (route.startsWith('#privata-') && !selected) { shell('<div class="empty-state"><h2>Conversazione non disponibile</h2><p>La richiesta non esiste oppure non appartiene al tuo account.</p><a class="btn btn-secondary" href="#miei-abbonamenti">Torna alle partecipazioni</a></div>'); return; }
  const list = requestsForView(requests, route, user.id);
  const managing = route === '#miei-gruppi';
  const waiting = list.filter(r => managing ? ['pending','reported'].includes(r.status) : r.status === 'accepted').length;
  const chatMarkup = messages => messages.map(m => `<article class="chat-bubble ${m.senderId === user.id ? 'is-mine' : ''}"><div class="chat-bubble-meta"><strong>${m.senderId === user.id ? 'Tu' : m.senderId ? (selected?.ownerId === user.id ? 'Membro' : 'Capogruppo') : 'Sistema'}</strong><span>${m.createdAt ? esc(new Date(m.createdAt).toLocaleString('it-IT', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})) : ''}</span></div><p>${esc(m.messageContent)}</p>${m.attachment ? `<button type="button" class="btn btn-secondary" data-photo="${esc(m.id)}">Visualizza foto allegata</button><div></div>` : ""}</article>`).join('') || '<p class="chat-empty">La conversazione inizia qui. Scrivi per accordarti con l’altra persona.</p>';
  const groups = selected ? [] : ownedGroups;
  shell(`${!selected?`<nav class="bys-group-tabs" aria-label="I miei gruppi"><a href="#miei-abbonamenti" class="btn ${!managing?'btn-primary':'btn-secondary'}">Partecipo</a><a href="#miei-gruppi" class="btn ${managing?'btn-primary':'btn-secondary'}">Gestisco</a>${link('#crea','+ Crea gruppo')}</nav>`:link('#messaggi','← Tutti i messaggi')}<div class="section-heading"><div><span class="eyebrow">${selected ? 'CONVERSAZIONE RISERVATA' : managing ? 'AREA CAPOGRUPPO' : 'AREA MEMBRO'}</span><h2>${selected ? 'Chat e dettagli della quota' : managing ? 'Gruppi che gestisco' : 'Gruppi a cui partecipo'}</h2><p>${selected ? 'Accordatevi qui e ritrovate tutti gli aggiornamenti.' : waiting ? waiting === 1 ? 'Una richiesta richiede la tua attenzione' : waiting + ' richieste richiedono la tua attenzione' : 'Gruppi, quote e rinnovi sotto controllo'}</p></div><div id="manualRefresh"></div></div>${groups.filter(g => managing && g.ownerId === user.id).map((g, i) => `<article class="billing-card"><span class="eyebrow">IL TUO GRUPPO · ${esc(({CLOSED: 'Chiuso', DRAFT: 'Bozza', PUBLISHED: 'Pubblicato', FULL: 'Completo'})[g.status] || g.status)}</span><h3>${esc(g.customServiceName)}</h3><div style="display:flex;gap:10px;flex-wrap:wrap">${link(`#gruppo-${g.id}`, "Apri gruppo")}${['PUBLISHED','FULL','active','available'].includes(g.status) ? groupShareLink(g) : ''}${button(`editInstructions${i}`, "Gestisci istruzioni di accesso")}</div><div id="groupInstructions${i}"></div></article>`).join('')}<details class="payment-note"><summary>Pagamenti e promemoria: cosa sapere</summary><p>Solo i partecipanti alla chat privata possono leggere la conversazione. BYS non verifica gli accrediti. Per automatizzare un bonifico periodico, impostalo nella tua banca e concordalo con il capogruppo. I promemoria vengono pubblicati qui e nella sezione Notifiche, tre giorni prima e alla scadenza.</p>${link('#notifiche','Apri notifiche e promemoria')}</details>
    ${list.map((r, i) => {
      const owner = r.ownerId === user.id, d = r.paymentDestination;
      return `<article class="billing-card participation-card"><div class="participation-top"><span class="eyebrow">${owner ? 'CAPOGRUPPO' : 'MEMBRO'} · POSTO ${r.slotNumber}</span><span class="participation-status status-${esc(r.status)}">${esc(labels[r.status] || r.status)}</span></div><h3>${esc(r.groupName)}</h3><p>${owner ? "Membro" : "Capogruppo"}: <strong>${esc(owner ? r.memberName || "Membro" : r.ownerName || "Capogruppo")}</strong></p><p class="eyebrow">QUOTA DEL GRUPPO · DESTINATARIO: CAPOGRUPPO</p><p class="participation-price">${money(r.amountCents)} <span>/ mese al capogruppo</span></p>
      ${r.periodEnd ? `<p>Periodo confermato fino al ${date(r.periodEnd)}${Date.parse(r.periodEnd) <= Date.now() ? ' · Rinnovo in attesa' : ''}</p>` : ''}
      ${r.status === 'accepted' ? `<p>Posto riservato fino al ${esc(new Date(r.reservedUntil).toLocaleString('it-IT'))}. Non inviare denaro dopo la scadenza.</p>` : ''}
      ${d ? `<div style="background:#eff6ff;padding:16px;border-radius:12px"><strong>Paga direttamente al capogruppo</strong>${d.iban ? `<p>IBAN: ${esc(d.iban)}<br>Intestatario: ${esc(d.accountHolder)}</p>` : ''}${d.paypalEmail ? `<p>Email PayPal: ${esc(d.paypalEmail)}</p>` : ''}<p>Concordate la causale e le modalità in chat. Non è un pagamento a BYS.</p></div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0">${owner && r.status === 'pending' && !['CLOSED','DRAFT'].includes(r.groupStatus) ? button(`accept${i}`, 'Accetta e riserva 48 ore') : ''}
      ${!owner && !r.leaveAtPeriodEnd && (r.status === 'accepted' || (r.status === 'confirmed' && Date.parse(r.periodEnd) - Date.now() <= 3 * 86400000)) ? button(`report${i}`, 'Ho pagato al capogruppo') : ''}
      ${owner && r.status === 'reported' ? button(`confirm${i}`, 'Confermo: quota accreditata') : ''}
      ${['pending','accepted'].includes(r.status) || (r.status === 'confirmed' && Date.parse(r.periodEnd) <= Date.now()) ? button(`cancel${i}`, 'Annulla partecipazione') : ''}
      ${selected ? "" : link(`#privata-${r.id}`, r.unreadMessages ? 'Chat · ' + r.unreadMessages + ' non letti' : 'Apri chat privata')}${link(`#gruppo-${r.groupId}`, 'Gruppo')}${groupShareLink({ id: r.groupId, customServiceName: r.groupName })}${r.periodEnd && Date.parse(r.periodEnd) > Date.now() ? button(`access${i}`, 'Istruzioni di accesso') : ''}</div><pre id="accessText${i}" style="white-space:pre-wrap"></pre></article>`;
    }).join('') || `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">${managing ? '+' : '↗'}</span><h3>${managing ? 'Le richieste arriveranno qui' : 'Trova il tuo prossimo gruppo'}</h3><p>${managing ? 'Crea un gruppo e condividilo su WhatsApp. Potrai accettare i membri e verificare le quote da questa pagina.' : 'Non hai ancora richieste di partecipazione. Esplora il marketplace e scegli un gruppo.'}</p>${link(managing ? '#crea' : '#cerca', managing ? 'Crea un gruppo' : 'Esplora i gruppi')}</div>`}
    ${selected ? '<section class="private-chat"><h3>La vostra conversazione</h3><div id="privateMessages" aria-live="polite" role="log" aria-label="Messaggi della chat privata"></div><form id="privateForm"><label>Messaggio privato<textarea name="content" maxlength="2000" style="width:100%"></textarea></label><label class="btn btn-secondary" style="display:block">Allega foto<input id="receiptPhoto" type="file" accept="image/jpeg,image/png,image/webp" style="display:block;max-width:100%;margin-top:8px"></label><div id="receiptPreview"></div><p>Foto privata della ricevuta. Oscura i dati non necessari. L’accredito va comunque verificato dal capogruppo.</p><button class="btn btn-primary">Invia</button></form></section>' : ''}`);
  const refresh = document.createElement('button'); refresh.className = 'btn btn-secondary'; refresh.textContent = 'Aggiorna stato delle richieste'; refresh.type = 'button';
  container.querySelectorAll('.participation-card').forEach((card,i)=>{
    const r=list[i];participationProgress(card,r,{user,api,reload,esc});issueForm(card,{groupId:r.groupId,requestId:r.id,user,api,esc});const url=r.ownerId===user.id?r.memberAvatar:r.ownerAvatar;
    if(url){const img=document.createElement('img');img.src=url;img.alt='Foto profilo';img.width=44;img.height=44;img.style.cssText='border-radius:50%;object-fit:cover;margin:12px 0';card.querySelector('h3').after(img);}
    if(r.ownerId!==user.id&&r.periodEnd){const a=document.createElement('a');a.href='#gruppo-'+r.groupId;a.className='btn btn-secondary';a.textContent='★ Valuta il capogruppo';card.append(a);}
  });
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
  if(!selected)await communityInbox(container,{api,esc});
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
    const fileInput=form.querySelector('#receiptPhoto'),preview=form.querySelector('#receiptPreview');
    let attachment=null,preparing=false;
    fileInput.addEventListener('change',async()=>{
      attachment=null;preview.replaceChildren();const file=fileInput.files[0];if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){connection.textContent='Scegli una foto JPG, PNG o WebP, massimo 10 MB.';fileInput.value='';return;}
      preparing=true;connection.textContent='Preparazione foto…';const url=URL.createObjectURL(file);
      try{const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,1600/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',0.85);if(data.length>2800000)throw new Error();attachment={data};const thumb=document.createElement('img');thumb.src=data;thumb.alt='Anteprima foto da inviare';thumb.style.cssText='max-width:240px;max-height:200px;border-radius:12px;margin:12px 0';const remove=document.createElement('button');remove.type='button';remove.className='btn btn-secondary';remove.textContent='Rimuovi foto';remove.onclick=()=>{attachment=null;fileInput.value='';preview.replaceChildren();};preview.append(thumb,remove);connection.textContent='Foto pronta. Premi Invia per condividerla.';}catch{connection.textContent='Impossibile preparare questa foto. Scegli un’altra immagine.';fileInput.value='';}finally{preparing=false;URL.revokeObjectURL(url);}
    });
    feed.addEventListener('click',async e=>{const b=e.target.closest('[data-photo]');if(!b)return;b.disabled=true;try{const result=await api(`/api/manual/${encodeURIComponent(selected.id)}/attachments/${encodeURIComponent(b.dataset.photo)}`);const img=document.createElement('img');img.src=result.data;img.alt='Foto allegata alla conversazione';img.style.cssText='max-width:100%;max-height:650px;object-fit:contain;border-radius:12px;margin-top:10px';b.nextElementSibling.replaceChildren(img);b.textContent='Foto caricata';}catch{b.disabled=false;connection.textContent='Impossibile aprire la foto. Riprova.';}});
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
      e.preventDefault(); if(preparing)return; if(!textarea.value.trim()&&!attachment){connection.textContent='Scrivi un messaggio o allega una foto.';return;} const btn = form.querySelector('button:not([type="button"])'); btn.disabled = true;
      const content=textarea.value,sentAttachment=attachment;
      if(!pendingSend||pendingSend.content!==content||pendingSend.attachment!==attachment)pendingSend={content,attachment,clientMessageId:crypto.randomUUID()};
      try { await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`, pendingSend); if(textarea.value===content)textarea.value='';if(attachment===sentAttachment){attachment=null;fileInput.value='';preview.replaceChildren();}pendingSend=null;connection.textContent='Messaggio inviato.';const result=await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`);await updateFeed(result.messages); }
      catch (err) { connection.textContent=err.message+' Il testo è conservato: puoi riprovare.'; }
      finally {btn.disabled=false;}
    });
  }
}
