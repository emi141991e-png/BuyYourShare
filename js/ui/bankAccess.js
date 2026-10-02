import { accessMoney } from '../config/accessPlans.js';
export async function renderBankAccess(target, api, esc, reload) {
  try {
    const b = await api('/api/p2p/bank'); if (!target.isConnected) return;
    const pending = b.payments.find(p=>p.status==='reported');
    target.classList.add('bys-bank-card');
    target.innerHTML = `<span class="bys-bank-badge">PAGAMENTO CON BONIFICO</span><h3>Preferisci il bonifico? Ti seguiamo noi.</h3><p class="bys-bank-intro">Scegli il piano, effettua il bonifico con la causale indicata e comunicaci il pagamento su WhatsApp.</p><label>Scegli la durata<select data-plan ${pending?'disabled':''}>${b.plans.map(p=>`<option value="${p.code}" ${pending && (pending.planCode||'MONTHLY')===p.code?'selected':''}>${p.label} · ${accessMoney(p.amountCents)} / ${p.period}</option>`).join('')}</select></label><p>Codice personale: <strong>${esc(b.code)}</strong></p><p>Conservalo: identifica il tuo pagamento, non è una password.</p>${b.blocked?'<p>Pagamento automatico da verificare. Contatta BYS prima di pagare di nuovo.</p>':`<dl><dt>Intestatario</dt><dd>${esc(b.accountHolder)}</dd><dt>IBAN</dt><dd style="overflow-wrap:anywhere">${esc(b.iban)}</dd><dt>Importo</dt><dd data-amount></dd><dt>Causale</dt><dd data-reference></dd></dl><button type="button" class="btn btn-secondary" data-copy>Copia dati del bonifico</button><p>Puoi impostare un bonifico periodico nella tua banca per l’importo e la durata scelti. L’accesso si attiva dopo la verifica dell’accredito.</p>${pending?'<p>Bonifico già segnalato: attendi la verifica, senza inviarlo nuovamente.</p>':'<button class="btn btn-primary" data-report>Ho effettuato il bonifico</button>'}`}<section class="bys-bank-whatsapp"><h4>Dopo il bonifico, contatta BYS su WhatsApp</h4><p>Premi “Ho effettuato il bonifico” per registrare la segnalazione, poi scrivici al <strong>+39 329 387 6062</strong> indicando il tuo codice personale, il piano scelto e la data del pagamento. Puoi allegare la ricevuta, oscurando i dati non necessari.</p><a data-whatsapp target="_blank" rel="noopener noreferrer">Comunica il bonifico su WhatsApp ↗</a><small>Il messaggio sarà precompilato: controllalo e invialo tu. L’accesso si attiva dopo la verifica dell’accredito da parte di BYS; il messaggio non costituisce conferma dell’incasso.</small></section><p><a class="bys-pay-reminders" href="#notifiche"><span aria-hidden="true">🔔</span><span>Attiva notifiche e promemoria<small>Ricevi gli avvisi per rinnovi e messaggi della chat</small></span><span aria-hidden="true">→</span></a></p><p role="status" data-status></p>`;
    const select=target.querySelector('[data-plan]'), status=target.querySelector('[data-status]');
    const plan=()=>b.plans.find(p=>p.code===select.value);
    const reference=()=>`${b.reference} - ${plan().label}`;
    const update=()=>{target.querySelector('[data-whatsapp]').href='https://wa.me/393293876062?text='+encodeURIComponent(`Buongiorno BYS, desidero comunicare il bonifico per il mio accesso. Codice personale: ${b.code}. Piano: ${plan().label} (${plan().period}). Importo: ${accessMoney(plan().amountCents)}. Data del bonifico: [inserire data]. Grazie.`);if(target.querySelector('[data-amount]')){target.querySelector('[data-amount]').textContent=accessMoney(plan().amountCents);target.querySelector('[data-reference]').textContent=reference();}};
    select.onchange=update; update();
    target.querySelector('[data-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(`${b.accountHolder}\n${b.iban}\n${accessMoney(plan().amountCents)}\n${reference()}`);status.textContent='Dati copiati.';}catch{status.textContent='Puoi copiare i dati mostrati sopra.';}});
    target.querySelector('[data-report]')?.addEventListener('click',async e=>{if(!window.confirm(`Hai inviato ${accessMoney(plan().amountCents)} per il piano ${plan().label} al conto BYS?`))return;e.target.disabled=true;select.disabled=true;try{await api('/api/p2p/bank/report',{planCode:plan().code});await reload();}catch(err){status.textContent=err.message;e.target.disabled=false;select.disabled=false;}});
  } catch(e){target.textContent=e.message;}
}

export async function renderAdminBank(target, token, esc) {
  const request = async (path, body) => {
    const r = await fetch('/api/admin/bank-payments' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Operazione non riuscita'); return d;
  };
  try {
    const { payments } = await request('');
    target.innerHTML = `<h3>Bonifici abbonamento BYS</h3><label>Cerca codice utente o nome<input type="search" data-search placeholder="BYS-…"></label><p>Conferma solo dopo aver verificato un accredito di 0,99 € sul conto BYS. Il riferimento univoco bancario impedisce di registrare due volte lo stesso bonifico.</p><div data-results>${payments.map(p => `<article data-payment data-code="${esc((p.code + ' ' + p.name).toLowerCase())}" class="billing-notice"><strong>${esc(p.name)} · ${esc(p.code)}</strong><p>${p.status === 'confirmed' ? 'Confermato · accesso fino al ' + esc(new Date(p.periodEnd).toLocaleDateString('it-IT')) : 'Incasso da verificare · 0,99 €'}</p>${p.status === 'reported' ? `<form data-id="${esc(p.id)}"><label>Riferimento del movimento bancario (TRN/ID)<input name="reference" required minlength="6" maxlength="120"></label><button class="btn btn-primary">Conferma incasso e attiva un mese</button></form>` : ''}</article>`).join('') || '<p>Nessun bonifico segnalato.</p>'}</div><p role="status" data-status></p>`;
    const codeForm = document.createElement('form');
    codeForm.innerHTML = '<label>Registra una segnalazione con codice utente<input name="code" required placeholder="BYS-…"></label><button class="btn btn-secondary">Trova utente e prepara verifica</button>';
    target.prepend(codeForm);
    codeForm.onsubmit = async e => { e.preventDefault(); const btn = codeForm.querySelector('button'); btn.disabled = true;
      try { await request('/report-by-code', { code: new FormData(codeForm).get('code') }); await renderAdminBank(target, token, esc); }
      catch (err) { target.querySelector('[data-status]').textContent = err.message; btn.disabled = false; }
    };
    target.querySelector('[data-search]').oninput = e => target.querySelectorAll('[data-payment]').forEach(el => { el.hidden = !el.dataset.code.includes(e.target.value.trim().toLowerCase()); });
    target.querySelectorAll('form[data-id]').forEach(form => form.onsubmit = async e => {
      e.preventDefault(); if (!window.confirm('Hai verificato l’accredito di 0,99 € e la corrispondenza del codice utente?')) return;
      const button = form.querySelector('button'); button.disabled = true;
      try { await request('/' + encodeURIComponent(form.dataset.id) + '/confirm', { reference: new FormData(form).get('reference') }); await renderAdminBank(target, token, esc); }
      catch (err) { target.querySelector('[data-status]').textContent = err.message; button.disabled = false; }
    });
  } catch (e) { target.textContent = e.message; }
}
