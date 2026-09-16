import express from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { P2pError, accessAllowed } from '../services/p2pSubscription.js';
import { allocateMoneySplit } from '../engine/MoneyEngine.js';
import { addOneMonth } from '../engine/DateEngine.js';

export function p2pError(res, error) {
  const code = error instanceof P2pError ? error.message : 'P2P_PROVIDER_UNAVAILABLE';
  return res.status(error.status || 503).json({ error: code,
    message: 'Operazione non completata. Controlla lo stato abbonamento; non avviare un secondo pagamento.' });
}
export function createP2pRoutes(service) {
  const router = express.Router();
  router.use(requireAuth);
  const handle = fn => async (req, res) => { try { await fn(req, res); } catch (e) { p2pError(res, e); } };
  router.get('/subscription', handle(async (req, res) => {
    let available = true, unavailableReason = null;
    try { service.ready(); } catch (e) { available = false; unavailableReason = e.message; }
    res.json({ subscription: service.view(req.user.id), available, unavailableReason });
  }));
  router.post('/subscription/start', handle(async (req, res) => res.json({ subscription: await service.start(req.user.id, req.body.role) })));
  router.post('/subscription/refresh', handle(async (req, res) => res.json({ subscription: await service.refresh(req.user.id) })));
  router.post('/subscription/upgrade', handle(async (req, res) => res.json({ subscription: await service.upgrade(req.user.id) })));
  router.post('/subscription/cancel', handle(async (req, res) => res.json({ subscription: await service.cancel(req.user.id) })));

  router.use((req, res, next) => {
    try {
      service.ready();
      if (!accessAllowed(service.find(req.user.id))) throw new P2pError('P2P_ACTIVE_SUBSCRIPTION_REQUIRED', 402);
      next();
    } catch (e) { p2pError(res, e); }
  });
  const repo = service.repo;
  router.get('/direct-memberships', handle(async (req, res) => {
    const ownerGroups = (repo.data.groups || []).filter(g => g.ownerId === req.user.id).map(g => g.id);
    const requests = (repo.data.p2pJoinRequests || []).filter(r => r.userId === req.user.id || ownerGroups.includes(r.groupId));
    const memberships = (repo.data.memberships || []).filter(m => m.paymentMethod === 'DIRECT' &&
      (m.userId === req.user.id || ownerGroups.includes(m.groupId)));
    res.json({ requests, memberships });
  }));
  router.post('/groups/:id/request', handle(async (req, res) => {
    const result = await service.exclusive(async () => {
      const group = await repo.findGroupById(req.params.id);
      if (!group || !['PUBLISHED', 'FULL', 'active', 'available'].includes(group.status)) throw new P2pError('GROUP_UNAVAILABLE');
      if (group.ownerId === req.user.id) throw new P2pError('OWNER_CANNOT_JOIN');
      const slot = Number(req.body.slotNumber);
      if (!Number.isInteger(slot) || slot <= group.ownerSlots || slot > group.totalSlots) throw new P2pError('INVALID_SLOT', 400);
      const occupied = repo.data.memberships.some(m => m.groupId === group.id && m.slotNumber === slot &&
        ['ACTIVE', 'CANCELLATION_SCHEDULED'].includes(m.status) && (m.paymentMethod !== 'DIRECT' || Date.parse(m.currentPeriodEnd) > Date.now()));
      if (occupied) throw new P2pError('SLOT_UNAVAILABLE');
      const all = repo.data.p2pJoinRequests ||= [];
      const existing = all.find(r => r.groupId === group.id && r.userId === req.user.id && r.status === 'pending');
      if (existing) return existing;
      const r = { id: randomUUID(), userId: req.user.id, memberName: req.user.fullName,
        groupId: group.id, slotNumber: slot, status: 'pending', createdAt: new Date().toISOString() };
      all.push(r); await repo.save(); return r;
    });
    res.json({ request: result, message: 'Concorda il pagamento direttamente con il capogruppo. BYS non incassa né distribuisce la quota.' });
  }));
  router.get('/groups/:id/direct-payment', handle(async (req, res) => {
    const group = await repo.findGroupById(req.params.id);
    if (!group) throw new P2pError('GROUP_NOT_FOUND', 404);
    const allowed = group.ownerId === req.user.id || (repo.data.p2pJoinRequests || []).some(r => r.groupId === group.id && r.userId === req.user.id) ||
      repo.data.memberships.some(m => m.groupId === group.id && m.userId === req.user.id);
    if (!allowed) throw new P2pError('FORBIDDEN', 403);
    const owner = await repo.findUserById(group.ownerId);
    res.json({ instructions: group.directPaymentInstructions || 'Contatta il capogruppo.', contactEmail: owner?.email || null,
      ownerName: owner?.fullName || 'Capogruppo', message: 'Pagamento diretto al capogruppo. BYS non incassa, custodisce o distribuisce queste somme.' });
  }));
  router.post('/requests/:id/confirm', handle(async (req, res) => {
    const membership = await service.exclusive(async () => {
      if (req.body.paymentReceived !== true) throw new P2pError('CONFIRM_DIRECT_PAYMENT_REQUIRED', 400);
      const r = (repo.data.p2pJoinRequests || []).find(r => r.id === req.params.id);
      const g = r && await repo.findGroupById(r.groupId);
      if (!g || g.ownerId !== req.user.id) throw new P2pError('FORBIDDEN', 403);
      if (r.status === 'confirmed') return repo.data.memberships.find(m => m.id === r.membershipId);
      if (r.status !== 'pending' || !['PUBLISHED', 'FULL', 'active', 'available'].includes(g.status)) throw new P2pError('REQUEST_UNAVAILABLE');
      if (!accessAllowed(service.find(r.userId))) throw new P2pError('MEMBER_SUBSCRIPTION_INACTIVE');
      if (repo.data.memberships.some(m => m.groupId === g.id && m.slotNumber === r.slotNumber &&
          ['ACTIVE', 'CANCELLATION_SCHEDULED'].includes(m.status) && (m.paymentMethod !== 'DIRECT' || Date.parse(m.currentPeriodEnd) > Date.now()))) throw new P2pError('SLOT_UNAVAILABLE');
      const start = new Date(), end = addOneMonth(start);
      const amount = allocateMoneySplit(g.realSubscriptionCostCents, g.totalSlots)[r.slotNumber - 1];
      const m = { id: randomUUID(), groupId: g.id, userId: r.userId, role: 'MEMBER', slotNumber: r.slotNumber,
        status: 'ACTIVE', paymentMethod: 'DIRECT', autoRenew: false, paidShareCents: amount, paidFeeCents: 0,
        memberTotalCents: amount, currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(), joinedAt: start.toISOString() };
      repo.data.memberships.push(m); r.status = 'confirmed'; r.membershipId = m.id;
      g.occupiedMemberSlots = repo.data.memberships.filter(m => m.groupId === g.id && m.role === 'MEMBER' && m.status === 'ACTIVE' && Date.parse(m.currentPeriodEnd) > Date.now()).length;
      await repo.save(); return m;
    });
    res.json({ membership });
  }));
  router.post('/requests/:id/cancel', handle(async (req, res) => {
    await service.exclusive(async () => {
      const r = (repo.data.p2pJoinRequests || []).find(r => r.id === req.params.id);
      const g = r && await repo.findGroupById(r.groupId);
      if (!r || (r.userId !== req.user.id && g?.ownerId !== req.user.id)) throw new P2pError('FORBIDDEN', 403);
      if (r.status === 'pending') r.status = 'canceled'; await repo.save();
    }); res.json({ success: true });
  }));
  return router;
}

export function requireP2p(service) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    try {
      service.ready();
      if (!accessAllowed(service.find(req.user.id))) return res.status(402).json({ error: 'P2P_ACTIVE_SUBSCRIPTION_REQUIRED', subscription: service.view(req.user.id) });
      next();
    } catch (e) { p2pError(res, e); }
  };
}
