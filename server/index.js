/**
 * BuyYourShare - Server Entrypoint (Node.js & Express)
 * Real Backend with REST APIs, Server Webhooks, Database Persistence and Security
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { authenticate } from './middleware/auth.js';
import { dataRepository } from './db/dataRepository.js';
import { P2pPayPal } from './services/p2pPayPal.js';
import { P2pSubscriptions } from './services/p2pSubscription.js';
import { prepareLegacyMigration } from './services/p2pLegacyMigration.js';
import { createP2pRoutes, requireP2p, p2pError } from './routes/p2p.js';

import { authRouter } from './routes/auth.js';
import { groupsRouter } from './routes/groups.js';
import { membershipsRouter } from './routes/memberships.js';
import { accessRouter } from './routes/access.js';
import { chatRouter } from './routes/chat.js';
import { ledgerRouter } from './routes/ledger.js';
import { notificationsRouter } from './routes/notifications.js';
import { adminRouter } from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const app = express();
const p2pProvider = new P2pPayPal();
if (process.env.P2P_LEGACY_RECONCILE_IDS) {
  const migrated = await prepareLegacyMigration(dataRepository.data, p2pProvider,
    process.env.P2P_LEGACY_RECONCILE_IDS.split(',').map(id => id.trim()).filter(Boolean));
  if (migrated) {
    dataRepository.backupForP2pMigration();
    dataRepository.data = migrated;
    await dataRepository.save();
    console.log('[P2P] Verified legacy migration completed; backup retained on persistent volume.');
  }
}
export const p2pSubscriptions = new P2pSubscriptions(dataRepository, p2pProvider);
const p2pGate = requireP2p(p2pSubscriptions);
app.set('trust proxy', 1);

// 1. Webhooks Router (mounted before JSON body parser for Stripe signature)
app.post('/api/webhooks/p2p-paypal', express.json({ limit: '256kb' }), async (req, res) => {
  try {
    if (!await p2pProvider.verify(req.headers, req.body)) return res.status(400).json({ error: 'INVALID_SIGNATURE' });
    res.json(await p2pSubscriptions.webhook(req.body));
  } catch (e) { p2pError(res, e); }
});
// Old group collection/payout handlers are deliberately unreachable. Return a retryable
// response so existing provider events require reconciliation and are never silently lost.
app.use('/api/webhooks', (req, res) => res.status(503).json({ error: 'LEGACY_GROUP_BILLING_REQUIRES_RECONCILIATION' }));

// 2. Standard Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// 3. Global Authentication Middleware
app.use(authenticate);

// 4. API Endpoints
app.use('/api/auth', (req, res, next) => {
  if ((req.method === 'DELETE' && req.path === '/account') || (req.method === 'POST' && req.path === '/delete-account')) {
    const subscription = req.user && p2pSubscriptions.find(req.user.id);
    if (subscription && !['CANCELLED', 'EXPIRED'].includes(subscription.providerStatus)) {
      return res.status(409).json({ error: 'CANCEL_P2P_SUBSCRIPTION_FIRST', message: 'Disattiva prima il rinnovo nella pagina Abbonamento P2P.' });
    }
  }
  next();
}, authRouter);
app.use('/api/p2p', createP2pRoutes(p2pSubscriptions));
app.use('/api/groups', p2pGate, (req, res, next) => {
  if (req.method === 'POST' && req.path === '/' && p2pSubscriptions.find(req.user.id)?.role !== 'GROUP_LEADER') {
    return res.status(409).json({ error: 'P2P_LEADER_PLAN_REQUIRED', message: 'Conferma prima il piano capogruppo da 0,49 EUR/mese.' });
  }
  next();
}, groupsRouter);
app.use('/api/memberships', p2pGate, membershipsRouter);
app.use('/api/access', p2pGate, accessRouter);
app.use('/api/chat', p2pGate, chatRouter);
app.use(['/api/connect', '/api/checkout'], (req, res) => res.status(410).json({ error: 'DIRECT_GROUP_PAYMENTS_ONLY', message: 'Le quote si pagano direttamente al capogruppo. BYS incassa solo l’abbonamento P2P.' }));
app.use('/api/ledger', p2pGate, ledgerRouter);
app.use('/api/notifications', p2pGate, notificationsRouter);
app.use('/api/admin', adminRouter);

// Endpoint Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'BuyYourShare Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// 5. Static Files Serving (Frontend SPA) con No-Cache headers per aggiornamenti istantanei
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

const staticOptions = {
  extensions: ['html', 'js', 'css', 'json', 'png', 'jpg', 'svg'],
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

// Publish only browser assets. Never expose server/, package files or the database.
app.use('/css', express.static(path.join(ROOT_DIR, 'css'), staticOptions));
app.use('/js', express.static(path.join(ROOT_DIR, 'js'), staticOptions));
app.get('/', (req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));

app.use((req, res, next) => {
  const blocked = ['/server', '/tests', '/package.json', '/package-lock.json', '/railway.json', '/.env', '/.git'];
  if (blocked.some(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    return res.status(404).end();
  }
  next();
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED SERVER ERROR]', err);
  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: err.message || 'Si è verificato un errore imprevisto.'
  });
});

// Start Server
app.listen(config.port, () => {
  console.log('====================================================');
  console.log(`  🚀 BuyYourShare Real Node.js Backend Server`);
  console.log(`  📍 URL: http://localhost:${config.port}`);
  console.log(`  🔗 Webhook accesso P2P: http://localhost:${config.port}/api/webhooks/p2p-paypal`);
  console.log('====================================================');
});
