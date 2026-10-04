export function needsAction(r,userId,now=Date.now()) {
 if(r.ownerId===userId)return ['pending','reported'].includes(r.status)&&!['CLOSED','DRAFT'].includes(r.groupStatus);
 return !r.leaveAtPeriodEnd&&(r.status==='accepted'&&Date.parse(r.reservedUntil)>now||r.status==='confirmed'&&Date.parse(r.periodEnd)-now<=3*86400000);
}
export function simplifyQuota(card,r,userId,actions){
 const owner=r.ownerId===userId;
 const primary=owner?actions.querySelector('[id^=confirm],[data-action=confirm]')||actions.querySelector('[id^=accept],[data-action=accept]'):actions.querySelector('[id^=report],[data-action=report]');
 const chat=actions.querySelector('a[href^="#privata-"]');
 const main=primary||chat;
 const more=document.createElement('details');more.className='quota-more';const summary=document.createElement('summary');summary.textContent='Gestisci';more.append(summary);
 for(const child of [...actions.children])if(child!==main)more.append(child);
 if(main){main.classList.remove('btn-secondary');main.classList.add('btn-primary');actions.prepend(main);}
 if(more.children.length>1)actions.append(more);
 if(!owner&&r.status==='reported'){const note=document.createElement('p');note.textContent='✓ Pagamento segnalato · attendi verifica';note.className='quota-caption';actions.before(note);}
 if(!owner&&r.paymentDestination){
 const d=r.paymentDestination;
 for(const [label,value] of [['Copia IBAN',d.iban],['Copia dati del bonifico',d.iban?[d.accountHolder,d.iban].filter(Boolean).join('\n'):null],['Copia email PayPal',d.paypalEmail]]){
 if(!value)continue;const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent=label;
 const feedback=document.createElement('span');feedback.setAttribute('role','status');
 b.onclick=async()=>{try{await navigator.clipboard.writeText(value);feedback.textContent=' Copiato ✓';}catch{feedback.textContent=' Copia manualmente il dato mostrato sopra.';}};
 const destination=card.querySelector('.quota-destination')||card.querySelector('[data-payment-details]');(destination||card).append(b,feedback);
 }
 }
}
export function actionSummary(container,requests,userId,esc){
 const todo=requests.filter(r=>needsAction(r,userId));const box=document.createElement('section');box.className='billing-card quota-todo';
 box.innerHTML=`<h3>${todo.length?'Da fare · '+todo.length:'✓ Tutto in ordine'}</h3>${todo.length?todo.map(r=>`<a class="btn btn-secondary" href="#privata-${esc(r.id)}">${esc(r.groupName||'Gruppo')} · ${r.ownerId===userId?(r.status==='reported'?'Verifica quota':'Accetta richiesta'):'Quota da pagare o rinnovare'} →</a>`).join(''):'<p>Nessuna quota o richiesta richiede un tuo intervento.</p>'}`;
 container.prepend(box);
}
