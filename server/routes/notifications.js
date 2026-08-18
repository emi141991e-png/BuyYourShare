/**
 * BuyYourShare - Server Notifications Routes
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';

export const notificationsRouter = express.Router();

// 1. Lista Notifiche Utente
notificationsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const notifs = await dataRepository.getNotifications(req.user.id);
    return res.json({ notifications: notifs });
  } catch (err) {
    console.error('[NOTIFICATIONS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 2. Segna come lette
notificationsRouter.post('/read', requireAuth, async (req, res) => {
  try {
    await dataRepository.markNotificationsRead(req.user.id);
    return res.json({ success: true });
  } catch (err) {
    console.error('[NOTIFICATIONS READ ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
