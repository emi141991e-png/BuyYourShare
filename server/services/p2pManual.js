import { randomUUID } from 'node:crypto';
import { P2pError, accessAllowed } from './p2pSubscription.js';
import { addOneMonth } from '../engine/DateEngine.js';
import { allocateMoneySplit } from '../engine/MoneyEngine.js';

export function paymentDestination(body) {
  const email = String(body.paypalEmail || '').trim().toLowerCase();
  const iban = String(body.payoutIban || '').replace(/\s/g, '').toUpperCase();
  const name = String(body.payoutLegalName || '').trim();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new P2pError('INVALID_PAYPAL_EMAIL', 400);
  if (iban) {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban) || !name || name.length > 160) throw new P2pError('INVALID_IBAN', 400);
    const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
    let remainder = 0;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
    if (remainder !== 1) throw new P2pError('INVALID_IBAN', 400);
  }
  if (!email && !iban) throw new P2pError('PAYMENT_DESTINATION_REQUIRED', 400);
  return { paypalEmail: email, iban, accountHolder: name };
}

// One process, same serialization queue as platform billing. No provider writes.
export class P2pManual {
  constructor(subscriptions, now = () => Date.now()) { this.subscriptions = subscriptions; this.repo = subscriptions.repo; this.now = now; }
  records() { return this.repo.data.p2pManualRequests ||= []; }
  avatar(id) {const u=(this.repo.data.users||[]).find(u=>u.id===id);return u?.bysUserId?`https://buyyourshare.it/api/profile-photo/${encodeURIComponent(u.bysUserId)}`:null;}
  exclusive(fn) { return this.subscriptions.exclusive(async () => {
    // Restore only collections owned by this workflow when an atomic save fails.
    const fields = ['p2pManualRequests', 'p2pPrivateMessages', 'p2pManualConfirmations', 'notifications', 'memberships'];
    const snapshot = Object.fromEntries(fields.map(key => [key, structuredClone(this.repo.data[key])]));
    const occupancy = this.repo.data.groups.map(g => [g.id, g.occupiedMemberSlots]);
    try { return await fn(); } catch (e) {
      for (const key of fields) if (JSON.stringify(this.repo.data[key]) !== JSON.stringify(snapshot[key])) this.repo.data[key] = snapshot[key];
      for (const [id, count] of occupancy) { const g = this.repo.data.groups.find(g => g.id === id); if (g) g.occupiedMemberSlots = count; }
      throw e;
    }
  }); }
  active(id) { if (!accessAllowed(this.subscriptions.find(id), this.now())) throw new P2pError('P2P_ACTIVE_SUBSCRIPTION_REQUIRED', 402); }
  group(id) { const g = this.repo.data.groups.find(g => g.id === id); if (!g) throw new P2pError('GROUP_NOT_FOUND', 404); return g; }
  authorized(id, userId) {
    const r = this.records().find(r => r.id === id);
    if (!r || (r.userId !== userId && this.group(r.groupId).ownerId !== userId)) throw new P2pError('FORBIDDEN', 403);
    return r;
  }
  notify(userId, key, message, requestId) {
    const notifications = this.repo.data.notifications ||= [];
    if (notifications.some(n => n.id === key)) return;
    notifications.push({ id: key, userId, title: 'Quota del gruppo', message, requestId, isRead: false, createdAt: new Date(this.now()).toISOString() });
  }
  message(r, text, senderId = null) {
    (this.repo.data.p2pPrivateMessages ||= []).push({ id: randomUUID(), requestId: r.id, senderId, messageContent: text, createdAt: new Date(this.now()).toISOString() });
  }
  list(userId) {
    return this.records().filter(r => this.repo.data.groups.some(g => g.id === r.groupId && (r.userId === userId || g.ownerId === userId))).map(r => ({ ...r,
      groupName: this.group(r.groupId).customServiceName, groupStatus: this.group(r.groupId).status, ownerId: this.group(r.groupId).ownerId,
      memberName: (this.repo.data.users || []).find(u => u.id === r.userId)?.fullName || 'Membro',
      memberAvatar: this.avatar(r.userId), ownerAvatar: this.avatar(this.group(r.groupId).ownerId),
      ownerName: (this.repo.data.users || []).find(u => u.id === this.group(r.groupId).ownerId)?.fullName || 'Capogruppo',
      unreadMessages: (this.repo.data.p2pPrivateMessages || []).filter(m => m.requestId === r.id).slice(r.chatReadCount?.[userId] || 0).filter(m => m.senderId && m.senderId !== userId).length,
      paymentDestination: ['accepted', 'reported', 'confirmed'].includes(r.status) ? r.destination : undefined, destination: undefined }));
  }
  ownedGroups(userId) {
    return this.repo.data.groups.filter(g => g.ownerId === userId).map(g => ({
      id: g.id, ownerId: g.ownerId, customServiceName: g.customServiceName, status: g.status,
    }));
  }
  slotFree(g, slot, exceptId) {
    if (!['PUBLISHED', 'FULL', 'active', 'available'].includes(g.status) || !Number.isInteger(slot) || slot <= g.ownerSlots || slot > g.totalSlots) throw new P2pError('SLOT_UNAVAILABLE');
    if ((this.repo.data.memberships || []).some(m => m.groupId === g.id && m.slotNumber === slot && ['ACTIVE', 'CANCELLATION_SCHEDULED'].includes(m.status) && (m.paymentProvider === 'MANUAL' || Date.parse(m.currentPeriodEnd) > this.now()))) throw new P2pError('SLOT_RESERVED');
    if (this.records().some(r => r.id !== exceptId && r.groupId === g.id && r.slotNumber === slot && ['accepted', 'reported', 'confirmed'].includes(r.status))) throw new P2pError('SLOT_RESERVED');
    if ((this.repo.data.p2pQuotaPayments || []).some(p => p.groupId === g.id && p.slotNumber === slot && !['failed', 'canceled', 'refunded', 'reversed'].includes(p.status) && (p.status !== 'completed' || Date.parse(p.periodEnd) > this.now()))) throw new P2pError('SLOT_RESERVED');
  }
  request(userId, groupId, slot) { return this.exclusive(async () => {
    this.subscriptions.ready?.(); this.active(userId); const g = this.group(groupId);
    if (g.ownerId === userId) throw new P2pError('OWN_GROUP');
    if (!g.manualPaymentDestination) throw new P2pError('PAYMENT_DESTINATION_REQUIRED');
    const previous = this.records().find(r => r.groupId === groupId && r.userId === userId && !['canceled', 'rejected'].includes(r.status));
    if (previous) { await this.repo.save(); return previous; }
    this.slotFree(g, Number(slot));
    const r = { id: randomUUID(), userId, groupId, slotNumber: Number(slot), status: 'pending', amountCents: allocateMoneySplit(g.realSubscriptionCostCents, g.totalSlots)[Number(slot) - 1], createdAt: new Date(this.now()).toISOString() };
    this.records().push(r); this.message(r, 'Richiesta inviata. Attendi l’accettazione prima di pagare.');
    this.notify(g.ownerId, `request:${r.id}`, 'Nuova richiesta di partecipazione: apri la chat privata.', r.id);
    await this.repo.save(); return r;
  }); }
  action(userId, id, action, periodEnd) { return this.exclusive(async () => {
    const r = this.authorized(id, userId), g = this.group(r.groupId), owner = g.ownerId === userId;
    if (action === 'accept') {
      if (!owner || r.status !== 'pending') throw new P2pError('INVALID_TRANSITION');
      this.active(userId); this.active(r.userId); this.slotFree(g, r.slotNumber, r.id);
      r.destination = structuredClone(g.manualPaymentDestination); r.status = 'accepted';
      r.reservedUntil = new Date(this.now() + 48 * 3600000).toISOString();
    } else if (action === 'report') {
      if (owner || !['accepted', 'confirmed', 'reported'].includes(r.status)) throw new P2pError('INVALID_TRANSITION');
      if (r.status === 'reported') { await this.repo.save(); return r; }
      if (r.status === 'accepted' && Date.parse(r.reservedUntil) <= this.now()) throw new P2pError('RESERVATION_EXPIRED');
      if (r.status === 'confirmed' && Date.parse(r.periodEnd) - this.now() > 3 * 86400000) throw new P2pError('RENEWAL_NOT_DUE');
      r.status = 'reported'; r.reportedAt = new Date(this.now()).toISOString();
    } else if (action === 'confirm') {
      if (!owner) throw new P2pError('FORBIDDEN', 403);
      if (r.status === 'confirmed') { await this.repo.save(); return r; }
      if (r.status !== 'reported' || (r.periodEnd || null) !== (periodEnd || null)) throw new P2pError('INVALID_TRANSITION');
      let m = (this.repo.data.memberships ||= []).find(m => m.id === r.membershipId);
      const start = new Date(Math.max(this.now(), Date.parse(r.periodEnd) || 0));
      const end = addOneMonth(start).toISOString();
      if (!m) {
        this.slotFree(g, r.slotNumber, r.id);
        m = { id: randomUUID(), groupId: g.id, userId: r.userId, slotNumber: r.slotNumber, role: 'MEMBER', paymentMethod: 'DIRECT', paymentProvider: 'MANUAL', autoRenew: false, paidFeeCents: 0, joinedAt: start.toISOString() };
        this.repo.data.memberships.push(m); r.membershipId = m.id;
      }
      Object.assign(m, { status: 'ACTIVE', currentPeriodStart: start.toISOString(), currentPeriodEnd: end, paidShareCents: r.amountCents, memberTotalCents: r.amountCents });
      r.periodEnd = end; r.status = 'confirmed';
      (this.repo.data.p2pManualConfirmations ||= []).push({ id: randomUUID(), requestId: id, confirmedBy: userId, confirmedAt: new Date(this.now()).toISOString(), periodEnd: end, amountCents: r.amountCents });
    } else if (action === 'cancel') {
      // A reported transfer must be reconciled in chat; never release its slot on timeout.
      if (!['pending', 'accepted', 'confirmed'].includes(r.status)) throw new P2pError('PAYMENT_REVIEW_REQUIRED');
      if (r.status === 'confirmed' && Date.parse(r.periodEnd) > this.now()) throw new P2pError('PAID_PERIOD_NOT_ENDED');
      r.status = 'canceled';
      const m = (this.repo.data.memberships || []).find(m => m.id === r.membershipId); if (m) m.status = 'CANCELED';
    } else throw new P2pError('INVALID_ACTION', 400);
    const labels = { accept: 'Richiesta accettata. Posto riservato per 48 ore: puoi pagare direttamente al capogruppo.', report: 'Il membro dichiara di aver pagato. Il capogruppo deve verificare l’accredito.', confirm: 'Il capogruppo ha confermato l’accredito della quota.', cancel: 'Partecipazione annullata.' };
    g.occupiedMemberSlots = (this.repo.data.memberships || []).filter(m => m.groupId === g.id && m.role === 'MEMBER' && ['ACTIVE', 'CANCELLATION_SCHEDULED'].includes(m.status) && (m.paymentProvider === 'MANUAL' || Date.parse(m.currentPeriodEnd) > this.now())).length;
    this.message(r, labels[action]); this.notify(owner ? r.userId : g.ownerId, `${action}:${id}:${r.periodEnd || r.reportedAt || ''}`, labels[action], id);
    await this.repo.save(); return r;
  }); }
  chat(userId, id) { const r = this.authorized(id, userId); return (this.repo.data.p2pPrivateMessages || []).filter(m => m.requestId === r.id); }
  markRead(userId, id, lastMessageId) { return this.exclusive(async () => {
    const r = this.authorized(id, userId);
    const messages = (this.repo.data.p2pPrivateMessages || []).filter(m => m.requestId === id);
    const count = messages.findIndex(m => m.id === lastMessageId) + 1;
    if (!count || (r.chatReadCount?.[userId] || 0) >= count) return;
    (r.chatReadCount ||= {})[userId] = count;
    const readIds=new Set(messages.slice(0,count).map(m=>m.id));
    for(const n of this.repo.data.notifications||[])if(n.userId===userId&&n.requestId===id&&n.id.startsWith('chat:')&&readIds.has(n.messageId))n.isRead=true;
    await this.repo.save();
  }); }
  send(userId, id, content, clientMessageId) { return this.exclusive(async () => {
    const r = this.authorized(id, userId);
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) throw new P2pError('INVALID_MESSAGE', 400);
    if (clientMessageId && (typeof clientMessageId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(clientMessageId))) throw new P2pError('INVALID_MESSAGE', 400);
    if (clientMessageId && (this.repo.data.p2pPrivateMessages || []).some(m => m.requestId === id && m.senderId === userId && m.clientMessageId === clientMessageId)) return;
    this.message(r, content.trim(), userId);
    if (clientMessageId) this.repo.data.p2pPrivateMessages.at(-1).clientMessageId = clientMessageId;
    const notificationId=`chat:${randomUUID()}`;
    this.notify(userId === r.userId ? this.group(r.groupId).ownerId : r.userId, notificationId, 'Hai ricevuto un messaggio nella chat privata del gruppo.', r.id);
    this.repo.data.notifications.find(n=>n.id===notificationId).messageId=this.repo.data.p2pPrivateMessages.at(-1).id;
    await this.repo.save();
  }); }
  reminders() { return this.exclusive(async () => {
    let changed = false;
    for (const r of this.records()) {
      if (r.status === 'accepted' && Date.parse(r.reservedUntil) <= this.now()) {
        r.status = 'canceled';
        const text = 'Prenotazione scaduta senza dichiarazione di pagamento. Richiedi nuovamente il posto prima di pagare.';
        this.message(r, text);
        this.notify(r.userId, `reservation-expired:${r.id}`, text, r.id);
        this.notify(this.group(r.groupId).ownerId, `reservation-expired-owner:${r.id}`, 'Una prenotazione è scaduta. Il posto è nuovamente disponibile.', r.id);
        changed = true;
      }
      if (r.status !== 'confirmed' || !r.periodEnd) continue;
      const remaining = Date.parse(r.periodEnd) - this.now();
      if (remaining > 3 * 86400000) continue;
      const phase = remaining > 0 ? 'before' : 'due', key = `renew:${r.id}:${r.periodEnd}:${phase}`;
      if ((this.repo.data.notifications || []).some(n => n.id === key)) continue;
      const text = remaining > 0 ? 'La quota scade entro 3 giorni. Organizza il pagamento diretto al capogruppo.' : 'Rinnovo in attesa: paga la quota al capogruppo e indica «Ho pagato». Se hai già pagato, attendi la sua conferma.';
      this.notify(r.userId, key, text, r.id); this.message(r, text); changed = true;
      if (phase === 'due') this.notify(this.group(r.groupId).ownerId, `leader-${key}`, 'Una quota è scaduta. Contatta il membro in chat e verifica l’accredito prima di confermare il rinnovo.', r.id);
    }
    if (changed) await this.repo.save();
  }); }
}
