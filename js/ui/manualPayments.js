let chatTimer;
export async function renderManual({ container, route, user, api, shell, esc, money, date, button, link, bind, reload }) {
  clearInterval(chatTimer);
  const { requests } = await api('/api/manual');
  const labels = { pending: 'In attesa del capogruppo', accepted: 'Posto riservato: pagamento da inviare', reported: 'Pagamento dichiarato: attesa conferma', confirmed: 'Quota confermata dal capogruppo', canceled: 'Richiesta annullata' };
  const selected = route.startsWith('#privata-') ? requests.find(r => r.id === route.slice(9)) : null;
  const list = selected ? [selected] : requests;
  const { groups } = selected ? { groups: [] } : await api('/api/groups');
  shell(`<h2>${selected ? 'Chat privata e quota' : 'Richieste e rinnovi'}</h2>${groups.filter(g => g.ownerId === user.id).map(g => link(`#gruppo-${g.id}`, esc(g.customServiceName))).join('')}<p>Solo tu e il capogruppo potete leggere la conversazione. BYS non verifica gli accrediti. Per automatizzare un bonifico periodico, impostalo nella tua banca e concordalo con il capogruppo. I promemoria vengono pubblicati qui e nella sezione Notifiche, tre giorni prima e alla scadenza.</p>${link('#notifiche','Notifiche')}
    ${list.map((r, i) => {
      const owner = r.ownerId === user.id, d = r.paymentDestination;
      return `<article class="billing-card" style="margin-bottom:20px"><h3>${esc(r.groupName)} · posto ${r.slotNumber}</h3><p>${money(r.amountCents)} / mese · ${esc(labels[r.status])}</p>
      ${r.periodEnd ? `<p>Periodo confermato fino al ${date(r.periodEnd)}${Date.parse(r.periodEnd) <= Date.now() ? ' · Rinnovo in attesa' : ''}</p>` : ''}
      ${r.status === 'accepted' ? `<p>Posto riservato fino al ${esc(new Date(r.reservedUntil).toLocaleString('it-IT'))}. Non inviare denaro dopo la scadenza.</p>` : ''}
      ${d ? `<div style="background:#eff6ff;padding:16px;border-radius:12px"><strong>Paga direttamente al capogruppo</strong>${d.iban ? `<p>IBAN: ${esc(d.iban)}<br>Intestatario: ${esc(d.accountHolder)}</p>` : ''}${d.paypalEmail ? `<p>Email PayPal: ${esc(d.paypalEmail)}</p>` : ''}<p>Concordate la causale e le modalità in chat. Non è un pagamento a BYS.</p></div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:16px 0">${owner && r.status === 'pending' ? button(`accept${i}`, 'Accetta e riserva 48 ore') : ''}
      ${!owner && (r.status === 'accepted' || (r.status === 'confirmed' && Date.parse(r.periodEnd) - Date.now() <= 3 * 86400000)) ? button(`report${i}`, 'Ho pagato al capogruppo') : ''}
      ${owner && r.status === 'reported' ? button(`confirm${i}`, 'Confermo: quota accreditata') : ''}
      ${['pending','accepted'].includes(r.status) || (r.status === 'confirmed' && Date.parse(r.periodEnd) <= Date.now()) ? button(`cancel${i}`, 'Annulla partecipazione') : ''}
      ${link(`#privata-${r.id}`, 'Apri chat privata')}${link(`#gruppo-${r.groupId}`, 'Gruppo')}${r.periodEnd ? button(`access${i}`, 'Istruzioni di accesso') : ''}</div><pre id="accessText${i}" style="white-space:pre-wrap"></pre></article>`;
    }).join('') || '<p>Nessuna richiesta. Esplora i gruppi e richiedi un posto.</p>'}
    ${selected ? '<div id="privateMessages" aria-live="polite"></div><form id="privateForm"><label>Messaggio privato<textarea name="content" required maxlength="2000" style="width:100%"></textarea></label><button class="btn btn-primary">Invia</button></form>' : ''}`);
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
    feed.innerHTML = messages.map(m => `<p style="white-space:pre-wrap"><strong>${m.senderId === user.id ? 'Tu' : m.senderId ? 'Partecipante' : 'Sistema'}</strong>: ${esc(m.messageContent)}</p>`).join('');
    let loading = false;
    chatTimer = setInterval(async () => {
      if (!feed.isConnected) { clearInterval(chatTimer); return; }
      if (loading || document.hidden) return;
      loading = true;
      try {
        const result = await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`);
        if (feed.isConnected) feed.innerHTML = result.messages.map(m => `<p style="white-space:pre-wrap"><strong>${m.senderId === user.id ? 'Tu' : m.senderId ? 'Partecipante' : 'Sistema'}</strong>: ${esc(m.messageContent)}</p>`).join('');
      } catch { /* Keep the last messages visible during a connection interruption. */ }
      finally { loading = false; }
    }, 10000);
    container.querySelector('#privateForm').addEventListener('submit', async e => {
      e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
      try { await api(`/api/manual/${encodeURIComponent(selected.id)}/messages`, { content: new FormData(e.target).get('content') }); await reload(); }
      catch (err) { container.querySelector('#p2pMessage').textContent = err.message; btn.disabled = false; }
    });
  }
}
