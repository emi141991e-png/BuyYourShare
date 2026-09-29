import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { p2pError } from './p2p.js';
export function manualRoutes(service) {
  const router = express.Router();
  router.use(requireAuth);
  const handle = fn => async (req, res) => { try { await fn(req, res); } catch (e) { p2pError(res, e); } };
  router.get('/', handle(async (req, res) => { await service.reminders(); res.json({ requests: service.list(req.user.id), ownedGroups: service.ownedGroups(req.user.id) }); }));
  router.post('/groups/:id/request', handle(async (req, res) => { await service.request(req.user.id, req.params.id, req.body.slotNumber); res.json({ success: true }); }));
  router.get('/:id/messages', handle(async (req, res) => res.json({ messages: service.chat(req.user.id, req.params.id) })));
  router.post('/:id/messages', handle(async (req, res) => { await service.send(req.user.id, req.params.id, req.body.content); res.json({ success: true }); }));
  router.post('/:id/:action', handle(async (req, res) => { await service.action(req.user.id, req.params.id, req.params.action, req.body.periodEnd); res.json({ success: true }); }));
  return router;
}
