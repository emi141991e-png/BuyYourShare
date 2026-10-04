import express from 'express';
import {createHash,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function backupAuthorized(header,secret=process.env.BACKUP_EXPORT_TOKEN){
 if(!secret||secret.length<40||typeof header!=='string')return false;
 return timingSafeEqual(createHash('sha256').update(header).digest(),createHash('sha256').update('Bearer '+secret).digest());
}
export async function* backupRecords(snapshot,directory){
 const emit=(name,bytes)=>JSON.stringify({type:'file',path:name,data:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')})+'\n';
 yield JSON.stringify({type:'start',version:1,createdAt:new Date().toISOString()})+'\n';
 const db=Buffer.from(JSON.stringify(snapshot));
 if(db.length>64*1024*1024)throw new Error('BACKUP_DATABASE_LIMIT');
 yield emit('database.json',db);let count=1;
 // VAPID keys are needed to keep existing devices subscribed after recovery.
 yield emit('push-vapid.json',await fs.readFile(path.join(directory,'push-vapid.json')));count++;
 const ids=new Set((snapshot.p2pPrivateMessages||[]).filter(m=>m.attachment).map(m=>m.attachment.id+(m.attachment.mime==='application/pdf'?'.pdf':'.jpg')));
 for(const id of ids){
  if(!/^[a-f0-9-]{36}\.(jpg|pdf)$/.test(id))throw new Error('BACKUP_INVALID_ATTACHMENT');
  const name='private-chat-attachments/'+id;
  yield emit(name,await fs.readFile(path.join(directory,name)));count++;
 }
 yield JSON.stringify({type:'end',files:count})+'\n';
}
export function backupRouter(subscriptions){
 const router=express.Router();let exporting=false;
 router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');if(!backupAuthorized(req.headers.authorization))return res.status(403).json({error:'FORBIDDEN'});next();});
 router.get('/export',async(req,res)=>{
  if(exporting)return res.status(409).json({error:'BACKUP_BUSY'});
  exporting=true;
  try{
   const snapshot=await subscriptions.exclusive(async()=>structuredClone(subscriptions.repo.data));
   const directory=process.env.DATA_DIR||(process.env.DATABASE_PATH?path.dirname(process.env.DATABASE_PATH):fileURLToPath(new URL('../data/',import.meta.url)));
   res.type('application/x-ndjson');
   for await(const record of backupRecords(snapshot,directory)){
    if(res.destroyed)break;
    await new Promise((resolve,reject)=>res.write(record,error=>error?reject(error):resolve()));
   }
   res.end();
  }catch{if(res.headersSent)res.destroy();else res.status(503).json({error:'BACKUP_EXPORT_FAILED'});}
  finally{exporting=false;}
 });
 router.post('/status',async(req,res)=>{
  const b=req.body;
  if(!['success','failed'].includes(b?.status))return res.status(400).json({error:'INVALID_STATUS'});
  try{await subscriptions.exclusive(async()=>{
   const old=subscriptions.repo.data.backupStatus;
   subscriptions.repo.data.backupStatus={status:b.status,checkedAt:new Date().toISOString(),lastSuccessAt:b.status==='success'?new Date().toISOString():old?.lastSuccessAt||null,restoreVerified:b.status==='success'&&b.restoreVerified===true,retentionDays:30};
   try{await subscriptions.repo.save();}catch(e){subscriptions.repo.data.backupStatus=old;throw e;}
  });res.json({ok:true});}catch{res.status(503).json({error:'BACKUP_STATUS_SAVE_FAILED'});}
 });
 return router;
}
