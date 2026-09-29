import express from 'express';
import { verifyBysBankRequest } from '../services/bysBankAdmin.js';
import { MarketplaceAdmin, marketplaceSnapshot } from '../services/marketplaceAdmin.js';
export function bysMarketplaceAdmin(subscriptions) {
  const router=express.Router(), service=new MarketplaceAdmin(subscriptions);
  router.use(async(req,res,next)=>{res.set('Cache-Control','no-store');try { req.bysAdminId=await verifyBysBankRequest((req.headers.authorization||'').replace(/^Bearer /,''),req.method,req.path,req.body,subscriptions.repo,undefined,'marketplace');next(); }catch {res.status(403).json({error:'Accesso amministrativo non autorizzato.'});}});
  router.get('/',(req,res)=>res.json(marketplaceSnapshot(subscriptions.repo.data)));
  router.post('/:kind/:id',async(req,res)=>{try {res.json(await service.change(req.params.kind,req.params.id,req.body,req.bysAdminId));}catch(e){res.status(e.status||503).json({error:e.message});}});
  return router;
}
