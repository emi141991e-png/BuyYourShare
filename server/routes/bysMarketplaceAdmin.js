import express from 'express';
import { verifyBysBankRequest } from '../services/bysBankAdmin.js';
import { MarketplaceAdmin, marketplaceSnapshot } from '../services/marketplaceAdmin.js';
export function bysMarketplaceAdmin(subscriptions) {
  const router=express.Router(), service=new MarketplaceAdmin(subscriptions);
  router.use(async(req,res,next)=>{res.set('Cache-Control','no-store');try { req.bysAdminId=await verifyBysBankRequest((req.headers.authorization||'').replace(/^Bearer /,''),req.method,req.path,req.body,subscriptions.repo,undefined,req.path==='/account'?'marketplace-account':'marketplace');next(); }catch {res.status(403).json({error:'Accesso amministrativo non autorizzato.'});}});
  router.get('/account',(req,res)=>{
    const d=subscriptions.repo.data;
    const u=(d.users||[]).find(u=>u.bysUserId===req.bysAdminId&&!u.archivedAt);
    if(!u)return res.json({linked:false,groups:[],participations:[],subscription:null});
    const brief=g=>({id:g.id,name:g.customServiceName,plan:g.planName,status:g.status});
    const groups=(d.groups||[]).filter(g=>g.ownerId===u.id&&!g.archivedAt).map(brief);
    const participations=(d.p2pManualRequests||[]).filter(r=>r.userId===u.id).map(r=>{
      const g=(d.groups||[]).find(g=>g.id===r.groupId);
      return {id:r.id,status:r.status,group:g?brief(g):null};
    }).filter(r=>r.group);
    const v=subscriptions.view(u.id);
    res.json({linked:true,groups,participations,subscription:{active:v.accessAllowed,until:v.currentPeriodEnd}});
  });
  router.get('/',(req,res)=>res.json(marketplaceSnapshot(subscriptions.repo.data)));
  router.post('/:kind/:id',async(req,res)=>{try {res.json(await service.change(req.params.kind,req.params.id,req.body,req.bysAdminId));}catch(e){res.status(e.status||503).json({error:e.message});}});
  return router;
}
