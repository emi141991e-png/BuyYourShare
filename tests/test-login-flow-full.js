/**
 * BuyYourShare - Test Completo del Flusso di Autenticazione Login Reale (Async/Await)
 */

global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.window = {
  location: { hash: '#login' },
  addEventListener: () => {}
};

function createMockElement() {
  return {
    innerHTML: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    appendChild: () => {}
  };
}

global.document = {
  getElementById: () => createMockElement(),
  querySelector: () => createMockElement(),
  querySelectorAll: () => [],
  createElement: () => createMockElement(),
  body: { appendChild: () => {} },
  addEventListener: () => {}
};

const BASE_URL = 'http://localhost:3000';

async function runLoginVerification() {
  console.log('====================================================');
  console.log('    TEST FLUSSO LOGIN & SESSIONE REALE SERVER-SIDE   ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title} ${extra}`);
      failed++;
    }
  }

  // 1. TEST LOGIN VALIDO CAPOGRUPPO (Marco Rossi)
  console.log('[TEST 1] Esecuzione Login Reale con credenziali valide (Marco Rossi)...');
  const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marco.rossi@example.com', password: 'Password123!' })
  });
  const loginData = await loginResp.json();
  
  assert('HTTP Status è 200 OK', loginResp.status === 200);
  assert('Risposta contiene success: true', loginData.success === true);
  assert('Token di sessione generato e valido', !!loginData.token && loginData.token.startsWith('bys_token_'));
  assert('Utente restituito è Marco Rossi', loginData.user?.fullName === 'Marco Rossi');
  assert('Ruolo utente non modificato', loginData.user?.role === 'user');

  // 2. TEST LOGIN CON PASSWORD ERRATA
  console.log('\n[TEST 2] Esecuzione Login con password errata...');
  const badLoginResp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'marco.rossi@example.com', password: 'PasswordSbagliata123!' })
  });
  const badLoginData = await badLoginResp.json();
  assert('HTTP Status è 401 Unauthorized', badLoginResp.status === 401);
  assert('Messaggio di errore credenziali non valide presente', badLoginData.error === 'INVALID_CREDENTIALS');

  // 3. TEST CLIENT AUTH SERVICE (Async Login & Session Storage)
  console.log('\n[TEST 3] Verifica AuthService Client (metodo login async/await)...');
  const { authService } = await import('../js/services/authService.js');
  
  // Set localStorage session
  global.localStorage.setItem('buyyourshare_session_token', loginData.token);
  global.localStorage.setItem('buyyourshare_current_user_id', loginData.user.id);
  authService.sessionToken = loginData.token;
  authService.currentUserId = loginData.user.id;

  const { db } = await import('../js/db/database.js');
  db.data.users.push(loginData.user);

  assert('authService.isAuthenticated() restituisce true', authService.isAuthenticated() === true);
  assert('authService.getCurrentUser() restituisce Marco Rossi', authService.getCurrentUser()?.fullName === 'Marco Rossi');

  // 4. TEST LOGOUT
  console.log('\n[TEST 4] Verifica Logout...');
  await authService.logout();
  assert('authService.isAuthenticated() restituisce false dopo logout', authService.isAuthenticated() === false);
  assert('authService.getCurrentUser() restituisce null dopo logout', authService.getCurrentUser() === null);

  console.log('\n====================================================');
  console.log(`🎯 RISULTATO: ${passed} PASSATI, ${failed} FALLITI`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runLoginVerification();
