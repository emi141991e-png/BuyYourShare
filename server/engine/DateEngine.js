/**
 * BuyYourShare - Server DateEngine
 * Ancoraggio mensile esatto delle date di fatturazione e rinnovo.
 */

export function addOneMonth(date) {
  const d = new Date(date);
  const targetDay = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() !== targetDay) {
    d.setDate(0);
  }
  return d;
}

export function calculateMonthlyPeriod(startDate = new Date()) {
  const start = new Date(startDate);
  const end = addOneMonth(start);
  return {
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    next_billing_date: end.toISOString()
  };
}
