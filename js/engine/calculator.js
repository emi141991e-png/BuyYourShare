/**
 * SubFlow - Calculation Engine (Pure Functions)
 * Indipendente dal DOM / UI - 100% testabile
 */

export const BillingCycles = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  SEMIANNUAL: 'semiannual',
  YEARLY: 'yearly'
};

/**
 * Converte qualsiasi frequenza di fatturazione nel costo mensile equivalente.
 * @param {number} cost - Il costo registrato
 * @param {string} cycle - Il ciclo di fatturazione ('monthly', 'quarterly', 'semiannual', 'yearly')
 * @returns {number} Costo mensile normalizzato (arrotondato a 2 decimali)
 */
export function normalizeMonthly(cost, cycle) {
  const numCost = Number(cost);
  if (isNaN(numCost) || numCost <= 0) return 0;

  let monthly = 0;
  switch (cycle) {
    case BillingCycles.MONTHLY:
      monthly = numCost;
      break;
    case BillingCycles.QUARTERLY:
      monthly = numCost / 3;
      break;
    case BillingCycles.SEMIANNUAL:
      monthly = numCost / 6;
      break;
    case BillingCycles.YEARLY:
      monthly = numCost / 12;
      break;
    default:
      monthly = numCost;
  }

  return Math.round((monthly + Number.EPSILON) * 100) / 100;
}

/**
 * Converte qualsiasi frequenza di fatturazione nel costo annuale equivalente.
 * @param {number} cost - Il costo registrato
 * @param {string} cycle - Il ciclo di fatturazione ('monthly', 'quarterly', 'semiannual', 'yearly')
 * @returns {number} Costo annuale normalizzato (arrotondato a 2 decimali)
 */
export function normalizeYearly(cost, cycle) {
  const numCost = Number(cost);
  if (isNaN(numCost) || numCost <= 0) return 0;

  let yearly = 0;
  switch (cycle) {
    case BillingCycles.MONTHLY:
      yearly = numCost * 12;
      break;
    case BillingCycles.QUARTERLY:
      yearly = numCost * 4;
      break;
    case BillingCycles.SEMIANNUAL:
      yearly = numCost * 2;
      break;
    case BillingCycles.YEARLY:
      yearly = numCost;
      break;
    default:
      yearly = numCost * 12;
  }

  return Math.round((yearly + Number.EPSILON) * 100) / 100;
}

/**
 * Calcola i totali aggregati per un array di abbonamenti.
 * @param {Array} subscriptions - Lista abbonamenti
 * @returns {Object} { totalMonthly, totalYearly, count, categoryTotals }
 */
export function calculateAggregates(subscriptions = []) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return {
      totalMonthly: 0,
      totalYearly: 0,
      count: 0,
      categoryTotals: {}
    };
  }

  let totalMonthly = 0;
  let totalYearly = 0;
  const categoryTotals = {};

  subscriptions.forEach(sub => {
    const monthly = normalizeMonthly(sub.cost, sub.billingCycle);
    const yearly = normalizeYearly(sub.cost, sub.billingCycle);

    totalMonthly += monthly;
    totalYearly += yearly;

    const cat = sub.category || 'Altro';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + monthly;
  });

  // Arrotonda totali finali
  totalMonthly = Math.round((totalMonthly + Number.EPSILON) * 100) / 100;
  totalYearly = Math.round((totalYearly + Number.EPSILON) * 100) / 100;

  Object.keys(categoryTotals).forEach(cat => {
    categoryTotals[cat] = Math.round((categoryTotals[cat] + Number.EPSILON) * 100) / 100;
  });

  return {
    totalMonthly,
    totalYearly,
    count: subscriptions.length,
    categoryTotals
  };
}

/**
 * Calcola i giorni rimanenti fino al prossimo rinnovo e restituisce l'elenco ordinato.
 * @param {Array} subscriptions - Lista abbonamenti
 * @param {number} daysWindow - Finestra temporale massima in giorni (default: 30)
 * @param {Date} [referenceDate] - Data di riferimento (default: oggi)
 * @returns {Array} Abbonamenti con giorni mancanti, ordinati dal più vicino
 */
export function getUpcomingRenewals(subscriptions = [], daysWindow = 30, referenceDate = new Date()) {
  if (!Array.isArray(subscriptions)) return [];

  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  const upcoming = [];

  subscriptions.forEach(sub => {
    if (!sub.nextRenewalDate) return;

    const renewal = new Date(sub.nextRenewalDate);
    renewal.setHours(0, 0, 0, 0);

    const diffTime = renewal.getTime() - ref.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Considera rinnovi tra oggi e i prossimi N giorni
    if (diffDays >= 0 && diffDays <= daysWindow) {
      upcoming.push({
        ...sub,
        daysRemaining: diffDays,
        monthlyEquivalent: normalizeMonthly(sub.cost, sub.billingCycle)
      });
    }
  });

  // Ordina per scadenza più vicina
  return upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Trova le opportunità di risparmio confrontando gli abbonamenti dell'utente con il catalogo BuyYourShare.
 * @param {Array} userSubs - Abbonamenti dell'utente
 * @param {Array} savingsOffers - Catalogo offerte configurabile
 * @returns {Object} { matchedOffers, potentialMonthlySavings, potentialAnnualSavings }
 */
export function matchSavingsOffers(userSubs = [], savingsOffers = []) {
  if (!Array.isArray(userSubs) || !Array.isArray(savingsOffers)) {
    return {
      matchedOffers: [],
      potentialMonthlySavings: 0,
      potentialAnnualSavings: 0
    };
  }

  // Filtra solo offerte attive
  const activeOffers = savingsOffers.filter(o => o.isActive !== false);

  const matchedOffers = [];
  let potentialMonthlySavings = 0;
  let potentialAnnualSavings = 0;

  activeOffers.forEach(offer => {
    // Cerca corrispondenza per nome (case-insensitive o slug)
    const match = userSubs.find(sub => {
      if (!sub || !sub.name) return false;
      const subName = sub.name.trim().toLowerCase();
      const offerName = offer.serviceName.trim().toLowerCase();
      return subName.includes(offerName) || offerName.includes(subName);
    });

    if (match) {
      const userMonthlyCost = normalizeMonthly(match.cost, match.billingCycle);
      const bysMonthlyPrice = Number(offer.bysMonthlyPrice) || 0;

      // Risparmio mensile se l'utente spende più del prezzo BuyYourShare
      const monthlyDiff = Math.max(0, userMonthlyCost - bysMonthlyPrice);
      const annualDiff = monthlyDiff * 12;

      if (monthlyDiff > 0) {
        potentialMonthlySavings += monthlyDiff;
        potentialAnnualSavings += annualDiff;

        matchedOffers.push({
          userSubscription: match,
          offer,
          userMonthlyCost,
          bysMonthlyPrice,
          calculatedMonthlySavings: Math.round(monthlyDiff * 100) / 100,
          calculatedAnnualSavings: Math.round(annualDiff * 100) / 100
        });
      }
    }
  });

  return {
    matchedOffers,
    potentialMonthlySavings: Math.round(potentialMonthlySavings * 100) / 100,
    potentialAnnualSavings: Math.round(potentialAnnualSavings * 100) / 100
  };
}

/**
 * Formatta un importo in formato valuta Euro (€).
 * @param {number} amount
 * @returns {string} es. "14,99 €"
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
