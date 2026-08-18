/**
 * BuyYourShare - DateEngine
 * Gestisce periodi mensili deterministici con ancoraggio al giorno del mese
 */

/**
 * Aggiunge esattamente un mese solare mantenendo l'ancoraggio del giorno,
 * gestendo correttamente i mesi da 28, 29, 30 e 31 giorni.
 * @param {Date|string} dateInput - Data di partenza
 * @returns {Date} Data dopo un mese solare
 */
export function addOneMonth(dateInput) {
  const d = new Date(dateInput);
  const targetDay = d.getDate();
  
  // Imposta il primo giorno del mese successivo per evitare overflow (es. da 31 gen a marzo)
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  
  // Trova l'ultimo giorno del nuovo mese
  const lastDayOfNewMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  
  // Ripristina il giorno originale o usa l'ultimo giorno valido del mese
  d.setDate(Math.min(targetDay, lastDayOfNewMonth));
  return d;
}

/**
 * Calcola le date del ciclo mensile per una nuova membership.
 * @param {Date|string} [startDate=new Date()]
 * @returns {Object} { current_period_start, current_period_end, next_billing_date }
 */
export function calculateMonthlyPeriod(startDate = new Date()) {
  const start = new Date(startDate);
  const end = addOneMonth(start);
  
  return {
    current_period_start: start.toISOString(),
    current_period_end: end.toISOString(),
    next_billing_date: end.toISOString()
  };
}

/**
 * Verifica se un periodo mensile è scaduto.
 * @param {string|Date} periodEnd - Data di fine periodo
 * @param {string|Date} [now=new Date()]
 * @returns {boolean}
 */
export function isPeriodExpired(periodEnd, now = new Date()) {
  const end = new Date(periodEnd).getTime();
  const current = new Date(now).getTime();
  return current >= end;
}

/**
 * Formatta una data in formato leggibile italiano (es. "17 Settembre 2026").
 * @param {string|Date} dateInput 
 * @param {boolean} [includeTime=false]
 * @returns {string}
 */
export function formatDateIT(dateInput, includeTime = false) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';

  const options = {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return d.toLocaleDateString('it-IT', options);
}

/**
 * Formatta in formato breve (es. "17 Set").
 */
export function formatDateShort(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}
