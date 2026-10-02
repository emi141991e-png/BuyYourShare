export const ACCESS_PLANS = Object.freeze([
  Object.freeze({ code: 'MONTHLY', label: 'Mensile', period: '30 giorni', amountCents: 99, months: 0, days: 30 }),
  Object.freeze({ code: 'QUARTERLY', label: 'Trimestrale', period: '3 mesi', amountCents: 269, months: 3 }),
  Object.freeze({ code: 'YEARLY', label: 'Annuale', period: '12 mesi', amountCents: 990, months: 12 })
]);
export function accessPlan(code = 'MONTHLY') {
  const plan = ACCESS_PLANS.find(p => p.code === code);
  if (!plan) throw Object.assign(new Error('INVALID_ACCESS_PLAN'), { status: 400 });
  return plan;
}
export function accessPeriodEnd(start, code) {
  const plan = accessPlan(code), date = new Date(start);
  if (plan.days) return new Date(date.getTime() + plan.days * 86400000).toISOString();
  const day = date.getUTCDate(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + plan.months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return date.toISOString();
}
export const accessMoney = cents => (cents / 100).toLocaleString('it-IT', {style:'currency',currency:'EUR'});
export function accessRemainingDays(until, now = Date.now()) {
  const end = Date.parse(until);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 86400000)) : 0;
}
