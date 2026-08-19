async function check() {
  const r = await fetch('https://buyyourshare-production.up.railway.app/');
  const t = await r.text();
  console.log('Railway live index.html contains v=27:', t.includes('js/app.js?v=27'));
}
check();
