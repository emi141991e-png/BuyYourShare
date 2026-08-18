async function verifyLive() {
  const html = await (await fetch('https://buyyourshare-production.up.railway.app/')).text();
  const js = await (await fetch('https://buyyourshare-production.up.railway.app/js/app.js?v=23')).text();
  
  console.log('--- RAILWAY LIVE PRODUCTION VERIFICATION ---');
  console.log('1. Script v23 present in HTML:', html.includes('js/app.js?v=23'));
  console.log('2. Static userSwitcher in HTML:', html.includes('userSwitcher'));
  console.log('3. Accesso Rapido Demo in JS:', js.includes('Accesso Rapido Demo'));
  console.log('4. Default Password123 hint in JS:', js.includes('Default: Password123!'));
  console.log('5. btn-demo-quick in JS:', js.includes('btn-demo-quick'));
  console.log('6. User switcher dropdown in JS:', js.includes('id="userSwitcher"'));
  console.log('7. Empty login email default in JS:', js.includes('value="${escapeHtml(emailPrefill || \'\')}"'));
  console.log('8. Empty login password default in JS:', js.includes('id="loginPassword" class="form-input" placeholder="••••••••" value=""'));
}

verifyLive();
