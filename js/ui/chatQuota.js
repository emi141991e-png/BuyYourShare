export function chatQuotaState(r, userId, now = Date.now()) {
  const owner = r.ownerId === userId;
  if (!owner && r.userId !== userId) return { text: 'Quota non disponibile.' };
  if (r.status === 'reported') return owner
    ? { action: 'confirm', label: 'Pagamento ricevuto', text: 'Il membro segnala di aver pagato. Conferma solo dopo aver verificato l’accredito sul tuo conto.' }
    : { text: '✓ Hai segnalato il pagamento. Attendi la conferma del capogruppo: non pagare di nuovo.' };
  if (r.status === 'accepted') {
    if (Date.parse(r.reservedUntil) <= now) return { text: 'Prenotazione scaduta. Se hai già pagato, scrivilo qui e contatta BYS per recuperare il posto. Non pagare di nuovo.' };
    return owner ? { text: 'Il posto è riservato. Dopo il versamento, il membro deve premere «Ho pagato» qui nella chat.' }
      : { action: 'report', label: 'Ho pagato', text: 'Hai già inviato la quota al capogruppo? Segnalalo qui. Questo pulsante non effettua un pagamento.' };
  }
  if (r.status === 'confirmed') {
    if (!owner && !r.leaveAtPeriodEnd && Date.parse(r.periodEnd) - now <= 3 * 86400000)
      return { action: 'report', label: 'Ho pagato', text: 'Rinnovo della quota: premi solo dopo aver inviato il nuovo pagamento al capogruppo.' };
    return { text: r.leaveAtPeriodEnd ? '✓ Quota confermata. Uscita prevista alla fine del periodo pagato.' : '✓ Pagamento ricevuto e confermato dal capogruppo.' };
  }
  return { text: r.status === 'pending' ? 'Attendi che il capogruppo accetti la richiesta prima di pagare.' : 'Partecipazione annullata. Se hai già pagato, contatta BYS: non inviare altro denaro.' };
}

export function mountChatQuota(area, initial, { userId, api, esc, money, date, onChanged }) {
  let current = initial, busy = false, generation = 0;
  const draw = () => {
    const state = chatQuotaState(current, userId);
    area.innerHTML = `<div class="chat-quota-heading"><strong>Quota del gruppo · ${esc(money(current.amountCents))}</strong><span>Pagamento diretto al capogruppo</span></div><p>${esc(state.text)}</p>${current.periodEnd ? `<p>Periodo confermato fino al <strong>${esc(date(current.periodEnd))}</strong></p>` : ''}${state.action ? `<button type="button" class="btn btn-primary" data-quota-action>${state.label}</button>` : ''}<p role="status" aria-live="polite" class="chat-quota-feedback"></p>`;
    const button = area.querySelector('[data-quota-action]');
    if (!button) return;
    button.onclick = async () => {
      if (busy) return;
      if (!window.confirm(state.action === 'confirm'
        ? 'Hai verificato il pagamento sul tuo conto? Confermando registri un mese di quota ricevuta.'
        : 'Confermi di aver già inviato questa quota al capogruppo? Non verrà eseguito alcun addebito.')) return;
      busy = true; generation++; button.disabled = true;
      const feedback = area.querySelector('[role="status"]');
      feedback.textContent = 'Salvataggio…';
      try {
        await api(`/api/manual/${encodeURIComponent(current.id)}/${state.action}`, { periodEnd: current.periodEnd || null });
        const result = await api('/api/manual');
        const next = result.requests.find(r => r.id === current.id);
        if (next) current = next;
        draw();
        await onChanged();
      } catch (error) {
        if (feedback.isConnected) feedback.textContent = (error.message || 'Connessione interrotta.') + ' Aggiorno lo stato automaticamente: non ripetere il pagamento.';
      } finally { busy = false; if (button.isConnected) button.disabled = false; }
    };
  };
  draw();
  return async () => {
    if (busy || !area.isConnected) return;
    const version = generation;
    const result = await api('/api/manual');
    if (busy || version !== generation || !area.isConnected) return;
    const next = result.requests.find(r => r.id === current.id);
    if (next && JSON.stringify(next) !== JSON.stringify(current)) { current = next; draw(); }
  };
}
