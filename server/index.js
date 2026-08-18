/**
 * BuyYourShare - Server Entrypoint (Node.js & Express)
 * Real Backend with REST APIs, Server Webhooks, Database Persistence and Security
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { authenticate } from './middleware/auth.js';

import { authRouter } from './routes/auth.js';
import { groupsRouter } from './routes/groups.js';
import { membershipsRouter } from './routes/memberships.js';
import { accessRouter } from './routes/access.js';
import { chatRouter } from './routes/chat.js';
import { connectRouter } from './routes/connect.js';
import { checkoutRouter } from './routes/checkout.js';
import { webhooksRouter } from './routes/webhooks.js';
import { ledgerRouter } from './routes/ledger.js';
import { notificationsRouter } from './routes/notifications.js';
import { adminRouter } from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

const app = express();

// 1. Webhooks Router (mounted before JSON body parser for Stripe signature)
app.use('/api/webhooks', webhooksRouter);

// 2. Standard Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Global Authentication Middleware
app.use(authenticate);

// 4. API Endpoints
app.use('/api/auth', authRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/memberships', membershipsRouter);
app.use('/api/access', accessRouter);
app.use('/api/chat', chatRouter);
app.use('/api/connect', connectRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/notifications', notificationsRouter);
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

app.use(express.static(ROOT_DIR, {
  extensions: ['html', 'js', 'css', 'json', 'png', 'jpg', 'svg'],
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

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
  console.log(`  🔗 Webhook PayPal: http://localhost:${config.port}/api/webhooks/paypal`);
  console.log(`  🔗 Webhook Stripe: http://localhost:${config.port}/api/webhooks/stripe`);
  console.log('====================================================');
});
