import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { bankCode } from '../services/p2pBank.js';
import { verifyBysBankRequest } from '../services/bysBankAdmin.js';

export const bysBankAdminRouter = express.Router();
bysBankAdminRouter.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try {
    req.bysAdminId = await verifyBysBankRequest((req.headers.authorization || '').replace(/^Bearer /, ''), req.method, req.path, req.body, dataRepository);
    next();
  } catch { res.status(403).json({ error: 'Collegamento amministrativo non autorizzato.' }); }
});
bysBankAdminRouter.get('/', (req, res) => {
  res.json({ payments: [...req.app.locals.p2pBank.records().map(p=>({...p,paymentMethod:'BANK'})), ...req.app.locals.p2pGooglePay.records().map(p=>({...p,paymentMethod:p.paymentMethod||'GOOGLE_PAY',code:bankCode(p.userId),reportedAt:p.createdAt,confirmedAt:p.paidAt}))].map(p => {
    const user = dataRepository.data.users.find(u => u.id === p.userId);
    return { ...p, name: user?.fullName || 'Utente', email: user?.email || '' };
  }) });
});
bysBankAdminRouter.post('/report-by-code', async (req, res) => {
  const matches = dataRepository.data.users.filter(u => bankCode(u.id) === String(req.body.code || '').trim().toUpperCase());
  if (matches.length !== 1) return res.status(404).json({ error: 'Codice utente non trovato o ambiguo.' });
  try { res.json(await req.app.locals.p2pBank.report(matches[0].id, req.body.planCode)); }
  catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});
bysBankAdminRouter.post('/:id/confirm', async (req, res) => {
  try { res.json(await req.app.locals.p2pBank.confirmFromBys(req.params.id, req.bysAdminId, req.body.reference)); }
  catch (e) { res.status(e.status || 503).json({ error: e.message }); }
});
