/**
 * BuyYourShare - Server Chat Routes (Zero Data Leakage)
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';

export const chatRouter = express.Router();

async function verifyChatAccess(groupId, user) {
  const group = await dataRepository.findGroupById(groupId);
  if (!group) return false;
  if (group.ownerId === user.id || user.role === 'admin') return true;

  const allMems = await dataRepository.getMemberships({ groupId });
  const matching = allMems.filter(m => {
    if (m.userId === user.id) return true;
    if (m.memberEmail && m.memberEmail.toLowerCase() === user.email.toLowerCase()) return true;
    const memUser = dataRepository.data.users.find(u => u.id === m.userId);
    return memUser && memUser.email && memUser.email.toLowerCase() === user.email.toLowerCase();
  });

  const isMember = matching.some(m => m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED' || m.status === 'active');
  if (isMember) {
    matching.forEach(m => {
      if (m.userId !== user.id) {
        m.userId = user.id;
        dataRepository.save();
      }
    });
  }
  return isMember;
}

// 1. Messaggi Chat del Gruppo
chatRouter.get('/:groupId', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const canAccess = await verifyChatAccess(groupId, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Accesso alla chat riservato ai membri attivi del gruppo.' });
    }

    const chat = await dataRepository.getChatByGroupId(groupId);
    const messages = await dataRepository.getChatMessages(chat.id);
    const group = await dataRepository.findGroupById(groupId);

    return res.json({
      chat: {
        id: chat.id,
        groupId: groupId,
        groupName: group ? group.customServiceName : 'Gruppo',
        messages: messages
      }
    });
  } catch (err) {
    console.error('[CHAT GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 2. Invio Messaggio
chatRouter.post('/:groupId/messages', requireAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const canAccess = await verifyChatAccess(groupId, req.user);
    if (!canAccess) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Accesso negato.' });
    }

    const { content, message } = req.body || {};
    const text = (content || message || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'EMPTY_MESSAGE', message: 'Il messaggio non può essere vuoto.' });
    }

    const group = await dataRepository.findGroupById(groupId);
    const isOwner = group.ownerId === req.user.id;
    const chat = await dataRepository.getChatByGroupId(groupId);

    const newMsg = {
      id: 'msg-' + Date.now(),
      chatId: chat.id,
      senderId: req.user.id,
      senderName: isOwner ? `${req.user.fullName} (Capogruppo)` : req.user.fullName,
      messageType: 'TEXT',
      messageContent: text,
      createdAt: new Date().toISOString()
    };

    await dataRepository.addChatMessage(newMsg);

    return res.status(201).json({ success: true, message: newMsg });
  } catch (err) {
    console.error('[CHAT POST ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
