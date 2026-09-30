import express from 'express';
import {LeaderRatings} from '../services/leaderRatings.js';
import { requireAuth } from '../middleware/auth.js';
import { P2pError, accessAllowed } from '../services/p2pSubscription.js';

export function p2pError(res, error) {
  const code = error instanceof P2pError || error.message === 'INVALID_ACCESS_PLAN' ? error.message : 'P2P_PROVIDER_UNAVAILABLE';
  return res.status(error.status || 503).json({ error: code,
    message: 'Operazione non completata. Controlla lo stato abbonamento; non avviare un secondo pagamento.' });
}
export function createP2pRoutes(service, quota) {
  const router = express.Router();
  router.use(requireAuth);
  const handle = fn => async (req, res) => { try { await fn(req, res); } catch (e) { p2pError(res, e); } };
  const paypalAvailable = () => process.env.P2P_PAYPAL_CHECKOUT_ENABLED === 'true';
  const ratings=new LeaderRatings(service);
  router.get('/leaders/:id/rating',handle(async(req,res)=>res.json(ratings.view(req.user.id,req.params.id))));
  router.post('/leaders/:id/rating',handle(async(req,res)=>res.json(await ratings.save(req.user.id,req.params.id,req.body.stars))));
  router.use((req, res, next) => {
    if (req.method === 'POST' && ['/subscription/start', '/subscription/sdk-start'].includes(req.path) && !paypalAvailable()) {
      return res.status(503).json({ error: 'P2P_PAYPAL_TEMPORARILY_DISABLED', message: 'Per attivare l’accesso usa il bonifico.' });
    }
    next();
  });
  router.get('/bank', handle(async (req, res) => res.json(req.app.locals.p2pBank.view(req.user.id))));
  router.post('/bank/report', handle(async (req, res) => res.json(await req.app.locals.p2pBank.report(req.user.id, req.body.planCode))));
  router.get('/google-pay/config', handle(async (req, res) => res.json(req.app.locals.p2pGooglePay.config())));
  router.post('/google-pay/orders', handle(async (req, res) => res.json(await req.app.locals.p2pGooglePay.create(req.user.id, req.body.planCode))));
  router.post('/google-pay/orders/:id/capture', handle(async (req, res) => res.json(await req.app.locals.p2pGooglePay.capture(req.user.id, req.params.id))));
  router.get('/subscription', handle(async (req, res) => {
    let available = true, unavailableReason = null;
    try { service.ready(); } catch (e) { available = false; unavailableReason = e.message; }
    const subscription = service.view(req.user.id);
    if (!paypalAvailable()) subscription.approvalUrl = null;
    res.json({ subscription, available, unavailableReason, paypalAvailable: paypalAvailable(),
      checkout: paypalAvailable() ? service.provider.checkoutConfig?.() || { enabled: false } : { enabled: false } });
  }));
  router.post('/subscription/sdk-start', handle(async (req, res) => {
    if (!service.provider.checkoutConfig?.().enabled) throw new P2pError('P2P_SDK_DISABLED', 404);
    await service.start(req.user.id, service.roleFor(req.user.id));
    const s = service.find(req.user.id);
    if (s?.providerStatus !== 'APPROVAL_PENDING' || !s.providerSubscriptionId) throw new P2pError('P2P_SDK_NOT_APPROVABLE');
    res.json({ subscriptionId: s.providerSubscriptionId });
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
  router.get('/payee', handle(async (req, res) => res.json(quota.view(req.user.id))));
  router.post('/payee/connect', handle(async (req, res) => res.json(await quota.onboard(req.user.id, req.body.email, req.body.consent))));
  router.post('/payee/refresh', handle(async (req, res) => res.json(await quota.refreshPayee(req.user.id))));
  router.get('/quota-payments', handle(async (req, res) => res.json({ payments: quota.payments().filter(p => p.userId === req.user.id || p.ownerId === req.user.id).map(p => quota.publicPayment(p)) })));
  router.post('/groups/:id/request', (req, res) => res.status(410).json({ error: 'USE_MANUAL_REQUEST' }));
  router.post('/requests/:id/order', (req, res) => res.status(410).json({ error: 'USE_MANUAL_REQUEST' }));
  router.post('/quota-payments/:id/refresh', handle(async (req, res) => res.json({ payment: await quota.refresh(req.user.id, req.params.id) })));
  router.get('/groups/:id/direct-payment', (req, res) => res.status(410).json({ error: 'PAYPAL_CHECKOUT_REQUIRED' }));
  router.post('/requests/:id/confirm', (req, res) => res.status(410).json({ error: 'PAYPAL_VERIFIED_CAPTURE_REQUIRED' }));
  router.post('/requests/:id/cancel', handle(async (req, res) => { await quota.cancel(req.user.id, req.params.id); res.json({ success: true }); }));
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
