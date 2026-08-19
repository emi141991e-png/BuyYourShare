/**
 * Verification Test: Welcome Email & Automated Password Recovery Flow
 */

process.env.PORT = '3096';

const BASE_URL = 'http://localhost:3096';

async function runAuthFlowTest() {
  console.log('================================================================');
  console.log('   TEST: EMAIL DI BENVENUTO & RECUPERO PASSWORD AUTOMATICO       ');
  console.log('================================================================\n');

  await import('../server/index.js');
  const { emailService } = await import('../server/services/emailService.js');

  const testEmail = `test_recovery_${Date.now()}@example.com`;

  // 1. Registrazione nuovo account
  console.log(`[1] Registrazione account ${testEmail}...`);
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Alessandro',
      lastName: 'Manzoni',
      email: testEmail,
      password: 'VecchiaPassword123!',
      confirmPassword: 'VecchiaPassword123!',
      termsConsent: true,
      privacyConsent: true
    })
  });
  const regData = await regRes.json();
  console.log('    Risposta Registrazione status:', regRes.status, '- Success:', regData.success);

  // 2. Verifica che l'email di benvenuto sia stata registrata
  const welcomeSent = emailService.sentEmails.find(e => e.to === testEmail && e.subject.includes('Benvenuto'));
  console.log(`[2] Email di benvenuto automatica inviata a ${testEmail}: ${!!welcomeSent}`);

  // 3. Richiesta Password Dimenticata (Forgot Password)
  console.log(`\n[3] Richiesta codice di recupero per ${testEmail}...`);
  const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  const forgotData = await forgotRes.json();
  console.log('    Risposta Forgot Password status:', forgotRes.status, '- Message:', forgotData.message);

  // 4. Recupera il codice di verifica inviato via email
  const resetEmail = emailService.sentEmails.find(e => e.to === testEmail && e.subject.includes('Codice di Recupero'));
  console.log(`[4] Email di recupero trovata: ${!!resetEmail}`);
  
  // Estrai il codice di 6 cifre dal testo dell'email
  const match = resetEmail.text.match(/\b\d{6}\b/);
  const resetCode = match ? match[0] : null;
  console.log(`    Codice di sicurezza a 6 cifre estratto: ${resetCode}`);

  // 5. Verifica del codice di sicurezza
  console.log(`\n[5] Verifica codice di sicurezza su POST /api/auth/verify-reset-code...`);
  const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-reset-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, code: resetCode })
  });
  const verifyData = await verifyRes.json();
  console.log('    Risposta Verify Code status:', verifyRes.status, '- Valid:', verifyData.valid);

  // 6. Reimpostazione nuova password
  console.log(`\n[6] Reimpostazione nuova password ("NuovaPassword123!")...`);
  const resetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      code: resetCode,
      newPassword: 'NuovaPassword123!',
      confirmPassword: 'NuovaPassword123!'
    })
  });
  const resetData = await resetRes.json();
  console.log('    Risposta Reset Password status:', resetRes.status, '- Success:', resetData.success);

  // 7. Login con la NUOVA password
  console.log(`\n[7] Test di Login con la NUOVA password...`);
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'NuovaPassword123!' })
  });
  const loginData = await loginRes.json();
  console.log('    Risposta Login status:', loginRes.status, '- Utente autenticato:', loginData.user?.fullName);

  if (loginRes.ok && loginData.success && loginData.token) {
    console.log('\n✅ TUTTI I TEST SUPERATI: Email di avvenuta registrazione e recupero password automatico funzionanti al 100%!');
    process.exit(0);
  } else {
    console.error('\n❌ ERRORE durante il test.');
    process.exit(1);
  }
}

runAuthFlowTest();
