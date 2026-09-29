import { randomUUID } from 'node:crypto';
import { adminOverview } from './adminOverview.js';
import { paymentDestination } from './p2pManual.js';
import { P2pError } from './p2pSubscription.js';

export function marketplaceSnapshot(data) {
  const overview = adminOverview(data);
  const users = (data.users || []).map(u => ({ id:u.id, name:u.fullName || '', email:u.email || '', role:u.role, linkedToBys:!!u.bysUserId, bysUserId:u.bysUserId || null, suspended:!!u.isSuspended, archived:!!u.archivedAt, groups:(data.groups || []).filter(g=>g.ownerId===u.id).length }));
  const groups = (data.groups || []).map(g => ({ id:g.id, name:g.customServiceName, plan:g.planName || '', rules:g.rulesAndRequirements || '', status:g.status, ownerId:g.ownerId, owner:users.find(u=>u.id===g.ownerId)?.name || 'Capogruppo', totalSlots:g.totalSlots, amountCents:g.baseMemberShareCents, archived:!!g.archivedAt, paymentDestination:g.manualPaymentDestination || {}, participants:(data.p2pManualRequests || []).filter(r=>r.groupId===g.id && ['accepted','reported','confirmed'].includes(r.status)).length }));
  return { ...overview, users, groups, requests:overview.requests.map(r=>({...r,leader:groups.find(g=>g.id===r.groupId)?.owner || 'Capogruppo'})), audit:(data.marketplaceAdminAudit || []).slice(-300).reverse(), pendingBank:(data.p2pBankPayments || []).filter(p=>p.status==='reported').length };
}

export class MarketplaceAdmin {
  constructor(subscriptions) { this.s=subscriptions; this.repo=subscriptions.repo; }
  change(kind,id,input,actor) { return this.s.exclusive(async()=>{
    const reason=String(input.reason || '').trim();
    if (reason.length<5 || reason.length>500) throw new P2pError('Indica una motivazione da 5 a 500 caratteri.',400);
    const fields=['users','groups','memberships','p2pManualRequests','marketplaceAdminAudit','notifications','sessions'];
    const snapshot=Object.fromEntries(fields.map(k=>[k,structuredClone(this.repo.data[k])]));
    const d=this.repo.data, now=new Date().toISOString();
    const fail=(text)=>{throw new P2pError(text,409);};
    const text=(value,max=160)=>{if(typeof value!=='string'||!value.trim()||value.length>max) throw new P2pError('Testo non valido.',400);return value.trim();};
    let before, after;
    try {
      if(kind==='users') {
        const u=(d.users || []).find(u=>u.id===id); if(!u) fail('Utente non trovato.');
        if(u.role==='admin') fail('Gli account amministratori si gestiscono separatamente.');
        before={name:u.fullName,email:u.email,suspended:!!u.isSuspended,archived:!!u.archivedAt};
        if(input.action==='edit') {
          u.fullName=text(input.name);
          const email=text(input.email,254).toLowerCase();
          if(email!==u.email) {
            if(u.bysUserId) fail('Account collegato a BYS: modifica l’email dalla gestione utenti BYS.');
            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||(d.users || []).some(x=>x.id!==id&&x.email?.toLowerCase()===email)) fail('Email non valida o già utilizzata.');
            u.email=email; u.isEmailVerified=false;
          }
        } else if(input.action==='suspend'||input.action==='restore') {
          u.isSuspended=input.action==='suspend'; if(input.action==='restore') delete u.archivedAt;
        } else if(input.action==='archive') {
          if((d.p2pSubscriptions || []).some(s=>s.userId===id&&Date.parse(s.currentPeriodEnd)>Date.now())) fail('L’utente ha ancora un periodo BYS pagato. Puoi sospendere l’account per moderazione, conservando il periodo.');
          if((d.groups || []).some(g=>g.ownerId===id&&!['CLOSED','DRAFT'].includes(g.status))) fail('Chiudi prima i gruppi gestiti dall’utente.');
          if((d.p2pManualRequests || []).some(r=>r.userId===id&&(['accepted','reported'].includes(r.status)||(r.status==='confirmed'&&Date.parse(r.periodEnd)>Date.now())))) fail('Gestisci prima le partecipazioni e i periodi pagati.');
          if((d.p2pSubscriptions || []).some(s=>s.userId===id&&s.providerSubscriptionId&&!['CANCELLED','EXPIRED'].includes(s.providerStatus))) fail('Verifica prima la sottoscrizione PayPal esistente.');
          u.isSuspended=true;u.archivedAt=now;
        } else fail('Operazione non valida.');
        if(u.isSuspended || u.email!==before.email) d.sessions=(d.sessions || []).filter(s=>s.userId!==id);
        after={name:u.fullName,email:u.email,suspended:!!u.isSuspended,archived:!!u.archivedAt};
      } else if(kind==='groups') {
        const g=(d.groups || []).find(g=>g.id===id);if(!g) fail('Gruppo non trovato.');
        if ((input.action==='archive'||(input.action==='edit'&&['CLOSED','DRAFT'].includes(input.status))) && (d.p2pManualRequests || []).some(r=>r.groupId===id&&['accepted','reported'].includes(r.status))) fail('Prima della chiusura risolvi le prenotazioni e i pagamenti dichiarati con i partecipanti.');
        before={name:g.customServiceName,plan:g.planName,status:g.status,archived:!!g.archivedAt};
        if(input.action==='edit') {
          g.customServiceName=text(input.name);g.planName=text(input.plan);g.rulesAndRequirements=text(input.rules,2000);
          const status=input.status;
          if(!['DRAFT','PUBLISHED','FULL','CLOSED'].includes(status)) fail('Stato non valido.');
          const owner=(d.users || []).find(u=>u.id===g.ownerId);
          if(['PUBLISHED','FULL'].includes(status)&&(!owner||owner.isSuspended||g.archivedAt)) fail('Riattiva prima il capogruppo e il gruppo.');
          g.status=status;g.isPublished=['PUBLISHED','FULL'].includes(status);g.closedAt=status==='CLOSED'?now:null;
          if(input.paymentDestination) g.manualPaymentDestination=paymentDestination({paypalEmail:input.paymentDestination.paypalEmail,payoutIban:input.paymentDestination.iban,payoutLegalName:input.paymentDestination.accountHolder});
        } else if(input.action==='archive') {g.status='CLOSED';g.isPublished=false;g.archivedAt=now;g.closedAt=now;}
        else if(input.action==='restore') {delete g.archivedAt;g.status='DRAFT';g.isPublished=false;}
        else fail('Operazione non valida.');
        g.updatedAt=now;
        after={name:g.customServiceName,plan:g.planName,status:g.status,archived:!!g.archivedAt};
        const recipients=new Set([g.ownerId,...(d.p2pManualRequests || []).filter(r=>r.groupId===id&&!['canceled','rejected'].includes(r.status)).map(r=>r.userId)]);
        for(const userId of recipients) (d.notifications ||= []).push({id:randomUUID(),userId,title:'Aggiornamento gruppo',message:`BYS ha aggiornato il gruppo ${g.customServiceName}. ${reason}`,actionUrl:`#gruppo-${id}`,isRead:false,createdAt:now});
      } else if(kind==='requests') {
        const r=(d.p2pManualRequests || []).find(r=>r.id===id);if(!r) fail('Partecipazione non trovata.');
        if(input.action!=='cancel') fail('Operazione non valida.');
        if(r.status==='reported'||(r.periodEnd&&Date.parse(r.periodEnd)>Date.now())) fail('Non annullare pagamenti dichiarati o periodi già pagati: occorre risolvere prima con i partecipanti.');
        before={status:r.status};r.status='canceled';after={status:r.status};
        const m=(d.memberships || []).find(m=>m.id===r.membershipId);if(m)m.status='CANCELED';
        const g=(d.groups || []).find(g=>g.id===r.groupId);
        if(g)g.occupiedMemberSlots=(d.memberships || []).filter(m=>m.groupId===g.id&&m.role==='MEMBER'&&['ACTIVE','CANCELLATION_SCHEDULED'].includes(m.status)).length;
        for(const userId of [r.userId,g?.ownerId].filter(Boolean)) (d.notifications ||= []).push({id:randomUUID(),userId,title:'Partecipazione aggiornata',message:`BYS ha annullato la richiesta: ${reason}`,requestId:r.id,isRead:false,createdAt:now});
      } else fail('Risorsa non valida.');
      (d.marketplaceAdminAudit ||= []).push({id:randomUUID(),actor:`bys:${actor}`,kind,targetId:id,action:input.action,reason,before,after,createdAt:now});
      await this.repo.save();return {success:true};
    } catch(e) {for(const k of fields)d[k]=snapshot[k];throw e;}
  }); }
}
