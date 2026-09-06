import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';
import { emailService } from '../services/emailService.js';
import { BysSsoError, exchangeBysSsoTicket } from '../services/bysSsoService.js';
import { createSecureToken, hashPassword, hashToken, tokenMatches, verifyPassword } from '../services/passwordSecurity.js';

export const authRouter = express.Router();

function sanitizeUser(user) {
  if (!user) return null;
  const { password, passwordHash, resetPasswordCode, resetPasswordTokenHash, resetPasswordExpires, ...safe } = user;
  return safe;
}

const authAttempts = new Map();
function limitSensitiveAuth(req, res, next) {
  const key = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const previous = authAttempts.get(key);
  const entry = !previous || previous.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : previous;
  entry.count += 1;
  authAttempts.set(key, entry);
  if (entry.count > 30) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS', message: 'Troppi tentativi. Riprova più tardi.' });
  }
  next();
}

authRouter.use((req, res, next) => {
  if (req.method === 'POST' && req.path !== '/bys/callback' && req.path !== '/logout') {
    return limitSensitiveAuth(req, res, next);
  }
  next();
});

function renderSsoCompletion(session, user) {
  const safeState = JSON.stringify({
    token: session.token,
    user: sanitizeUser(user)
  }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>Accesso completato</title></head><body>
  <p>Accesso al Marketplace completato. Reindirizzamento in corso…</p><script>
  const state=${safeState};
  localStorage.setItem('buyyourshare_session_token',state.token);
  localStorage.setItem('buyyourshare_current_user_id',state.user.id);
  localStorage.setItem('buyyourshare_cached_email',state.user.email);
  localStorage.setItem('buyyourshare_cached_name',state.user.fullName||state.user.name||'Utente');
  localStorage.setItem('buyyourshare_last_activity_ts',Date.now().toString());
  location.replace('/#home');</script></body></html>`;
}

// BYS 2.0 is the identity authority. The signed ticket is POSTed so it never appears in a URL.
authRouter.post('/bys/callback', async (req, res) => {
  try {
    const { session, user } = await exchangeBysSsoTicket(req.body?.ticket, dataRepository);
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.type('html').send(renderSsoCompletion(session, user));
  } catch (error) {
    const status = error instanceof BysSsoError && error.code !== 'SSO_NOT_CONFIGURED' ? 401 : 503;
    console.warn('[BYS SSO ERROR]', error.code || error.message);
    return res.status(status).send('Accesso BuyYourShare non riuscito. Torna su BYS 2.0 e riprova.');
  }
});

// 1. Registrazione Account
authRouter.post('/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword, termsConsent, privacyConsent } = req.body || {};

    const cleanFirst = (firstName || '').trim();
    const cleanLast = (lastName || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();
    const cleanConfirm = (confirmPassword || '').trim();

    if (!cleanFirst || !cleanLast) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Nome e cognome sono obbligatori.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Inserisci un indirizzo email valido.' });
    }

    if (cleanPass.length < 8) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'La password deve contenere almeno 8 caratteri.' });
    }

    if (cleanPass !== cleanConfirm) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Le due password inserite non coincidono.' });
    }

    if (!termsConsent || !privacyConsent) {
      return res.status(400).json({ error: 'CONSENT_REQUIRED', message: 'È obbligatorio accettare i Termini di Servizio e l\'Informativa Privacy.' });
    }

    const existing = await dataRepository.findUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({
        error: existing.authSource === 'BYS_SSO' ? 'BYS_ACCOUNT' : 'ACCOUNT_EXISTS',
        message: existing.authSource === 'BYS_SSO'
          ? 'Questo account usa l’accesso unico BuyYourShare. Entra dal portale BYS 2.0.'
          : 'Esiste già un account con questa email. Accedi oppure usa “Password dimenticata?”.'
      });
    }

    const newUser = {
      id: 'usr-' + Date.now(),
      email: cleanEmail,
      fullName: `${cleanFirst} ${cleanLast}`,
      firstName: cleanFirst,
      lastName: cleanLast,
      passwordHash: hashPassword(cleanPass),
      role: 'user',
      isVerified: true,
      isEmailVerified: true,
      isSuspended: false,
      termsAcceptedAt: new Date().toISOString(),
      privacyAcceptedAt: new Date().toISOString(),
      iban: null,
      bankName: null,
      paypalPayoutEmail: cleanEmail,
      createdAt: new Date().toISOString()
    };

    await dataRepository.createUser(newUser);
    const session = await dataRepository.createSession(newUser.id);

    // Invio automatico dell'email di benvenuto / avvenuta registrazione
    emailService.sendWelcomeEmail(newUser).catch(err => {
      console.warn('[EMAIL WARNING] Invio email di benvenuto non riuscito:', err.message);
    });

    return res.status(201).json({
      success: true,
      token: session.token,
      user: sanitizeUser(newUser),
      message: 'Account creato con successo! Abbiamo inviato un\'email di benvenuto al tuo indirizzo.'
    });
  } catch (err) {
    console.error('[AUTH REGISTER ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore interno durante la registrazione.' });
  }
});

// 2. Login (Resiliente & Auto-Healing)
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanEmail || !cleanPass) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Inserisci email e password per accedere.' });
    }

    const user = await dataRepository.findUserByEmail(cleanEmail);

    if (!user) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email o password non corrette.' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'USER_SUSPENDED', message: 'Questo account è stato sospeso dall\'amministratore.' });
    }

    if (user.authSource === 'BYS_SSO' && !user.passwordHash) {
      return res.status(401).json({
        error: 'BYS_SSO_REQUIRED',
        message: 'Questo account usa l’accesso unico. Entra dal portale BuyYourShare 2.0.'
      });
    }

    if (user.passwordResetRequired) {
      return res.status(403).json({
        error: 'PASSWORD_RESET_REQUIRED',
        message: 'Per sicurezza devi impostare una nuova password tramite “Password dimenticata?”.'
      });
    }

    if (!verifyPassword(cleanPass, user.passwordHash)) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email o password non corrette.' });
    }

    const session = await dataRepository.createSession(user.id);

    return res.json({
      success: true,
      token: session.token,
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('[AUTH LOGIN ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore interno durante il login.' });
  }
});

// 3. Utente Corrente
authRouter.get('/me', requireAuth, async (req, res) => {
  return res.json({
    user: sanitizeUser(req.user)
  });
});

// 4. Logout
authRouter.post('/logout', async (req, res) => {
  if (req.session && req.session.token) {
    await dataRepository.deleteSession(req.session.token);
  }
  return res.json({ success: true, message: 'Logout eseguito con successo.' });
});

// 4b. Eliminazione Definitiva Account Utente
authRouter.delete('/account', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'ADMIN_CANNOT_BE_DELETED', message: 'L\'account di amministrazione non può essere eliminato.' });
    }
    await dataRepository.deleteUser(userId);
    return res.json({ success: true, message: 'Account eliminato con successo. Per rientrare dovrai registrarti di nuovo.' });
  } catch (err) {
    console.error('[DELETE ACCOUNT ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore durante l\'eliminazione dell\'account.' });
  }
});

authRouter.post('/delete-account', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'ADMIN_CANNOT_BE_DELETED', message: 'L\'account di amministrazione non può essere eliminato.' });
    }
    await dataRepository.deleteUser(userId);
    return res.json({ success: true, message: 'Account eliminato con successo. Per rientrare dovrai registrarti di nuovo.' });
  } catch (err) {
    console.error('[DELETE ACCOUNT ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore durante l\'eliminazione dell\'account.' });
  }
});

// 5. Aggiornamento Impostazioni Payout Capogruppo (PayPal / IBAN)
authRouter.put('/payout-settings', requireAuth, async (req, res) => {
  try {
    const { paypalPayoutEmail, iban, bankName } = req.body || {};
    const updates = {};

    if (paypalPayoutEmail !== undefined) {
      const cleanEmail = (paypalPayoutEmail || '').trim().toLowerCase();
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Indirizzo email PayPal non valido.' });
      }
      updates.paypalPayoutEmail = cleanEmail;
    }

    if (iban !== undefined) {
      updates.iban = (iban || '').trim().toUpperCase();
    }

    if (bankName !== undefined) {
      updates.bankName = (bankName || '').trim();
    }

    await dataRepository.updateUser(req.user.id, updates);
    const updatedUser = await dataRepository.findUserById(req.user.id);

    return res.json({
      success: true,
      message: 'Impostazioni di ricezione quote aggiornate con successo.',
      user: sanitizeUser(updatedUser)
    });
  } catch (err) {
    console.error('[AUTH PAYOUT SETTINGS ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Legacy insecure recovery endpoint intentionally disabled.
authRouter.post('/verify-identity', (req, res) => res.status(410).json({
  error: 'ENDPOINT_REMOVED',
  message: 'Usa “Password dimenticata?”: riceverai un link sicuro via email.'
}));

// 7. Richiesta Password Dimenticata (Invio Link Diretto)
authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Inserisci il tuo indirizzo email.' });
    }

    const user = await dataRepository.findUserByEmail(cleanEmail);
    if (user && user.authSource !== 'BYS_SSO') {
      const resetToken = createSecureToken('rst_');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await dataRepository.updateUser(user.id, {
        resetPasswordTokenHash: hashToken(resetToken),
        resetPasswordExpires: expiresAt
      });

      const host = req.get('host') || 'buyyourshare-production.up.railway.app';
      const proto = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const resetLink = `${proto}://${host}/#reset-password?email=${encodeURIComponent(cleanEmail)}&token=${encodeURIComponent(resetToken)}`;
      emailService.sendPasswordResetEmail(user, resetToken, resetLink).catch(err => {
        console.warn('[EMAIL WARNING] Invio email reset fallita:', err.message);
      });
    }

    return res.json({
      success: true,
      message: 'Se l’indirizzo corrisponde a un account locale, riceverai un link sicuro per reimpostare la password.'
    });
  } catch (err) {
    console.error('[AUTH FORGOT PASSWORD ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore durante la richiesta di recupero password.' });
  }
});

// 7. Verifica Codice di Recupero
authRouter.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanCode = (code || '').trim();

    if (!cleanEmail || !cleanCode) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Email e codice sono obbligatori.' });
    }

    const user = await dataRepository.findUserByEmail(cleanEmail);
    if (!user || !tokenMatches(cleanCode, user.resetPasswordTokenHash)) {
      return res.status(400).json({ error: 'INVALID_CODE', message: 'Codice di verifica non valido o errato.' });
    }

    if (new Date(user.resetPasswordExpires) < new Date()) {
      return res.status(400).json({ error: 'CODE_EXPIRED', message: 'Il codice di verifica è scaduto. Richiedine uno nuovo.' });
    }

    return res.json({ success: true, valid: true, message: 'Codice verificato con successo.' });
  } catch (err) {
    console.error('[AUTH VERIFY RESET CODE ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 8. Reimpostazione Nuova Password
authRouter.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword, confirmPassword } = req.body || {};
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanCode = (code || '').trim();
    const cleanPass = (newPassword || '').trim();
    const cleanConfirm = (confirmPassword || '').trim();

    if (!cleanEmail || !cleanCode || !cleanPass) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Tutti i campi sono obbligatori.' });
    }

    if (cleanPass.length < 8) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'La nuova password deve contenere almeno 8 caratteri.' });
    }

    if (cleanPass !== cleanConfirm) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Le due password inserite non coincidono.' });
    }

    const user = await dataRepository.findUserByEmail(cleanEmail);
    if (!user || !tokenMatches(cleanCode, user.resetPasswordTokenHash)) {
      return res.status(400).json({ error: 'INVALID_CODE', message: 'Codice di verifica non valido.' });
    }

    if (new Date(user.resetPasswordExpires) < new Date()) {
      return res.status(400).json({ error: 'CODE_EXPIRED', message: 'Il codice di verifica è scaduto.' });
    }

    // Aggiorna la password e cancella il codice monouso
    await dataRepository.updateUser(user.id, {
      passwordHash: hashPassword(cleanPass),
      passwordResetRequired: false,
      resetPasswordTokenHash: null,
      resetPasswordExpires: null
    });
    await dataRepository.deleteSessionsByUserId(user.id);

    // Invia email di conferma
    emailService.sendPasswordChangedEmail(user).catch(err => {
      console.warn('[EMAIL WARNING] Invio notifica cambio password fallita:', err.message);
    });

    return res.json({
      success: true,
      message: 'Password aggiornata con successo! Ora puoi accedere con la tua nuova password.'
    });
  } catch (err) {
    console.error('[AUTH RESET PASSWORD ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore durante la reimpostazione della password.' });
  }
});

authRouter.post('/reset-password-direct', (req, res) => res.status(410).json({
  error: 'ENDPOINT_REMOVED',
  message: 'La reimpostazione diretta è stata disattivata. Usa il link sicuro ricevuto via email.'
}));
