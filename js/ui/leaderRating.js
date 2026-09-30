export function leaderProfile(g,esc){
 const r=g.owner?.rating;
 return `<section class="leader-profile"><div class="leader-profile-heading">${g.owner?.avatarUrl?`<img src="${esc(g.owner.avatarUrl)}" alt="Foto del capogruppo" width="48" height="48" loading="lazy">`:''}<div><h4>${esc(g.owner?.fullName||'Capogruppo')}</h4><span class="leader-rating-summary">${r?.count?`★ ${esc(r.average)} / 5 · ${r.count} ${r.count===1?'valutazione':'valutazioni'}`:'Nessuna valutazione ancora'}</span></div></div><p>Valutazioni dei membri con almeno una quota confermata. Una valutazione per persona e capogruppo.</p><div id="leaderRatingForm"></div></section>`;
}
export async function mountLeaderRating(container,g,user,api){
 const area=container.querySelector('#leaderRatingForm');if(!area||!user||user.id===g.ownerId)return;
 const path=`/api/p2p/leaders/${encodeURIComponent(g.ownerId)}/rating`;
 try{
 const state=await api(path);if(!area.isConnected)return;
 if(!state.eligible){area.textContent='Potrai valutare il capogruppo dopo la conferma della tua prima quota.';return;}
 area.innerHTML='<form><fieldset><legend>La tua esperienza con il capogruppo</legend><div class="rating-stars"></div></fieldset><div class="rating-actions"><button class="btn btn-primary" type="submit">Salva valutazione</button><button class="btn btn-secondary" type="button">Rimuovi il mio voto</button></div><p role="status"></p></form>';
 const stars=area.querySelector('.rating-stars'),form=area.querySelector('form'),status=area.querySelector('[role="status"]');let selected=state.mine;
 for(let i=1;i<=5;i++){const label=document.createElement('label'),radio=document.createElement('input'),symbol=document.createElement('span');radio.type='radio';radio.name='stars';radio.value=String(i);radio.required=true;radio.checked=selected===i;radio.setAttribute('aria-label',`${i} ${i===1?'stella':'stelle'}`);symbol.textContent='★';label.append(radio,symbol);stars.append(label);radio.onchange=()=>{selected=i;paint();};}
 function paint(){[...stars.children].forEach((el,i)=>el.classList.toggle('selected',i<selected));}paint();
 const remove=area.querySelector('button[type="button"]');remove.hidden=!state.mine;
 async function save(value){const buttons=[...area.querySelectorAll('button,input')];buttons.forEach(b=>b.disabled=true);status.textContent='Salvataggio…';try{const result=await api(path,{stars:value});selected=result.mine;paint();for(const radio of stars.querySelectorAll('input'))radio.checked=Number(radio.value)===selected;remove.hidden=!result.mine;container.querySelector('.leader-rating-summary').textContent=result.count?`★ ${result.average} / 5 · ${result.count} valutazioni`:'Nessuna valutazione ancora';status.textContent=value===null?'Valutazione rimossa.':'Valutazione salvata. Grazie per il tuo contributo!';}catch(e){status.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
 form.onsubmit=e=>{e.preventDefault();if(selected)void save(selected);};remove.onclick=()=>save(null);
 }catch{area.textContent='Valutazioni temporaneamente non disponibili. Riapri il gruppo per riprovare.';}
}
