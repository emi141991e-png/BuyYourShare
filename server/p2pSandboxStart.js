// Explicit Railway test entrypoint: never open or copy the production database.
import fs from 'node:fs';

if (process.env.RAILWAY_ENVIRONMENT_NAME !== 'test' ||
    process.env.P2P_PAYPAL_MODE !== 'sandbox' ||
    !process.env.P2P_PAYPAL_CLIENT_ID || !process.env.P2P_PAYPAL_CLIENT_SECRET) {
  throw new Error('P2P sandbox startup requires Railway test and dedicated sandbox credentials');
}
const directory = '/app/server/data/p2p-sandbox-20260916';
process.env.DATA_DIR = directory;
process.env.DATABASE_PATH = `${directory}/database.json`;
fs.mkdirSync(directory, { recursive: true });
const state = Object.fromEntries([
  'users', 'services', 'groups', 'memberships', 'accessInstructions', 'chats',
  'chatMessages', 'connectedAccounts', 'financialAuditLogs', 'notifications',
  'sessions', 'checkoutReservations', 'usedSsoTickets', 'p2pSubscriptions',
  'p2pWebhookEvents'
].map(key => [key, []]));
state.p2pSandboxFixture = true;
try {
  fs.writeFileSync(process.env.DATABASE_PATH, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const existing = JSON.parse(fs.readFileSync(process.env.DATABASE_PATH, 'utf8'));
  if (existing.p2pSandboxFixture !== true) throw new Error('Refusing non-sandbox database');
}
await import('./index.js');
