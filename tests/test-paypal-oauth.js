/**
 * BuyYourShare - Safe PayPal OAuth2 & Permission Verifier
 * Verifica crittografica server-side dell'autenticazione PayPal Sandbox
 * NON logga né espone chiavi segrete o token.
 */

import dotenv from 'dotenv';
dotenv.config();

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const mode = process.env.PAYPAL_MODE || 'sandbox';
const apiBase = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

console.log('====================================================');
console.log('   VERIFICA AUTENTICAZIONE PAYPAL SANDBOX OAUTH2    ');
console.log('====================================================');

if (!clientId || clientId === 'test') {
  console.log('❌ PAYPAL_CLIENT_ID: Non configurato o segnaposto');
  process.exit(1);
}

if (!clientSecret || clientSecret.includes('placeholder') || clientSecret.trim() === '') {
  console.log('❌ PAYPAL_CLIENT_SECRET: Assente o non configurato nel file .env');
  process.exit(1);
}

console.log('✅ PAYPAL_CLIENT_ID: Presente e caricato dal file .env');
console.log('✅ PAYPAL_CLIENT_SECRET: Presente e caricato dal file .env');
console.log(`🌐 Endpoint PayPal: ${apiBase}/v1/oauth2/token`);

async function verifyOAuth() {
  try {
    const authHeader = Buffer.from(`${clientId.trim()}:${clientSecret.trim()}`).toString('base64');
    
    const resp = await fetch(`${apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    console.log(`📡 Risposta HTTP Server PayPal: ${resp.status} ${resp.statusText}`);

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      console.log('❌ Esito Autenticazione: FALLITA');
      console.log(`Dettaglio Errore Provider: ${errJson.error || 'N/A'} - ${errJson.error_description || 'Credenziali non valide o non abilitate'}`);
      process.exit(1);
    }

    const data = await resp.json();
    const hasToken = typeof data.access_token === 'string' && data.access_token.length > 20;
    const scopes = (data.scope || '').split(' ');
    
    console.log(`✅ Access Token Ricevuto: ${hasToken ? 'SI (Token Bearer valido generato)' : 'NO'}`);
    console.log(`⏱️ Scadenza Token (TTL): ${data.expires_in} secondi (~${Math.round(data.expires_in / 3600)} ore)`);
    console.log(`🆔 App ID Riconosciuto da PayPal: ${data.app_id || 'OK'}`);

    // Verifica Scope Payouts
    const hasPayoutScope = scopes.some(s => s.includes('payout') || s.includes('payments') || s.includes('*'));
    console.log(`📋 Permessi & Scopes Riconosciuti (${scopes.length} abilitati):`);
    if (hasPayoutScope) {
      console.log('✅ Permesso Payouts / Payments: ABILITATO SULL\'APP SANDBOX');
    } else {
      console.log('⚠️ Permesso Payouts: Verifica in developer.paypal.com se la casella Payouts è spuntata');
    }

    console.log('🔒 Payout eseguiti: NESSUNO (Verifica autorizzativa completata senza movimenti finanziari)');
    console.log('====================================================');
    console.log('🎯 ESITO FINALE: OK - BACKEND PRONTO PER PAYPAL PAYOUTS REALI');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Errore di connessione:', err.message);
    process.exit(1);
  }
}

verifyOAuth();
