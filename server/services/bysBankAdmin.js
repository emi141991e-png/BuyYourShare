import { createHash, createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';

export async function verifyBysBankRequest(token, method, path, body, repository, secret = process.env.P2P_SSO_SECRET, scope = 'bank-payments') {
  if (!secret || secret.length < 32) throw new Error('BRIDGE_NOT_CONFIGURED');
  const key = createHmac('sha256', secret).update('bys-bank-admin-v1').digest('hex');
  const claims = jwt.verify(token, key, { algorithms: ['HS256'], issuer: 'buyyourshare-admin', audience: 'p2p-bank-admin', maxAge: '60s' });
  const hash = createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
  if (!claims || typeof claims === 'string' || claims.scope !== scope || !claims.sub || !claims.jti || !claims.exp || claims.method !== method || claims.path !== path || claims.bodyHash !== hash) throw new Error('INVALID_BRIDGE_REQUEST');
  if (!await repository.consumeSsoTicket(`bank-admin:${claims.jti}`, claims.exp * 1000)) throw new Error('BRIDGE_REPLAY');
  return claims.sub;
}
