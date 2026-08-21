/**
 * BuyYourShare - Server Access Instructions Routes (Zero Data Leakage)
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';

export const accessRouter = express.Router();

// 1. Recupero Credenziali Protette (Solo Membri Attivi o Owner)
accessRouter.get('/:groupId', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const user = req.user;
    const group = await dataRepository.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'GROUP_NOT_FOUND' });

    const isOwner = group.ownerId === user.id || user.role === 'admin';
    const allMems = await dataRepository.getMemberships({ groupId });
    const matching = allMems.filter(m => {
      if (m.userId === user.id) return true;
      if (m.memberEmail && m.memberEmail.toLowerCase() === user.email.toLowerCase()) return true;
      const memUser = dataRepository.data.users.find(u => u.id === m.userId);
      return memUser && memUser.email && memUser.email.toLowerCase() === user.email.toLowerCase();
    });

    const isMember = matching.some(m => m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED' || m.status === 'active');

    if (!isOwner && !isMember) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'Non sei autorizzato a visualizzare le credenziali di questo gruppo. Devi essere un membro pagante attivo.'
      });
    }

    // Auto-heal userId on matching memberships
    matching.forEach(m => {
      if (m.userId !== user.id) {
        m.userId = user.id;
        dataRepository.save();
      }
    });

    const instructions = await dataRepository.getAccessInstructions(groupId);
    return res.json({ instructions: instructions || null });
  } catch (err) {
    console.error('[ACCESS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 2. Aggiornamento Credenziali (Solo Capogruppo Owner o Admin)
accessRouter.post('/:groupId', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await dataRepository.findGroupById(groupId);
    if (!group) return res.status(404).json({ error: 'GROUP_NOT_FOUND' });

    if (group.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Solo il Capogruppo può aggiornare le credenziali.' });
    }

    const { accessUrl, instructions, accessCode, ownerSpotifyAccount, additionalInfo } = req.body || {};
    const updated = await dataRepository.saveAccessInstructions(groupId, {
      accessUrl,
      instructions,
      accessCode,
      ownerSpotifyAccount,
      additionalInfo
    });

    // Notifica di aggiornamento credenziali nella chat privata
    const chat = await dataRepository.getChatByGroupId(groupId);
    await dataRepository.addChatMessage({
      id: 'msg-' + Date.now(),
      chatId: chat.id,
      senderId: null,
      messageType: 'SYSTEM',
      messageContent: '🔄 Il Capogruppo ha aggiornato le istruzioni e le credenziali di accesso del gruppo.',
      createdAt: new Date().toISOString()
    });

    return res.json({ success: true, instructions: updated });
  } catch (err) {
    console.error('[ACCESS POST ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
