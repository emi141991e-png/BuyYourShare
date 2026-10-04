import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { P2pError } from '../services/p2pSubscription.js';
export function manualRoutes(service) {
  const router = express.Router();
  router.use(requireAuth);
  const handle = fn => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(e.status || 503).json({error:e instanceof P2pError ? e.message : 'CHAT_UNAVAILABLE',message:e instanceof P2pError ? e.message : 'Operazione non completata. Il messaggio e l’allegato restano disponibili: riprova.'}); } };
  router.get('/community',handle(async(req,res)=>res.json(service.community.list(req.user.id))));
  router.post('/community/issues',handle(async(req,res)=>res.json(await service.community.issue(req.user.id,req.body))));
  router.post('/community/watch',handle(async(req,res)=>res.json(await service.community.watch(req.user.id,req.body))));
  router.post('/groups/:id/requirements',handle(async(req,res)=>res.json(await service.community.updateRequirements(req.user.id,req.params.id,req.body))));
  router.get('/', handle(async (req, res) => { await service.reminders(); res.json({ requests: service.list(req.user.id), ownedGroups: service.ownedGroups(req.user.id) }); }));
  router.post('/groups/:id/request', handle(async (req, res) => { await service.request(req.user.id, req.params.id, req.body.slotNumber, req.body.requirementsAccepted); res.json({ success: true }); }));
  router.get('/:id/messages', handle(async (req, res) => res.json({ messages: service.chat(req.user.id, req.params.id) })));
  router.post('/:id/messages', handle(async (req, res) => { await service.send(req.user.id, req.params.id, req.body.content, req.body.clientMessageId, req.body.attachment); res.json({ success: true }); }));
  router.get('/:id/attachments/:messageId', handle(async(req,res)=>{res.set('Cache-Control','private, no-store');res.json(await service.attachment(req.user.id,req.params.id,req.params.messageId));}));
  router.post('/:id/read', handle(async (req, res) => { await service.markRead(req.user.id, req.params.id, req.body.lastMessageId); res.json({ success: true }); }));
  router.post('/:id/:action', handle(async (req, res) => { await service.action(req.user.id, req.params.id, req.params.action, req.body.periodEnd); res.json({ success: true }); }));
  return router;
}
