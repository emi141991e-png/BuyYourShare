import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { BYS_SSO_PROTOCOL, BysSsoError, exchangeBysSsoTicket } from '../server/services/bysSsoService.js';

process.env.P2P_SSO_SECRET = 'test-secret-with-at-least-thirty-two-characters';

function ticket(overrides = {}) {
  return jwt.sign(
    { email: 'user@example.com', email_verified: true, jti: 'ticket-1', name: 'Mario Rossi', ...overrides },
    process.env.P2P_SSO_SECRET,
    { algorithm: 'HS256', audience: BYS_SSO_PROTOCOL.audience, expiresIn: 60, issuer: BYS_SSO_PROTOCOL.issuer, subject: 'bys-user-1' }
  );
}

function repository(existingUsers = []) {
  const users = structuredClone(existingUsers);
  const consumed = new Set();
  return {
    users,
    async consumeSsoTicket(jti) { if (consumed.has(jti)) return false; consumed.add(jti); return true; },
    async createSession(userId) { return { token: `session-${userId}`, userId }; },
    async createUser(user) { users.push(user); return user; },
    async findUserByBysUserId(id) { return users.find(user => user.bysUserId === id) || null; },
    async findUserByEmail(email) { return users.find(user => user.email === email) || null; },
    async findUserById(id) { return users.find(user => user.id === id) || null; },
    async updateUser(id, updates) { const user = users.find(item => item.id === id); Object.assign(user, updates); return user; }
  };
}

test('provisions a new P2P profile with the same BYS user id and no second password', async () => {
  const repo = repository();
  const result = await exchangeBysSsoTicket(ticket(), repo);
  assert.equal(result.user.id, 'bys-user-1');
  assert.equal(result.user.bysUserId, 'bys-user-1');
  assert.equal(result.user.password, undefined);
  assert.equal(result.session.userId, 'bys-user-1');
});

test('links an existing P2P account by email without changing its local id or password', async () => {
  const repo = repository([{ id: 'legacy-p2p-7', email: 'user@example.com', password: 'existing-password', role: 'user' }]);
  const result = await exchangeBysSsoTicket(ticket(), repo);
  assert.equal(result.user.id, 'legacy-p2p-7');
  assert.equal(result.user.bysUserId, 'bys-user-1');
  assert.equal(result.user.password, 'existing-password');
});

test('rejects replay of the same one-time SSO ticket', async () => {
  const repo = repository();
  const signedTicket = ticket();
  await exchangeBysSsoTicket(signedTicket, repo);
  await assert.rejects(() => exchangeBysSsoTicket(signedTicket, repo), error => {
    assert.ok(error instanceof BysSsoError);
    assert.equal(error.code, 'TICKET_ALREADY_USED');
    return true;
  });
});

test('does not link an existing P2P account until the BYS email is verified', async () => {
  const repo = repository([{ id: 'legacy-p2p-7', email: 'user@example.com', password: 'existing-password', role: 'user' }]);
  await assert.rejects(() => exchangeBysSsoTicket(ticket({ email_verified: false }), repo), error => {
    assert.ok(error instanceof BysSsoError);
    assert.equal(error.code, 'EMAIL_VERIFICATION_REQUIRED');
    return true;
  });
  assert.equal(repo.users[0].bysUserId, undefined);
});
