import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappGroupUrl } from '../js/ui/groupShare.js';
import { groupSharePage } from '../server/services/groupSharePage.js';

test('social crawlers receive public metadata and no private group data', () => {
  const html = groupSharePage({id:'a&b', status:'PUBLISHED', customServiceName:'Video <script>alert(1)</script>', planName:'Family', payoutIban:'PRIVATE_IBAN', instructions:'PRIVATE_ACCESS', description:'PRIVATE_DESCRIPTION'}, 'https://marketplace.buyyourshare.it');
  assert.ok(html.includes('property="og:title"'));
  assert.ok(html.includes('property="og:image"'));
  assert.ok(html.includes('/gruppi/a%26b'));
  assert.ok(html.includes('/#gruppo-a%26b'));
  assert.ok(!html.includes('<script>'));
  for (const secret of ['PRIVATE_IBAN','PRIVATE_ACCESS','PRIVATE_DESCRIPTION']) assert.ok(!html.includes(secret));
});
test('draft, closed, private and missing groups cannot create public previews', () => {
  for (const group of [null, {status:'DRAFT'}, {status:'CLOSED'}, {status:'PUBLISHED',groupType:'private'}, {status:'unknown'}]) assert.equal(groupSharePage(group, 'https://marketplace.buyyourshare.it'), null);
});

test('WhatsApp shares only the public group link and explains separate fees', () => {
  const group = { id: 'group-123', customServiceName: 'Musica & Video', payoutIban: 'PRIVATE_IBAN', paypalEmail: 'private@example.com', instructions: 'SECRET', chat: 'PRIVATE_CHAT' };
  const url = new URL(whatsappGroupUrl(group, 'https://marketplace.buyyourshare.it/#privata-secret'));
  assert.equal(url.origin, 'https://wa.me');
  const text = url.searchParams.get('text');
  assert.ok(text.includes('Musica & Video'));
  assert.ok(text.includes('https://marketplace.buyyourshare.it/gruppi/group-123'));
  assert.ok(text.includes('0,99 €/mese'));
  for (const secret of ['PRIVATE_IBAN', 'private@example.com', 'SECRET', 'PRIVATE_CHAT', 'privata-secret']) assert.ok(!text.includes(secret));
});
test('sharing keeps sandbox origins and safely encodes service names and identifiers', () => {
  const text = new URL(whatsappGroupUrl({ id: 'a&b', customServiceName: 'Video\n& musica?' }, 'https://buyyourshare-test.up.railway.app')).searchParams.get('text');
  assert.ok(text.includes('https://buyyourshare-test.up.railway.app/gruppi/a%26b'));
  assert.ok(text.includes('Video & musica?'));
  assert.throws(() => whatsappGroupUrl({ id: '' }, 'https://marketplace.buyyourshare.it'));
});

import { notificationTarget } from '../js/ui/notificationCenter.js';
test('admin bank reminders open BYS bank administration including existing reminders', () => {
 const target = 'https://buyyourshare.it/admin/marketplace-payments';
 assert.equal(notificationTarget({id:'bank-report:123:admin',actionUrl:'#p2p-abbonamento'}), target);
 assert.equal(notificationTarget({actionUrl:target}), target);
 assert.equal(notificationTarget({actionUrl:target+'?redirect=https://evil.example'}), null);
});
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
