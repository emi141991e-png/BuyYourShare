const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function publicShareGroup(group) {
  return !!group && ['PUBLISHED','FULL','active','available'].includes(group.status) && group.groupType !== 'private';
}
// Explicitly allowlisted fields: never serialize the group or its payment/chat data.
export function groupSharePage(group, origin) {
  if (!publicShareGroup(group)) return null;
  const source = new URL(origin);
  const base = source.hostname === 'buyyourshare-production.up.railway.app' ? 'https://marketplace.buyyourshare.it' : source.origin;
  const title = `${String(group.customServiceName || 'Abbonamento condiviso').slice(0,100)} · Gruppo su BuyYourShare`;
  const description = `${String(group.planName || 'Condivisione tra utenti').slice(0,100)}. Scopri disponibilità e condizioni. Quote pagate direttamente al capogruppo; accesso BYS separato a 0,99 €/mese.`;
  const url = `${base}/gruppi/${encodeURIComponent(group.id)}`;
  const image = `${base}/push-icon-512.png`;
  const target = `${base}/#gruppo-${encodeURIComponent(group.id)}`;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(url)}"><meta property="og:type" content="website"><meta property="og:site_name" content="BuyYourShare"><meta property="og:locale" content="it_IT"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:alt" content="BuyYourShare Marketplace"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><style>body{margin:0;background:#f3f7fc;color:#182641;font:17px/1.6 system-ui}main{max-width:620px;margin:8vh auto;padding:32px;background:white;border:1px solid #dce5ef;border-radius:28px}img{width:96px;height:96px;border-radius:24px}h1{line-height:1.2}a{color:#234abd}.cta{display:inline-block;background:#4056e8;color:white;padding:14px 24px;border-radius:14px;text-decoration:none;font-weight:700}small{display:block;margin:24px 0;color:#52637d}@media(max-width:700px){main{margin:24px 16px;padding:24px}}</style></head><body><main><img src="${esc(image)}" alt="BuyYourShare"><p>MARKETPLACE · CONDIVISIONE TRA UTENTI</p><h1>${esc(title)}</h1><p>${esc(description)}</p><a class="cta" href="${esc(target)}">Vedi il gruppo e i posti disponibili →</a><small>La disponibilità può cambiare. Concorda la quota con il capogruppo nella chat privata prima di pagare.</small><a href="https://buyyourshare.it/">Torna a BuyYourShare</a></main></body></html>`;
}
