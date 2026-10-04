import {simplifyQuota,actionSummary} from './quickQuota.js';
import {reportForm, openReceipt} from './receiptReport.js';

export function quotaState(r, now = Date.now()) {
  if (r.status === 'reported') return ['review', 'Da verificare'];
  if (r.status === 'pending') return ['waiting', 'Richiesta di ingresso'];
  if (r.leaveAtPeriodEnd) return ['waiting', 'In uscita'];
  if (r.status === 'confirmed') return Date.parse(r.periodEnd) > now ? ['paid', 'In regola'] : ['due', 'Da rinnovare'];
  if (r.status === 'accepted') return ['due', 'Da pagare'];
  return ['waiting', 'Conclusa'];
}

export function confirmedThisMonth(requests, now = new Date()) {
  const month = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome', year:'numeric', month:'2-digit'});
  const current = month.format(now);
  return requests.flatMap(r => r.confirmations || []).reduce((sum,c) => {
    const time = new Date(c.confirmedAt);
    return Number.isFinite(time.getTime()) && month.format(time) === current && Number.isSafeInteger(c.amountCents) ? sum + c.amountCents : sum;
  }, 0);
}

export async function mountGroupWorkspace(container,g,user,{api,reload,esc,money,date}) {
  const panel = container.querySelector('.group-seats-panel');
  const {requests} = await api('/api/manual');
  if (!panel?.isConnected) return;
  const owner = g.ownerId === user.id;
  const all = requests.filter(r => r.groupId === g.id);
  const list = all.filter(r => !['canceled','rejected'].includes(r.status));
  if (!owner && !list.length) return;
  list.sort((a,b) => ({reported:0,pending:1,accepted:2,confirmed:3}[a.status]??4)-({reported:0,pending:1,accepted:2,confirmed:3}[b.status]??4));
  container.querySelector('.bys-journey')?.remove();
  const sidebar = container.querySelector('.group-info-panel');
  sidebar.querySelector('h3').textContent = owner ? 'Gestisci il gruppo' : 'Il tuo gruppo';
  sidebar.querySelector('p').textContent = owner ? 'Le richieste e le quote sono qui accanto. Apri la gestione per le istruzioni di accesso e le altre opzioni.' : 'La tua quota va direttamente al capogruppo. Per accordi e assistenza usa la chat privata.';
  const manage = sidebar.querySelector('a');
  if (manage) manage.textContent = owner ? 'Gestisci gruppo →' : 'Tutte le mie partecipazioni →';
  panel.classList.add('group-workspace');
  panel.innerHTML = `<div class="group-seats-heading"><div><span class="eyebrow">${owner?'IL TUO GRUPPO, SOTTO CONTROLLO':'LA TUA PARTECIPAZIONE'}</span><h3>${owner?'Membri e quote':'La tua quota'}</h3></div><button type="button" id="refreshGroup" class="btn btn-secondary">Aggiorna</button></div>
    ${owner?`<div class="quota-overview"><div><span>Quote confermate questo mese</span><strong>${money(confirmedThisMonth(all))}</strong><small>Accrediti diretti confermati da te</small></div><div><strong>${list.filter(r=>r.status==='reported').length}</strong><span>da verificare</span></div><div><strong>${g.slotsInfo.slots.filter(s=>!s.isOccupied&&!s.isOwnerSlot).length}</strong><span>posti liberi</span></div></div><p class="quota-caption">Conferma solo dopo aver verificato l’accredito sul tuo conto. Questo riepilogo non è un saldo da prelevare.</p>`:''}
    <div class="quota-members">${list.map((r,i)=>{
      const [tone,label] = quotaState(r), name = owner?r.memberName:r.ownerName;
      const canReport = !owner&&!r.leaveAtPeriodEnd&&(r.status==='accepted'||r.status==='confirmed'&&Date.parse(r.periodEnd)-Date.now()<=3*86400000);
      return `<article class="quota-member"><div class="quota-person"><span class="quota-avatar" aria-hidden="true">${esc((name||'M').slice(0,1))}</span><div><strong>${esc(name||'Membro')}</strong><small>${owner?`Posto ${esc(r.slotNumber)}`:'Il tuo capogruppo'}</small></div><span class="quota-label ${tone}">${label}</span></div><div class="quota-facts"><strong>${money(r.amountCents)} <small>/ mese</small></strong><span>${r.periodEnd?`${r.leaveAtPeriodEnd?'Uscita prevista':'Periodo confermato fino al'} <b>${date(r.periodEnd)}</b>`:r.status==='accepted'?`Posto riservato fino al <b>${date(r.reservedUntil)}</b>`:'In attesa di conferma'}</span></div>
      ${!owner&&r.status==='reported'?'<p>Pagamento segnalato. Attendi la verifica del capogruppo: non inviare un secondo pagamento.</p>':''}
      ${!owner&&r.paymentDestination?`<details class="quota-destination"><summary>Come pagare al capogruppo</summary>${r.paymentDestination.iban?`<p>IBAN: <strong>${esc(r.paymentDestination.iban)}</strong><br>${esc(r.paymentDestination.accountHolder)}</p>`:''}${r.paymentDestination.paypalEmail?`<p>PayPal: ${esc(r.paymentDestination.paypalEmail)}</p>`:''}<p>Concorda la causale in chat e segnala il pagamento dopo averlo effettuato.</p></details>`:''}
      <div class="quota-actions"><a class="btn btn-secondary" href="#privata-${esc(r.id)}">${r.unreadMessages?`Chat · ${Number(r.unreadMessages)} nuovi`:'Apri chat'}</a>${owner&&r.status==='pending'?`<button class="btn btn-primary" data-action="accept" data-row="${i}">Accetta richiesta</button>`:''}${owner&&r.status==='reported'?`${r.receiptMessageId?`<button class="btn btn-secondary" data-action="receipt" data-row="${i}">Apri ricevuta</button>`:''}<button class="btn btn-primary" data-action="confirm" data-row="${i}">Conferma accredito</button>`:''}${canReport?`<button class="btn btn-primary" data-action="report" data-row="${i}">Ho pagato · invia ricevuta</button>`:''}</div><div data-area="${i}"></div></article>`;
    }).join('')||'<div class="empty-state"><h4>Il gruppo è pronto</h4><p>Condividi il link per invitare i primi membri. Le loro richieste appariranno qui.</p></div>'}</div><p role="status" class="quota-feedback"></p>`;
  if(!owner){
    const roster=document.createElement('section');roster.className='group-roster';
    roster.innerHTML=`<h3>Chi c’è nel gruppo</h3>${g.slotsInfo.slots.map(slot=>`<div class="roster-row"><span class="quota-avatar" aria-hidden="true">${esc((slot.assignedUser?.fullName||'?').slice(0,1))}</span><div><strong>${esc(slot.assignedUser?.fullName||(slot.isOccupied?'Posto occupato':'Posto disponibile'))}</strong><small>${slot.isOwnerSlot?'Capogruppo':`Posto ${slot.slotNumber}`}</small></div><span class="quota-label ${slot.isOccupied?'waiting':'paid'}">${slot.isOccupied?'Occupato':'Libero'}</span></div>`).join('')}`;
    panel.append(roster);
    roster.querySelectorAll('.roster-row').forEach((row,i)=>addPhoto(row,g.slotsInfo.slots[i].assignedUser?.avatarUrl));
  }
  panel.querySelectorAll('.quota-member').forEach((row,i)=>addPhoto(row,owner?list[i].memberAvatar:list[i].ownerAvatar));
  actionSummary(panel,list,user.id,esc);
  panel.querySelectorAll('.quota-member').forEach((card,i)=>simplifyQuota(card,list[i],user.id,card.querySelector('.quota-actions')));
  panel.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',async()=>{
    const r=list[Number(button.dataset.row)],area=panel.querySelector(`[data-area="${button.dataset.row}"]`),action=button.dataset.action;
    if(action==='report'){reportForm(area,r,{api,reload,esc,money});return;}
    button.disabled=true;
    try {
      if(action==='receipt'){await openReceipt(area,r,api);return;}
      if(action==='confirm'&&!window.confirm(`Confermi di aver ricevuto ${money(r.amountCents)} sul tuo conto da ${r.memberName}? La ricevuta da sola non conferma l’accredito.`))return;
      await api(`/api/manual/${encodeURIComponent(r.id)}/${action}`,{periodEnd:r.periodEnd||null});
      await reload();
    }catch(error){panel.querySelector('.quota-feedback').textContent=error.message;}finally{button.disabled=false;}
  }));
}

function addPhoto(row,url){
 if(!url)return;
 const holder=row.querySelector('.quota-avatar'),img=document.createElement('img');
 img.alt='';img.width=40;img.height=40;img.src=url;img.style.cssText='width:40px;height:40px;object-fit:cover;border-radius:50%';
 img.onload=()=>holder.replaceChildren(img);
}
