import { createHash, randomUUID } from 'node:crypto';
import { P2pError } from './p2pSubscription.js';
import { addOneMonth } from '../engine/DateEngine.js';

export const bankDetails = { iban: 'LT933250037466060894', accountHolder: 'Caruso Emilio', amountCents: 99, currency: 'EUR' };
export const bankCode = id => 'BYS-' + createHash('sha256').update(String(id)).digest('hex').slice(0, 16).toUpperCase();
export class P2pBank {
  constructor(subscriptions) { this.s = subscriptions; this.repo = subscriptions.repo; }
  records() { return this.repo.data.p2pBankPayments ||= []; }
  blocked(userId) { const s = this.s.find(userId); return !!s?.providerSubscriptionId && !['CANCELLED', 'EXPIRED'].includes(s.providerStatus); }
  view(userId) { return { ...bankDetails, code: bankCode(userId), reference: `Abbonamento BYS - ${bankCode(userId)}`, blocked: this.blocked(userId), payments: this.records().filter(p => p.userId === userId).map(({ bankReference, confirmedBy, ...p }) => p) }; }
  transaction(fn) { return this.s.exclusive(async () => {
    const fields = ['p2pBankPayments', 'p2pSubscriptions', 'notifications'];
    const snapshot = Object.fromEntries(fields.map(k => [k, structuredClone(this.repo.data[k])]));
    try { const result = await fn(); if (fields.some(k => JSON.stringify(snapshot[k]) !== JSON.stringify(this.repo.data[k]))) await this.repo.save(); return result; }
    catch (e) { for (const k of fields) this.repo.data[k] = snapshot[k]; throw e; }
  }); }
  notify(userId, id, message, extra = {}) {
    const list = this.repo.data.notifications ||= [];
    if (!list.some(n => n.id === id)) list.push({ id, userId, title: 'Abbonamento BYS', message, actionUrl: '#p2p-abbonamento', isRead: false, createdAt: new Date(this.s.now()).toISOString(), ...extra });
  }
  report(userId) { return this.transaction(async () => {
    this.s.ready();
    if (this.blocked(userId)) throw new P2pError('BANK_PAYPAL_OPEN');
    const existing = this.records().find(p => p.userId === userId && p.status === 'reported');
    if (existing) return existing;
    const p = { id: randomUUID(), userId, code: bankCode(userId), amountCents: 99, status: 'reported', reportedAt: new Date(this.s.now()).toISOString() };
    this.records().push(p);
    for (const u of this.repo.data.users || []) if (u.role === 'admin') this.notify(u.id, `bank-report:${p.id}:${u.id}`, `Bonifico BYS da verificare: ${p.code}.`);
    return p;
  }); }
  confirm(id, adminId, reference) { return this.transaction(async () => {
    this.s.ready();
    if (!(this.repo.data.users || []).some(u => u.id === adminId && u.role === 'admin')) throw new P2pError('FORBIDDEN', 403);
    const p = this.records().find(p => p.id === id);
    if (!p) throw new P2pError('NOT_FOUND', 404);
    if (p.status === 'confirmed') return p;
    const ref = String(reference || '').trim().toUpperCase();
    if (ref.length < 6 || ref.length > 120) throw new P2pError('BANK_REFERENCE_REQUIRED', 400);
    if (this.records().some(r => r.bankReference === ref)) throw new P2pError('BANK_REFERENCE_DUPLICATE');
    if (this.blocked(p.userId)) throw new P2pError('BANK_PAYPAL_OPEN');
    let s = this.s.find(p.userId);
    const now = this.s.now();
    const start = Math.max(now, Date.parse(s?.currentPeriodEnd) || 0);
    const end = addOneMonth(new Date(start)).toISOString();
    if (!s) { s = { userId: p.userId, role: this.s.roleFor(p.userId) }; (this.repo.data.p2pSubscriptions ||= []).push(s); }
    if (s.providerSubscriptionId) s.retiredIds = [...(s.retiredIds || []), s.providerSubscriptionId];
    s.providerSubscriptionId = null; s.providerStatus = null; s.customId = null;
    Object.assign(s, { status: 'active', paymentMethod: 'BANK', currentPeriodStart: new Date(start).toISOString(), currentPeriodEnd: end, nextBillingDate: null, cancelAtPeriodEnd: false, approvalUrl: null });
    Object.assign(p, { status: 'confirmed', confirmedBy: adminId, confirmedAt: new Date(now).toISOString(), bankReference: ref, periodStart: s.currentPeriodStart, periodEnd: end });
    this.notify(p.userId, `bank-confirm:${p.id}`, 'Bonifico ricevuto: il tuo accesso BYS è stato attivato o rinnovato. Consulta la scadenza nella pagina Accesso BYS.');
    return p;
  }); }
  reminders() { return this.transaction(async () => {
    for (const s of this.s.records()) {
      if (s.paymentMethod !== 'BANK' || !s.currentPeriodEnd) continue;
      const remaining = Date.parse(s.currentPeriodEnd) - this.s.now();
      if (remaining > 3 * 86400000) continue;
      const phase = remaining > 0 ? 'before' : 'due';
      this.notify(s.userId, `bank-renew:${s.userId}:${s.currentPeriodEnd}:${phase}`, remaining > 0 ? 'Il tuo accesso BYS scade entro 3 giorni. Verifica il bonifico periodico da 0,99 € e segnala il pagamento.' : 'Il tuo accesso BYS è scaduto. Segnala il bonifico per rinnovarlo dopo la verifica dell’incasso.', { bankPeriodEnd: s.currentPeriodEnd });
    }
  }); }
}
