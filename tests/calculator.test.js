/**
 * SubFlow - Calculator Unit Tests Suite
 * Test rigorosi su calcoli di normalizzazione, aggregazione e offerte BuyYourShare
 */

import {
  BillingCycles,
  normalizeMonthly,
  normalizeYearly,
  calculateAggregates,
  getUpcomingRenewals,
  matchSavingsOffers,
  formatCurrency
} from '../js/engine/calculator.js';

export function runAllTests() {
  const results = [];

  function assert(testName, condition, details = '') {
    if (condition) {
      results.push({ name: testName, status: 'PASS', details });
    } else {
      results.push({ name: testName, status: 'FAIL', details });
      console.error(`[FAIL] ${testName}: ${details}`);
    }
  }

  // 1. Test normalizzazione mensile
  assert(
    'Normalizzazione Mensile - Mensile invariato',
    normalizeMonthly(12.99, BillingCycles.MONTHLY) === 12.99,
    `Atteso: 12.99, Ottenuto: ${normalizeMonthly(12.99, BillingCycles.MONTHLY)}`
  );

  assert(
    'Normalizzazione Mensile - Trimestrale diviso per 3',
    normalizeMonthly(30.00, BillingCycles.QUARTERLY) === 10.00,
    `Atteso: 10.00, Ottenuto: ${normalizeMonthly(30.00, BillingCycles.QUARTERLY)}`
  );

  assert(
    'Normalizzazione Mensile - Semestrale diviso per 6',
    normalizeMonthly(60.00, BillingCycles.SEMIANNUAL) === 10.00,
    `Atteso: 10.00, Ottenuto: ${normalizeMonthly(60.00, BillingCycles.SEMIANNUAL)}`
  );

  assert(
    'Normalizzazione Mensile - Annuale diviso per 12 con arrotondamento corretto',
    normalizeMonthly(119.99, BillingCycles.YEARLY) === 10.00,
    `Atteso: 10.00, Ottenuto: ${normalizeMonthly(119.99, BillingCycles.YEARLY)}`
  );

  // 2. Test normalizzazione annuale
  assert(
    'Normalizzazione Annuale - Mensile moltiplicato per 12',
    normalizeYearly(10.00, BillingCycles.MONTHLY) === 120.00,
    `Atteso: 120.00, Ottenuto: ${normalizeYearly(10.00, BillingCycles.MONTHLY)}`
  );

  assert(
    'Normalizzazione Annuale - Trimestrale moltiplicato per 4',
    normalizeYearly(25.00, BillingCycles.QUARTERLY) === 100.00,
    `Atteso: 100.00, Ottenuto: ${normalizeYearly(25.00, BillingCycles.QUARTERLY)}`
  );

  assert(
    'Normalizzazione Annuale - Semestrale moltiplicato per 2',
    normalizeYearly(50.00, BillingCycles.SEMIANNUAL) === 100.00,
    `Atteso: 100.00, Ottenuto: ${normalizeYearly(50.00, BillingCycles.SEMIANNUAL)}`
  );

  assert(
    'Normalizzazione Annuale - Annuale invariato',
    normalizeYearly(89.90, BillingCycles.YEARLY) === 89.90,
    `Atteso: 89.90, Ottenuto: ${normalizeYearly(89.90, BillingCycles.YEARLY)}`
  );

  // 3. Test gestione valori invalidi o vuoti
  assert(
    'Edge Case - Costo zero o negativo o non numerico',
    normalizeMonthly(0, BillingCycles.MONTHLY) === 0 &&
    normalizeMonthly(-15, BillingCycles.MONTHLY) === 0 &&
    normalizeMonthly('abc', BillingCycles.MONTHLY) === 0,
    'Valori invalidi devono restituire 0'
  );

  // 4. Test aggregazione totali
  const sampleSubs = [
    { name: 'Netflix', cost: 17.99, billingCycle: BillingCycles.MONTHLY, category: 'Streaming' },
    { name: 'Spotify', cost: 10.99, billingCycle: BillingCycles.MONTHLY, category: 'Musica' },
    { name: 'Amazon Prime', cost: 49.90, billingCycle: BillingCycles.YEARLY, category: 'Streaming' },
    { name: 'Canva Pro', cost: 33.00, billingCycle: BillingCycles.QUARTERLY, category: 'Produttività' }
  ];

  const aggregates = calculateAggregates(sampleSubs);
  // Netflix: 17.99/m | 215.88/y
  // Spotify: 10.99/m | 131.88/y
  // Prime: 4.16/m | 49.90/y
  // Canva: 11.00/m | 132.00/y
  // Totale Mensile: 17.99 + 10.99 + 4.16 + 11.00 = 44.14
  // Totale Annuale: 215.88 + 131.88 + 49.90 + 132.00 = 529.66

  assert(
    'Aggregati - Conteggio corretto abbonamenti',
    aggregates.count === 4,
    `Atteso: 4, Ottenuto: ${aggregates.count}`
  );

  assert(
    'Aggregati - Totale mensile corretto',
    aggregates.totalMonthly === 44.14,
    `Atteso: 44.14, Ottenuto: ${aggregates.totalMonthly}`
  );

  assert(
    'Aggregati - Totale annuale corretto',
    aggregates.totalYearly === 529.66,
    `Atteso: 529.66, Ottenuto: ${aggregates.totalYearly}`
  );

  assert(
    'Aggregati - Ripartizione categorie corretta',
    aggregates.categoryTotals['Streaming'] === 22.15 &&
    aggregates.categoryTotals['Musica'] === 10.99 &&
    aggregates.categoryTotals['Produttività'] === 11.00,
    `Streaming: ${aggregates.categoryTotals['Streaming']}, Musica: ${aggregates.categoryTotals['Musica']}`
  );

  // 5. Test prossimi rinnovi
  const now = new Date('2026-08-16T00:00:00Z');
  const subsWithDates = [
    { name: 'Sub A', cost: 10, billingCycle: 'monthly', nextRenewalDate: '2026-08-18' }, // 2 giorni
    { name: 'Sub B', cost: 15, billingCycle: 'monthly', nextRenewalDate: '2026-08-25' }, // 9 giorni
    { name: 'Sub C', cost: 20, billingCycle: 'monthly', nextRenewalDate: '2026-10-01' }, // Fuori dalla finestra di 30 giorni
    { name: 'Sub D Scaduto', cost: 5, billingCycle: 'monthly', nextRenewalDate: '2026-08-10' } // Passato
  ];

  const renewals = getUpcomingRenewals(subsWithDates, 30, now);
  assert(
    'Prossimi rinnovi - Filtra solo quelli nella finestra 0-30 giorni',
    renewals.length === 2 && renewals[0].name === 'Sub A' && renewals[0].daysRemaining === 2,
    `Trovati: ${renewals.length}, Primo: ${renewals[0]?.name} (${renewals[0]?.daysRemaining}gg)`
  );

  // 6. Test matching offerte BuyYourShare
  const demoSavingsCatalog = [
    {
      serviceName: 'Netflix',
      bysMonthlyPrice: 4.50,
      isActive: true
    },
    {
      serviceName: 'Spotify',
      bysMonthlyPrice: 3.00,
      isActive: true
    },
    {
      serviceName: 'Canva Pro',
      bysMonthlyPrice: 5.00,
      isActive: false // Disattivato! Non deve comparire
    }
  ];

  const savingsResult = matchSavingsOffers(sampleSubs, demoSavingsCatalog);
  // Netflix utente 17.99 - BYS 4.50 = 13.49/m | 161.88/y
  // Spotify utente 10.99 - BYS 3.00 = 7.99/m | 95.88/y
  // Canva è disattivo
  // Totale risparmio mensile: 13.49 + 7.99 = 21.48
  // Totale risparmio annuale: 161.88 + 95.88 = 257.76

  assert(
    'Risparmia BuyYourShare - Individua i 2 servizi attivi ignorando quelli disattivati',
    savingsResult.matchedOffers.length === 2,
    `Atteso: 2 offerte matchate, Ottenuto: ${savingsResult.matchedOffers.length}`
  );

  assert(
    'Risparmia BuyYourShare - Calcola esattamente il risparmio mensile e annuale',
    savingsResult.potentialMonthlySavings === 21.48 &&
    savingsResult.potentialAnnualSavings === 257.76,
    `Mensile: ${savingsResult.potentialMonthlySavings}€, Annuale: ${savingsResult.potentialAnnualSavings}€`
  );

  return results;
}
