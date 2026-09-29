export async function renderBankAccess(target, api, esc, reload) {
  try {
    const b = await api('/api/p2p/bank');
    if (!target.isConnected) return;
    const pending = b.payments.some(p => p.status === 'reported');
    target.innerHTML = `<h3>Accedi con bonifico · 0,99 €/mese</h3><p>Il tuo codice personale: <strong>${esc(b.code)}</strong></p><p>Conservalo o ritrovalo qui quando vuoi. Non è una password.</p>${b.blocked ? '<p>Risulta un pagamento automatico da verificare. Contatta BYS prima di inviare un secondo pagamento.</p>' : `<dl><dt>Intestatario</dt><dd>${esc(b.accountHolder)}</dd><dt>IBAN</dt><dd style="overflow-wrap:anywhere">${esc(b.iban)}</dd><dt>Causale</dt><dd>${esc(b.reference)}</dd></dl><button class="btn btn-secondary" data-copy>Copia dati del bonifico</button><p>Per rinnovare comodamente, imposta nella tua banca un bonifico periodico mensile da 0,99 € con questa causale. BYS non addebita il conto: l’accesso viene rinnovato dopo la verifica dell’incasso da parte dell’amministratore.</p><p>${pending ? 'Bonifico segnalato: in attesa di verifica. Non inviarlo nuovamente.' : 'Hai già inviato il bonifico? Segnalalo per consentire la verifica.'}</p>${pending ? '' : '<button class="btn btn-primary" data-report>Ho effettuato il bonifico</button>'}`}<p><a href="#notifiche">Attiva le notifiche push e consulta i promemoria →</a></p><p role="status" data-status></p>`;
    const status = target.querySelector('[data-status]');
    target.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`${b.accountHolder}\n${b.iban}\n0,99 EUR\n${b.reference}`); status.textContent = 'Dati copiati.'; }
      catch { status.textContent = 'Seleziona e copia i dati mostrati sopra.'; }
    });
    target.querySelector('[data-report]')?.addEventListener('click', async e => {
      if (!window.confirm('Confermi di aver inviato 0,99 € al conto BYS con la tua causale personale?')) return;
      e.target.disabled = true;
      try { await api('/api/p2p/bank/report', {}); await reload(); }
      catch (err) { status.textContent = err.message; e.target.disabled = false; }
    });
  } catch (e) { target.textContent = e.message; }
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
