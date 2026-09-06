import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hashPassword, verifyPassword, createSecureToken, hashToken, tokenMatches } from '../server/services/passwordSecurity.js';

test('passwords are hashed with a random salt and verified safely', () => {
  const first = hashPassword('UnaPasswordMoltoSicura!');
  const second = hashPassword('UnaPasswordMoltoSicura!');
  assert.notEqual(first, second);
  assert.equal(verifyPassword('UnaPasswordMoltoSicura!', first), true);
  assert.equal(verifyPassword('password-sbagliata', first), false);
});

test('reset tokens are stored only as hashes', () => {
  const token = createSecureToken('rst_');
  const stored = hashToken(token);
  assert.equal(tokenMatches(token, stored), true);
  assert.equal(tokenMatches(`${token}x`, stored), false);
  assert.equal(stored.includes(token), false);
});

test('known authentication bypasses and root static publication are absent', () => {
  const middleware = fs.readFileSync(new URL('../server/middleware/auth.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const auth = fs.readFileSync(new URL('../server/routes/auth.js', import.meta.url), 'utf8');
  assert.equal(middleware.includes("req.headers['x-user-id']"), false);
  assert.equal(middleware.includes('bys_demo_token_'), false);
  assert.equal(server.includes('express.static(ROOT_DIR'), false);
  assert.equal(auth.includes("password: cleanPass"), false);
  assert.equal(auth.includes("role: cleanEmail.includes('admin')"), false);
});
