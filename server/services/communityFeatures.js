import {randomUUID} from 'node:crypto';
import {P2pError} from './p2pSubscription.js';
export function requirements(input){
 const out={};for(const [key,max] of [['country',80],['accessMethod',120],['eligibility',600]]){const v=input?.[key];if(typeof v!=='string'||!v.trim()||v.length>max)throw new P2pError('Completa paese, modalità di accesso e requisiti.',400);out[key]=v.trim();}return out;
}
export class CommunityFeatures{
 constructor(manual){this.m=manual;this.repo=manual.repo;}
 list(userId){return {issues:(this.repo.data.groupIssues||[]).filter(x=>x.userId===userId),watches:(this.repo.data.groupWatches||[]).filter(x=>x.userId===userId&&x.active)};}
 issue(userId,input){return this.m.exclusive(async()=>{
  const g=this.m.group(input.groupId);if(g.archivedAt&&g.ownerId!==userId&&!this.m.records().some(r=>r.groupId===g.id&&r.userId===userId))throw new P2pError('Gruppo non disponibile.',404);
  if(input.requestId){const r=this.m.authorized(input.requestId,userId);if(r.groupId!==g.id)throw new P2pError('Richiesta non valida.',400);}
  const text=String(input.description||'').trim();if(text.length<10||text.length>2000)throw new P2pError('Descrivi il problema in 10–2000 caratteri.',400);
  const issues=this.repo.data.groupIssues||=[];const old=issues.find(x=>x.userId===userId&&x.groupId===g.id&&x.status!=='resolved');if(old)return old;
  if(issues.filter(x=>x.userId===userId&&Date.parse(x.createdAt)>this.m.now()-86400000).length>=10)throw new P2pError('Troppe segnalazioni. Riprova domani.',429);
  const x={id:randomUUID(),userId,groupId:g.id,requestId:input.requestId||null,description:text,status:'open',createdAt:new Date(this.m.now()).toISOString()};issues.push(x);await this.repo.save();return x;
 });}
 watch(userId,input){return this.m.exclusive(async()=>{
  const service=String(input.service||'').trim();if(service.length<2||service.length>100)throw new P2pError('Indica il nome del servizio.',400);
  if(input.groupId)this.m.group(input.groupId);
  const rows=this.repo.data.groupWatches||=[];let w=rows.find(w=>w.userId===userId&&w.service.toLowerCase()===service.toLowerCase()&&(w.groupId||null)===(input.groupId||null));
  if(w){w.active=input.active!==false;w.notifiedAt=null;}else{if(rows.filter(w=>w.userId===userId&&w.active).length>=30)throw new P2pError('Puoi seguire al massimo 30 ricerche.',400);w={id:randomUUID(),userId,service,groupId:input.groupId||null,active:input.active!==false};rows.push(w);}await this.repo.save();return w;
 });}
 updateRequirements(userId,id,input){return this.m.exclusive(async()=>{const g=this.m.group(id);if(g.ownerId!==userId)throw new P2pError('FORBIDDEN',403);const previous=g.requirements;try{g.requirements=requirements(input);await this.repo.save();return g.requirements;}catch(e){g.requirements=previous;throw e;}});}
 checkWatches(){let changed=false;for(const w of this.repo.data.groupWatches||[]){if(!w.active)continue;const g=this.repo.data.groups.find(g=>!g.archivedAt&&g.ownerId!==w.userId&&(!w.groupId||w.groupId===g.id)&&String(g.customServiceName).toLowerCase().includes(w.service.toLowerCase())&&Array.from({length:g.totalSlots-g.ownerSlots},(_,i)=>g.ownerSlots+i+1).some(slot=>{try{this.m.slotFree(g,slot);return true;}catch{return false;}}));if(!g)continue;w.active=false;w.notifiedAt=new Date(this.m.now()).toISOString();(this.repo.data.notifications||=[]).push({id:'availability:'+randomUUID(),userId:w.userId,title:'Un posto disponibile',message:`C’è un posto nel gruppo ${g.customServiceName}. Controlla disponibilità e requisiti: il posto non è prenotato.`,actionUrl:'#gruppo-'+g.id,isRead:false,createdAt:w.notifiedAt});changed=true;}return changed;}
}
