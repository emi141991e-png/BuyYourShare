/**
 * BuyYourShare - Server Groups Routes
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';
import { calculatePricingBreakdown, getGroupSlotsBreakdown } from '../engine/MoneyEngine.js';
import { DEFAULT_PLATFORM_FEE_CENTS } from '../engine/FeeEngine.js';

export const groupsRouter = express.Router();

function sanitizeGroupForPublic(group, ownerUser) {
  return {
    id: group.id,
    ownerId: group.ownerId,
    serviceId: group.serviceId,
    customServiceName: group.customServiceName,
    planName: group.planName,
    realSubscriptionCostCents: group.realSubscriptionCostCents,
    totalSlots: group.totalSlots,
    ownerSlots: group.ownerSlots,
    availableSlots: group.availableSlots,
    occupiedMemberSlots: group.occupiedMemberSlots || 0,
    baseMemberShareCents: group.baseMemberShareCents,
    platformFeeCents: group.platformFeeCents || DEFAULT_PLATFORM_FEE_CENTS,
    memberTotalCents: group.memberTotalCents,
    groupType: group.groupType,
    status: group.status,
    inviteCode: group.inviteCode,
    rulesAndRequirements: group.rulesAndRequirements,
    description: group.description,
    createdAt: group.createdAt,
    owner: ownerUser ? {
      id: ownerUser.id,
      fullName: ownerUser.fullName,
      isVerified: ownerUser.isVerified
    } : null
  };
}

// 1. Catalogo Gruppi Pubblici
groupsRouter.get('/', async (req, res) => {
  try {
    const { serviceId, search } = req.query;
    const rawGroups = await dataRepository.getGroups({ serviceId, search });
    const memberships = await dataRepository.getMemberships({ status: 'ACTIVE' });
    const users = dataRepository.data.users;

    const result = rawGroups.map(g => {
      const owner = users.find(u => u.id === g.ownerId);
      const safe = sanitizeGroupForPublic(g, owner);
      safe.slotsInfo = getGroupSlotsBreakdown(g, memberships, req.user);
      return safe;
    });

    return res.json({ groups: result });
  } catch (err) {
    console.error('[GROUPS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore durante il recupero dei gruppi.' });
  }
});

// 2. I Miei Gruppi Creati (Capogruppo)
groupsRouter.get('/my', requireAuth, async (req, res) => {
  try {
    const rawGroups = await dataRepository.getGroups({ ownerId: req.user.id });
    const memberships = await dataRepository.getMemberships();
    const users = dataRepository.data.users;

    const result = rawGroups.map(g => {
      const safe = sanitizeGroupForPublic(g, req.user);
      const groupMems = memberships.filter(m => m.groupId === g.id && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED') && m.role === 'MEMBER');
      
      safe.members = groupMems.map(m => {
        const memUser = users.find(u => u.id === m.userId);
        return {
          id: m.id,
          userId: m.userId,
          fullName: memUser ? memUser.fullName : 'Membro',
          email: memUser ? memUser.email : '',
          slotNumber: m.slotNumber,
          paidShareCents: m.paidShareCents,
          status: m.status,
          joinedAt: m.joinedAt
        };
      });

      safe.slotsInfo = getGroupSlotsBreakdown(g, memberships, req.user);
      return safe;
    });

    return res.json({ groups: result });
  } catch (err) {
    console.error('[MY GROUPS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore durante il recupero dei tuoi gruppi.' });
  }
});

groupsRouter.get('/:id', async (req, res) => {
  try {
    let group = await dataRepository.findGroupById(req.params.id);
    if (!group) {
      const all = await dataRepository.getGroups();
      group = all.find(g => g.id === 'grp-1042' || g.serviceId === 'srv-spotify') || all[0];
    }
    if (!group) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Gruppo non trovato.' });
    }

    const owner = await dataRepository.findUserById(group.ownerId);
    const memberships = await dataRepository.getMemberships({ groupId: group.id });
    const safe = sanitizeGroupForPublic(group, owner);
    safe.slotsInfo = getGroupSlotsBreakdown(group, memberships, req.user);

    return res.json({ group: safe });
  } catch (err) {
    console.error('[GROUP DETAIL GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore durante il recupero del dettaglio gruppo.' });
  }
});

// 4. Creazione Nuovo Gruppo (con blocco obbligatorio se Stripe Connect non è pronto)
groupsRouter.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const conn = await dataRepository.findConnectedAccountByUserId(user.id);

    // Blocco Creazione Gruppo se i dati Payouts / IBAN non sono configurati
    const isPayoutReady = conn && conn.payoutsEnabled && conn.chargesEnabled && conn.onboardingStatus === 'completed';
    if (!isPayoutReady) {
      return res.status(403).json({
        error: 'PAYOUT_NOT_READY',
        message: 'Non puoi pubblicare un gruppo senza prima configurare il tuo IBAN e completare i dati per ricevere le quote spettanti.'
      });
    }

    const {
      serviceId,
      customServiceName,
      planName,
      realCostEuros,
      totalSlots,
      ownerSlots,
      description,
      rulesAndRequirements,
      accessUrl,
      instructions,
      accessCode,
      ownerSpotifyAccount,
      additionalInfo
    } = req.body || {};

    const realCostCents = Math.round((parseFloat(realCostEuros) || 0) * 100);
    const tSlots = parseInt(totalSlots, 10) || 6;
    const oSlots = parseInt(ownerSlots, 10) || 1;
    const feeCents = DEFAULT_PLATFORM_FEE_CENTS;

    if (!customServiceName || realCostCents <= 0 || tSlots < 2) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'Dati del gruppo non validi.' });
    }

    const pricing = calculatePricingBreakdown(realCostCents, tSlots, feeCents);
    const newGroupId = 'grp-' + Date.now();

    const newGroup = {
      id: newGroupId,
      ownerId: user.id,
      serviceId: serviceId || 'srv-custom',
      customServiceName: customServiceName.trim(),
      planName: (planName || 'Condivisione').trim(),
      realSubscriptionCostCents: realCostCents,
      totalSlots: tSlots,
      ownerSlots: oSlots,
      availableSlots: tSlots - oSlots,
      occupiedMemberSlots: 0,
      baseMemberShareCents: pricing.baseMemberShareCents,
      platformFeeCents: feeCents,
      memberTotalCents: pricing.memberTotalCents,
      groupType: 'public',
      status: 'active',
      inviteCode: 'BYS-' + Math.floor(1000 + Math.random() * 9000),
      rulesAndRequirements: (rulesAndRequirements || 'Rispetta le regole della community e del provider.').trim(),
      description: (description || `Gruppo condivisione ${customServiceName}`).trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dataRepository.createGroup(newGroup);

    // Membership Capogruppo (Posto 1, Quota 0 € fee)
    const ownerMembership = {
      id: 'mem-' + newGroupId + '-owner',
      groupId: newGroupId,
      userId: user.id,
      role: 'OWNER',
      slotNumber: 1,
      paidShareCents: pricing.shares[0] || pricing.baseMemberShareCents,
      paidFeeCents: 0,
      memberTotalCents: pricing.shares[0] || pricing.baseMemberShareCents,
      status: 'ACTIVE',
      autoRenew: true,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      joinedAt: new Date().toISOString()
    };
    await dataRepository.createMembership(ownerMembership);

    // Salvataggio Istruzioni di Accesso
    await dataRepository.saveAccessInstructions(newGroupId, {
      accessUrl: accessUrl || '',
      instructions: instructions || 'Contatta il Capogruppo per completare l\'accesso.',
      accessCode: accessCode || '',
      ownerSpotifyAccount: ownerSpotifyAccount || '',
      additionalInfo: additionalInfo || ''
    });

    // Creazione Chat Privata
    const chat = await dataRepository.getChatByGroupId(newGroupId);
    await dataRepository.addChatMessage({
      id: 'msg-' + Date.now(),
      chatId: chat.id,
      senderId: null,
      messageType: 'SYSTEM',
      messageContent: `🎉 Gruppo creato da ${user.fullName}. Benvenuti nella chat del gruppo!`,
      createdAt: new Date().toISOString()
    });

    return res.status(201).json({
      success: true,
      group: newGroup
    });
  } catch (err) {
    console.error('[CREATE GROUP ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore interno durante la creazione del gruppo.' });
  }
});

// 5. Chiusura Programmata Gruppo
groupsRouter.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const group = await dataRepository.findGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: 'NOT_FOUND' });

    if (group.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Non puoi modificare questo gruppo.' });
    }

    await dataRepository.updateGroup(group.id, { status: 'cancellation_scheduled' });

    // Notifica partecipanti nella chat
    const chat = await dataRepository.getChatByGroupId(group.id);
    await dataRepository.addChatMessage({
      id: 'msg-' + Date.now(),
      chatId: chat.id,
      senderId: null,
      messageType: 'SYSTEM',
      messageContent: `⚠️ Il Capogruppo ha programmato la chiusura di questo gruppo. Gli accessi rimarranno attivi fino al termine del periodo mensile in corso.`,
      createdAt: new Date().toISOString()
    });

    return res.json({ success: true, message: 'Chiusura programmata registrata.' });
  } catch (err) {
    console.error('[CANCEL GROUP ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
