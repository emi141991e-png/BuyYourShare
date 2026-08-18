/**
 * BuyYourShare - Server Groups Routes
 * Macchina a stati rigorosa (DRAFT, PAYOUT_NOT_READY, PUBLISHED, FULL, CLOSED)
 * e sanitizzazione pubblica della privacy.
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';
import { calculatePricingBreakdown, getGroupSlotsBreakdown } from '../engine/MoneyEngine.js';
import { DEFAULT_PLATFORM_FEE_CENTS } from '../engine/FeeEngine.js';

export const groupsRouter = express.Router();

/**
 * Sanitizza le informazioni del gruppo per il catalogo pubblico.
 * NON restituisce MAI: IBAN, email privata, PayPal payout email, credenziali, link/istruzioni di accesso, inviteCode, account Stripe.
 */
function sanitizeGroupForPublic(group, ownerUser) {
  const isFull = (group.occupiedMemberSlots || 0) >= (group.availableSlots || 1);
  let computedStatus = group.status;
  if (group.status === 'PUBLISHED' || group.status === 'active' || group.status === 'available') {
    computedStatus = isFull ? 'FULL' : 'PUBLISHED';
  }

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
    groupType: group.groupType || 'public',
    status: computedStatus,
    rulesAndRequirements: group.rulesAndRequirements || '',
    description: group.description || '',
    createdAt: group.createdAt,
    publishedAt: group.publishedAt || null,
    owner: ownerUser ? {
      id: ownerUser.id,
      fullName: ownerUser.fullName,
      isVerified: !!ownerUser.isVerified
    } : null
  };
}

// 1. Catalogo Gruppi Pubblici (Mostra ESCLUSIVAMENTE gruppi realmente PUBLISHED / FULL)
groupsRouter.get('/', async (req, res) => {
  try {
    const { serviceId, search } = req.query;
    const rawGroups = await dataRepository.getGroups({ serviceId, search });
    const memberships = await dataRepository.getMemberships({ status: 'ACTIVE' });
    const users = dataRepository.data.users;

    // Filtro rigoroso: visualizza SOLO gruppi in stato PUBLISHED o FULL
    const publishedGroups = rawGroups.filter(g => {
      const isDraftOrHidden = g.status === 'DRAFT' || g.status === 'PAYOUT_NOT_READY' || g.status === 'CLOSED' || g.status === 'cancellation_scheduled';
      const isPublished = g.status === 'PUBLISHED' || g.status === 'FULL' || g.status === 'active' || g.status === 'available';
      return isPublished && !isDraftOrHidden;
    });

    const result = publishedGroups.map(g => {
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

// 2. I Miei Gruppi Creati (Visualizzabile dal Capogruppo autenticato, inclusi DRAFT)
groupsRouter.get('/my', requireAuth, async (req, res) => {
  try {
    const rawGroups = await dataRepository.getGroups({ ownerId: req.user.id });
    const memberships = await dataRepository.getMemberships();
    const users = dataRepository.data.users;

    const result = rawGroups.map(g => {
      const safe = sanitizeGroupForPublic(g, req.user);
      safe.realStatus = g.status; // Mantiene lo stato reale (es. DRAFT / PAYOUT_NOT_READY) per l'owner
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

// 3. Dettaglio Singolo Gruppo (Con protezione DRAFT e CLOSED da accessi non autorizzati)
groupsRouter.get('/:id', async (req, res) => {
  try {
    const group = await dataRepository.findGroupById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Gruppo non trovato.' });
    }

    // Se il gruppo è in DRAFT, PAYOUT_NOT_READY o CLOSED, può vederlo SOLO il Capogruppo proprietario
    const isRestricted = ['DRAFT', 'PAYOUT_NOT_READY', 'CLOSED', 'cancellation_scheduled'].includes(group.status);
    if (isRestricted) {
      if (!req.user || req.user.id !== group.ownerId) {
        return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Gruppo non pubblicato o non disponibile.' });
      }
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

// 4. Creazione Nuovo Gruppo (Inizialmente salvato in stato DRAFT o PAYOUT_NOT_READY)
groupsRouter.post('/', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const conn = await dataRepository.findConnectedAccountByUserId(user.id);

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
      additionalInfo,
      publishImmediately
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

    // Verifica prerequisiti payout (Stripe Connect attivo o PayPal Payout configurato)
    const hasStripePayout = conn && conn.payoutsEnabled && conn.chargesEnabled && conn.onboardingStatus === 'completed';
    const hasPaypalPayout = !!(user.paypalPayoutEmail && user.paypalPayoutEmail.includes('@'));
    const isPayoutReady = hasStripePayout || hasPaypalPayout;

    let initialStatus = 'DRAFT';
    if (!isPayoutReady) {
      initialStatus = 'PAYOUT_NOT_READY';
    } else if (publishImmediately) {
      initialStatus = 'PUBLISHED';
    }

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
      status: initialStatus,
      isPublished: initialStatus === 'PUBLISHED',
      publishedAt: initialStatus === 'PUBLISHED' ? new Date().toISOString() : null,
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
      group: sanitizeGroupForPublic(newGroup, user),
      status: newGroup.status,
      isPayoutReady: isPayoutReady
    });
  } catch (err) {
    console.error('[CREATE GROUP ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Errore interno durante la creazione del gruppo.' });
  }
});

// 5. Pubblicazione Gruppo nel Marketplace (Transizione da DRAFT a PUBLISHED)
groupsRouter.post('/:id/publish', requireAuth, async (req, res) => {
  try {
    const group = await dataRepository.findGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: 'NOT_FOUND', message: 'Gruppo non trovato.' });

    if (group.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Non hai i permessi per pubblicare questo gruppo.' });
    }

    const conn = await dataRepository.findConnectedAccountByUserId(req.user.id);
    const hasStripePayout = conn && conn.payoutsEnabled && conn.chargesEnabled && conn.onboardingStatus === 'completed';
    const hasPaypalPayout = !!(req.user.paypalPayoutEmail && req.user.paypalPayoutEmail.includes('@'));

    if (!hasStripePayout && !hasPaypalPayout) {
      return res.status(403).json({
        error: 'PAYOUT_NOT_READY',
        message: 'Prima di pubblicare il gruppo, configura il tuo IBAN (Stripe Connect) o la tua email PayPal per ricevere le quote mensili.'
      });
    }

    await dataRepository.updateGroup(group.id, {
      status: 'PUBLISHED',
      isPublished: true,
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const updated = await dataRepository.findGroupById(group.id);
    return res.json({
      success: true,
      message: 'Gruppo pubblicato con successo nel Marketplace!',
      group: sanitizeGroupForPublic(updated, req.user)
    });
  } catch (err) {
    console.error('[PUBLISH GROUP ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 6. Chiusura Programmata Gruppo (Transizione a CLOSED)
groupsRouter.post('/:id/cancel', requireAuth, async (req, res) => {
  try {
    const group = await dataRepository.findGroupById(req.params.id);
    if (!group) return res.status(404).json({ error: 'NOT_FOUND' });

    if (group.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Non puoi modificare questo gruppo.' });
    }

    await dataRepository.updateGroup(group.id, {
      status: 'CLOSED',
      isPublished: false,
      closedAt: new Date().toISOString()
    });

    const chat = await dataRepository.getChatByGroupId(group.id);
    await dataRepository.addChatMessage({
      id: 'msg-' + Date.now(),
      chatId: chat.id,
      senderId: null,
      messageType: 'SYSTEM',
      messageContent: `⚠️ Il Capogruppo ha chiuso questo gruppo. Gli accessi rimarranno attivi fino al termine del periodo mensile in corso.`,
      createdAt: new Date().toISOString()
    });

    return res.json({ success: true, message: 'Gruppo chiuso con successo.' });
  } catch (err) {
    console.error('[CANCEL GROUP ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
