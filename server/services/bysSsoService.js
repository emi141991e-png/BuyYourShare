import jwt from 'jsonwebtoken';

const SSO_ISSUER = 'buyyourshare-2.0';
const SSO_AUDIENCE = 'buyyourshare-p2p';

export class BysSsoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BysSsoError';
    this.code = code;
  }
}

function getSsoSecret() {
  const secret = process.env.P2P_SSO_SECRET;
  if (!secret || secret.length < 32) {
    throw new BysSsoError('SSO_NOT_CONFIGURED', 'Single Sign-On non configurato.');
  }
  return secret;
}

export function verifyBysSsoTicket(token) {
  if (!token || typeof token !== 'string') {
    throw new BysSsoError('INVALID_TICKET', 'Ticket di accesso mancante.');
  }

  let payload;
  try {
    payload = jwt.verify(token, getSsoSecret(), {
      algorithms: ['HS256'],
      audience: SSO_AUDIENCE,
      issuer: SSO_ISSUER,
      clockTolerance: 5
    });
  } catch (error) {
    if (error instanceof BysSsoError) throw error;
    throw new BysSsoError('INVALID_TICKET', 'Ticket di accesso non valido o scaduto.');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!payload.sub || !payload.jti || !payload.exp || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BysSsoError('INVALID_IDENTITY', 'Identità BYS incompleta.');
  }

  return {
    bysUserId: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    expiresAt: payload.exp * 1000,
    jti: payload.jti,
    name: typeof payload.name === 'string' ? payload.name.trim() : ''
  };
}

function splitName(name, email) {
  const fallback = email.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'Utente';
  const fullName = name || fallback.replace(/\b\w/g, character => character.toUpperCase());
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Utente',
    fullName,
    lastName: parts.slice(1).join(' ') || 'BuyYourShare'
  };
}

export async function exchangeBysSsoTicket(token, repository) {
  const identity = verifyBysSsoTicket(token);
  const consumed = await repository.consumeSsoTicket(identity.jti, identity.expiresAt);
  if (!consumed) {
    throw new BysSsoError('TICKET_ALREADY_USED', 'Questo ticket di accesso è già stato utilizzato.');
  }

  let user = await repository.findUserByBysUserId(identity.bysUserId);
  if (!user) {
    const sameEmailUser = await repository.findUserByEmail(identity.email);
    if (sameEmailUser) {
      if (!identity.emailVerified) {
        throw new BysSsoError(
          'EMAIL_VERIFICATION_REQUIRED',
          'Conferma l’indirizzo email su BYS 2.0 prima di collegare un profilo P2P esistente.'
        );
      }
      if (sameEmailUser.bysUserId && sameEmailUser.bysUserId !== identity.bysUserId) {
        throw new BysSsoError('IDENTITY_CONFLICT', 'Questo profilo P2P è già collegato a un altro account BYS.');
      }
      user = await repository.updateUser(sameEmailUser.id, {
        bysUserId: identity.bysUserId,
        isEmailVerified: sameEmailUser.isEmailVerified || identity.emailVerified,
        linkedToBysAt: sameEmailUser.linkedToBysAt || new Date().toISOString()
      });
    } else {
      const idCollision = await repository.findUserById(identity.bysUserId);
      if (idCollision) {
        throw new BysSsoError('IDENTITY_CONFLICT', 'Impossibile collegare automaticamente questo account.');
      }
      const names = splitName(identity.name, identity.email);
      user = await repository.createUser({
        id: identity.bysUserId,
        bysUserId: identity.bysUserId,
        email: identity.email,
        ...names,
        password: null,
        authSource: 'BYS_SSO',
        role: 'user',
        isVerified: identity.emailVerified,
        isEmailVerified: identity.emailVerified,
        isSuspended: false,
        linkedToBysAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
    }
  }

  if (user.isSuspended) {
    throw new BysSsoError('USER_SUSPENDED', 'Questo account P2P è sospeso.');
  }

  if (identity.emailVerified && !user.isEmailVerified) {
    user = await repository.updateUser(user.id, {
      isEmailVerified: true,
      isVerified: true
    });
  }

  const session = await repository.createSession(user.id);
  return { session, user };
}

export const BYS_SSO_PROTOCOL = { audience: SSO_AUDIENCE, issuer: SSO_ISSUER };
