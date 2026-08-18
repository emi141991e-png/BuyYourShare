// Mock Browser Globals for Node.js Syntax Verification
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; }
};

global.window = {
  location: { hash: '#home' },
  addEventListener: () => {}
};

global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, classList: { add: () => {}, remove: () => {} } }),
  body: { appendChild: () => {} },
  addEventListener: () => {}
};

const files = [
  '../js/engine/MoneyEngine.js',
  '../js/engine/FeeEngine.js',
  '../js/engine/DateEngine.js',
  '../js/db/seed.js',
  '../js/db/database.js',
  '../js/services/authService.js',
  '../js/services/stripeCheckoutService.js',
  '../js/services/stripeConnectService.js',
  '../js/services/financialAuditService.js',
  '../js/app.js'
];

async function check() {
  let allPass = true;
  for (const f of files) {
    try {
      await import(f);
      console.log('✅ ' + f);
    } catch (err) {
      console.error('❌ ' + f + ':', err);
      allPass = false;
    }
  }
  if (allPass) {
    console.log('\n🎯 ALL FRONTEND ES MODULES LOADED AND PARSED WITH 0 SYNTAX ERRORS!');
  } else {
    process.exit(1);
  }
}

check();
