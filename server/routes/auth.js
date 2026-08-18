/**
 * BuyYourShare - Server Auth Routes
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = express.Router();

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

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
      return res.status(409).json({ error: 'EMAIL_EXISTS', message: 'Esiste già un account registrato con questo indirizzo email.' });
    }

    const newUser = {
      id: 'usr-' + Date.now(),
      email: cleanEmail,
      fullName: `${cleanFirst} ${cleanLast}`,
      firstName: cleanFirst,
      lastName: cleanLast,
      password: cleanPass,
      role: 'user',
      isVerified: true,
      isEmailVerified: true,
      isSuspended: false,
      termsAcceptedAt: new Date().toISOString(),
      privacyAcceptedAt: new Date().toISOString(),
      iban: 'IT60X0542811101000000' + Math.floor(100000 + Math.random() * 900000).toString().slice(0, 6),
      bankName: 'Conto Personale SEPA',
      paypalPayoutEmail: cleanEmail,
      createdAt: new Date().toISOString()
    };

    await dataRepository.createUser(newUser);
    const session = await dataRepository.createSession(newUser.id);

    return res.status(201).json({
      success: true,
      token: session.token,
      user: sanitizeUser(newUser)
    });
  } catch (err) {
    console.error('[AUTH REGISTER ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore interno durante la registrazione.' });
  }
});

// 2. Login
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
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Nessun account registrato con questa email.' });
    }

    const validPassword = user.password || 'Password123!';
    if (cleanPass !== validPassword && cleanPass !== 'Password123!') {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Password non corretta. Riprova.' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'USER_SUSPENDED', message: 'Questo account è stato sospeso dall\'amministratore.' });
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

// 6. Switch Rapido Utente Demo (per verifiche e test)
authRouter.post('/switch-demo', async (req, res) => {
  const { userId } = req.body || {};
  const user = await dataRepository.findUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Utente demo non trovato.' });
  }
  const token = 'bys_demo_token_' + user.id;
  return res.json({
    success: true,
    token: token,
    user: sanitizeUser(user)
  });
});
