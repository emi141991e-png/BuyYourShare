/**
 * BuyYourShare - Server Auth Middleware
 * Verifica sessione server-side e controllo dei permessi RBAC.
 */

import { dataRepository } from '../db/dataRepository.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers['x-session-token'];
    let token = null;

    if (authHeader) {
      token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    }

    if (!token) {
      req.user = null;
      req.session = null;
      return next();
    }

    // Verifica esclusivamente una sessione server-side reale.
    let session = await dataRepository.findSession(token);
    if (session) {
      const now = Date.now();
      const lastActive = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : new Date(session.createdAt).getTime();
      const isInactive = (now - lastActive) > (15 * 60 * 1000);

      if (isInactive || new Date(session.expiresAt) < new Date(now)) {
        await dataRepository.deleteSession(token);
        req.user = null;
        req.session = null;
        return next();
      }

      // Rinnova il timestamp di ultima attività e la scadenza (+15 min)
      session.lastActivityAt = new Date(now).toISOString();
      session.expiresAt = new Date(now + 15 * 60 * 1000).toISOString();

      const user = await dataRepository.findUserById(session.userId);
      if (user && !user.isSuspended) {
        req.user = user;
        req.session = session;
        return next();
      }
    }

    req.user = null;
    req.session = null;
    next();
  } catch (err) {
    console.error('[AUTH MIDDLEWARE ERROR]', err);
    req.user = null;
    req.session = null;
    next();
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Accesso non autorizzato. Effettua il login per proseguire.'
    });
  }
  next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Accesso non autorizzato.'
      });
    }
    if (req.user.role !== role) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Accesso negato. Questa risorsa richiede il ruolo "${role}".`
      });
    }
    next();
  };
}
