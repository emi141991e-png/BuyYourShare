const LIVE_URL = 'https://buyyourshare-production.up.railway.app';

async function checkStatus() {
  const htmlRes = await fetch(LIVE_URL);
  const htmlText = await htmlRes.text();
  const isV27 = htmlText.includes('js/app.js?v=27');
  const isV26 = htmlText.includes('js/app.js?v=26');
  
  console.log('--- STATO ATTUALE RAILWAY ---');
  console.log('HTTP Status:', htmlRes.status);
  console.log('v27 Attivo:', isV27);
  console.log('v26 Attivo:', isV26);

  // Check login
  const loginRes = await fetch(`${LIVE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@buyyourshare.com', password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  console.log('Login Admin Status:', loginRes.status, 'success:', loginData.success);

  // Check admin endpoint
  const adminRes = await fetch(`${LIVE_URL}/api/admin/dashboard`, {
    headers: { 'Authorization': `Bearer ${loginData.token}` }
  });
  const contentType = adminRes.headers.get('content-type') || '';
  console.log('Admin Dashboard Status:', adminRes.status, 'Content-Type:', contentType);

  if (contentType.includes('application/json')) {
    const data = await adminRes.json();
    console.log('Admin Dashboard JSON Data:', data);
  } else {
    console.log('Admin Dashboard returned HTML (Deploy v27 in corso / ancora su v26)');
  }
}

checkStatus();
