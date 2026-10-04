export async function prepareReceipt(file) {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (file.size > (pdf ? 5 : 20) * 1024 * 1024) throw new Error(pdf ? 'Il PDF supera 5 MB.' : 'La foto supera 20 MB.');
  if (pdf) return {data: await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve('data:application/pdf;base64,' + String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Impossibile leggere il PDF. Riprova.'));
    reader.readAsDataURL(file);
  })};
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const ratio = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * ratio)); canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [.85, .7, .55, .4]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length < 2700000) return {data};
    }
    throw new Error('Immagine troppo grande. Scegli uno screenshot più piccolo.');
  } catch (error) {
    throw new Error(error.message?.includes('grande') ? error.message : 'Foto non leggibile. Usa JPG, PNG, WebP oppure il PDF della banca.');
  } finally { URL.revokeObjectURL(url); }
}

export function reportForm(area, r, {api, reload, esc, money}) {
  area.innerHTML = `<form class="quota-report"><h4>Segnala il pagamento di ${money(r.amountCents)}</h4><p>Invia la ricevuta al capogruppo. I promemoria si fermeranno mentre verifica l’accredito.</p><label>Ricevuta facoltativa · foto o PDF<input type="file" accept="image/*,.pdf,application/pdf"></label><p>PDF fino a 5 MB; foto fino a 20 MB, ridotte automaticamente. Solo tu e il capogruppo potete aprire l’allegato.</p><label><input type="checkbox" required> Ho già inviato ${money(r.amountCents)} al capogruppo di ${esc(r.groupName)}.</label><div><button class="btn btn-primary" type="submit">Invia segnalazione</button> <button class="btn btn-secondary" type="button">Annulla</button></div><p role="status"></p></form>`;
  const form = area.querySelector('form'), input = form.querySelector('[type=file]'), status = form.querySelector('[role=status]');
  form.querySelector('[type=button]').onclick = () => area.replaceChildren();
  form.onsubmit = async e => {
    e.preventDefault();
    const controls = [...form.querySelectorAll('input,button')]; controls.forEach(c => c.disabled = true);
    try {
      status.textContent = 'Invio in corso…';
      const attachment = input.files[0] ? await prepareReceipt(input.files[0]) : null;
      await api(`/api/manual/${encodeURIComponent(r.id)}/report`, {periodEnd: r.periodEnd || null, attachment});
      status.textContent = 'Pagamento segnalato. Il capogruppo è stato avvisato.';
      await reload();
    } catch (error) { status.textContent = (error.message || 'Invio non riuscito.') + ' Puoi riprovare senza effettuare un altro pagamento.'; controls.forEach(c => c.disabled = false); }
  };
  form.scrollIntoView({block:'nearest', behavior:'smooth'});
}

export async function openReceipt(area, r, api) {
  area.textContent = 'Caricamento ricevuta…';
  try {
    const {data} = await api(`/api/manual/${encodeURIComponent(r.id)}/attachments/${encodeURIComponent(r.receiptMessageId)}`);
    if (data.startsWith('data:application/pdf;base64,')) {
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0))], {type:'application/pdf'}));
      const a = document.createElement('a'); a.href = url; a.download = 'ricevuta.pdf'; a.textContent = 'Scarica ricevuta PDF'; a.className = 'btn btn-secondary'; area.replaceChildren(a);
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 60000);
    } else {
      const img = document.createElement('img'); img.src = data; img.alt = 'Ricevuta della quota'; img.style.cssText = 'max-width:100%;max-height:550px;object-fit:contain'; area.replaceChildren(img);
    }
  } catch (error) { area.textContent = error.message || 'Impossibile aprire la ricevuta. Riprova.'; }
}
