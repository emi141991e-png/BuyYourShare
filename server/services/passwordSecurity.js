import crypto from 'crypto';

const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export function verifyPassword(password, encodedHash) {
  if (!encodedHash || typeof encodedHash !== 'string') return false;
  const [algorithm, salt, storedHex] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !storedHex) return false;

  try {
    const stored = Buffer.from(storedHex, 'hex');
    const candidate = crypto.scryptSync(String(password), salt, stored.length);
    return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
  } catch {
    return false;
  }
}

export function createSecureToken(prefix = '') {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;
  const candidate = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(String(storedHash), 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}
