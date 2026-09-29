import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappGroupUrl } from '../js/ui/groupShare.js';

test('WhatsApp shares only the public group link and explains separate fees', () => {
  const group = { id: 'group-123', customServiceName: 'Musica & Video', payoutIban: 'PRIVATE_IBAN', paypalEmail: 'private@example.com', instructions: 'SECRET', chat: 'PRIVATE_CHAT' };
  const url = new URL(whatsappGroupUrl(group, 'https://marketplace.buyyourshare.it/#privata-secret'));
  assert.equal(url.origin, 'https://wa.me');
  const text = url.searchParams.get('text');
  assert.ok(text.includes('Musica & Video'));
  assert.ok(text.includes('https://marketplace.buyyourshare.it/#gruppo-group-123'));
  assert.ok(text.includes('0,99 €/mese'));
  for (const secret of ['PRIVATE_IBAN', 'private@example.com', 'SECRET', 'PRIVATE_CHAT', 'privata-secret']) assert.ok(!text.includes(secret));
});
test('sharing keeps sandbox origins and safely encodes service names and identifiers', () => {
  const text = new URL(whatsappGroupUrl({ id: 'a&b', customServiceName: 'Video\n& musica?' }, 'https://buyyourshare-test.up.railway.app')).searchParams.get('text');
  assert.ok(text.includes('https://buyyourshare-test.up.railway.app/#gruppo-a%26b'));
  assert.ok(text.includes('Video & musica?'));
  assert.throws(() => whatsappGroupUrl({ id: '' }, 'https://marketplace.buyyourshare.it'));
});

import { notificationTarget } from '../js/ui/notificationCenter.js';
test('notification links only navigate to internal marketplace destinations', () => {
 assert.equal(notificationTarget({ requestId: 'request-1' }), '#privata-request-1');
 assert.equal(notificationTarget({ actionUrl: '#miei-gruppi' }), '#miei-gruppi');
 for (const actionUrl of ['javascript:alert(1)', 'https://evil.example', '#privata-x" onclick=bad', '#admin']) assert.equal(notificationTarget({ actionUrl }), null);
});

import { requestsForView } from '../js/ui/manualPayments.js';
test('group management and member participation lists remain separate for the same account', () => {
 const requests = [{id:'owned',ownerId:'me',userId:'someone'},{id:'joined',ownerId:'someone',userId:'me'}];
 assert.deepEqual(requestsForView(requests, '#miei-gruppi', 'me').map(r=>r.id), ['owned']);
 assert.deepEqual(requestsForView(requests, '#miei-abbonamenti', 'me').map(r=>r.id), ['joined']);
 assert.deepEqual(requestsForView(requests, '#privata-joined', 'me').map(r=>r.id), ['joined']);
 assert.deepEqual(requestsForView(requests, '#privata-missing', 'me'), []);
});
