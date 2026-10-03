import express from 'express';
import {verifyBysBankRequest} from '../services/bysBankAdmin.js';
export function bysPushRoutes(service){
 const router=express.Router();
 router.use(async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{
   const bysId=await verifyBysBankRequest((req.headers.authorization||'').replace(/^Bearer /,''),req.method,req.path,req.body,service.repo,undefined,'user-push');
   req.pushUser=(service.repo.data.users||[]).find(u=>u.bysUserId===bysId&&!u.archivedAt);
   if(!req.pushUser)return res.status(409).json({error:'MARKETPLACE_NOT_LINKED'});
   next();
  }catch{res.status(403).json({error:'UNAUTHORIZED'});}
 });
 const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status?e.message:'PUSH_UNAVAILABLE'});}};
 router.get('/config',handle(async(req,res)=>res.json(service.config(req.pushUser.id))));
 router.post('/subscribe',handle(async(req,res)=>{
  if(req.body.consent!==true)return res.status(400).json({error:'PUSH_CONSENT_REQUIRED'});
  res.json(await service.subscribe(req.pushUser.id,req.body.subscription,req.body.label,'bys'));
 }));
 router.post('/:id/remove',handle(async(req,res)=>{await service.remove(req.pushUser.id,req.params.id);res.json({success:true});}));
 router.post('/:id/test',handle(async(req,res)=>{res.json(await service.test(req.pushUser.id,req.params.id));service.kick();}));
 return router;
}
