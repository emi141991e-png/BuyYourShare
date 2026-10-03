import express from 'express';
import { requireAuth } from '../middleware/auth.js';
export function pushRoutes(service) {
  const router = express.Router();
  router.use(requireAuth, (req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });
  const handle = fn => async (req, res) => {
    try { await fn(req, res); } catch (e) { res.status(e.status || 503).json({ error: e.status ? e.message : 'PUSH_UNAVAILABLE' }); }
  };
  router.get('/config', handle(async (req, res) => res.json(service.config(req.user.id))));
  router.post('/subscribe', handle(async (req, res) => {
    if (req.body.consent !== true) return res.status(400).json({ error: 'PUSH_CONSENT_REQUIRED' });
    res.json(await service.subscribe(req.user.id, req.body.subscription, req.body.label));
  }));
  router.post('/:id/remove', handle(async (req, res) => { await service.remove(req.user.id, req.params.id); res.json({ success: true }); }));
  router.post('/:id/test', handle(async (req, res) => { res.status(202).json(await service.test(req.user.id, req.params.id)); service.kick(); }));
  return router;
}
