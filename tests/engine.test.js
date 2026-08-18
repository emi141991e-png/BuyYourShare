/**
 * BuyYourShare - Automated Engine Unit Tests & Multi-Payment Method Integrity Verification
 */

import { eurosToCents, centsToEuros, formatCents, moneySplit, calculateMoneySplitBreakdown } from '../js/engine/MoneyEngine.js';
import { addOneMonth, calculateMonthlyPeriod, isPeriodExpired } from '../js/engine/DateEngine.js';
import { 
  calculatePricingBreakdown, 
  allocatePaymentTransaction, 
  DEFAULT_PLATFORM_FEE_CENTS, 
  validateGroupEconomicMargin,
  calculatePaymentMethodCostCents,
  MIN_NET_PROFIT_TARGET_CENTS 
} from '../js/engine/FeeEngine.js';

export function runAllTests() {
  const results = [];

  function assert(name, condition, details = '') {
    if (condition) {
      results.push({ name, status: 'PASS', details });
    } else {
      results.push({ name, status: 'FAIL', details });
      console.error(`[FAIL] ${name}: ${details}`);
    }
  }

  // 1. Money Engine Conversions
  assert(
    'Conversione Euro in Centesimi (20.99€ -> 2099 cents)',
    eurosToCents(20.99) === 2099 && eurosToCents('20,99') === 2099,
    `Atteso: 2099, Ottenuto: ${eurosToCents(20.99)}`
  );

  assert(
    'Conversione Centesimi in Euro (350 cents -> 3.5€)',
    centsToEuros(350) === 3.5,
    `Atteso: 3.5, Ottenuto: ${centsToEuros(350)}`
  );

  // 2. Controllo di Integrità Critico MoneySplit: SUM(quote) === costo_reale
  const integrityCases = [
    { cost: 2099, slots: 6, label: '20,99 € / 6 posti' },
    { cost: 1999, slots: 6, label: '19,99 € / 6 posti' },
    { cost: 1000, slots: 3, label: '10,00 € / 3 posti' },
    { cost: 1001, slots: 3, label: '10,01 € / 3 posti' },
    { cost: 2999, slots: 5, label: '29,99 € / 5 posti' },
    { cost: 10000, slots: 6, label: '100,00 € / 6 posti' }
  ];

  integrityCases.forEach(({ cost, slots, label }) => {
    const shares = moneySplit(cost, slots);
    const sum = shares.reduce((a, b) => a + b, 0);
    assert(
      `Integrità MoneySplit: ${label} (Somma Esatta = ${cost} cents)`,
      shares.length === slots && sum === cost,
      `Quote: [${shares.join(', ')}], Somma: ${sum} cents (Atteso: ${cost})`
    );
  });

  // 3. Fee Engine & Nuova Regola Economica 1,49 € Fissi
  const pricing = calculatePricingBreakdown(2099, 6);
  assert(
    'Pricing Breakdown con Fee 1,49€ (3,50€ quota + 1,49€ fee = 4,99€)',
    pricing.sumExactSharesCents === 2099 &&
    pricing.platformFeeCents === 149 &&
    pricing.memberTotalCents === 499,
    `Quota base: ${pricing.baseMemberShareCents}, Fee: ${pricing.platformFeeCents}, Totale Membro: ${pricing.memberTotalCents}`
  );

  assert(
    'Esenzione Capogruppo (Owner paga solo la quota reale con ZERO fee BYS)',
    pricing.ownerFeeCents === 0 && pricing.ownerTotalCents === pricing.ownerShareCents,
    `Owner Fee: ${pricing.ownerFeeCents}, Owner Totale: ${pricing.ownerTotalCents}`
  );

  // 4. Distinzione Lordo / Netto per Metodo di Pagamento
  const allocCard = allocatePaymentTransaction(350, 149, null, 'CARD_EEA');
  const allocWallet = allocatePaymentTransaction(350, 149, null, 'APPLE_PAY');
  const allocPayPal = allocatePaymentTransaction(350, 149, null, 'PAYPAL_EEA');
  const allocPayPalCross = allocatePaymentTransaction(350, 149, null, 'PAYPAL_CROSSBORDER');

  assert(
    'Margine Netto Carta SEE su Spotify (350c + 149c fee -> Netto: 113c >= 100c)',
    allocCard.netPlatformAmountCents >= 100 && allocCard.netPlatformAmountCents === 113,
    `Netto: ${allocCard.netPlatformAmountCents}c`
  );

  assert(
    'Margine Netto Apple/Google Pay su Spotify (350c + 149c fee -> Netto: 113c >= 100c)',
    allocWallet.netPlatformAmountCents >= 100 && allocWallet.netPlatformAmountCents === 113,
    `Netto: ${allocWallet.netPlatformAmountCents}c`
  );

  assert(
    'Margine Netto PayPal SEE su Spotify (350c + 149c fee -> Netto: 113c >= 100c)',
    allocPayPal.netPlatformAmountCents >= 100 && allocPayPal.netPlatformAmountCents === 113,
    `Netto: ${allocPayPal.netPlatformAmountCents}c`
  );

  assert(
    'Margine Netto PayPal Cross-Border su Spotify (350c + 149c fee -> Netto: 106c >= 100c)',
    allocPayPalCross.netPlatformAmountCents >= 100 && allocPayPalCross.netPlatformAmountCents === 106,
    `Netto: ${allocPayPalCross.netPlatformAmountCents}c`
  );

  // 5. Guardrail Economici
  assert(
    'Guardrail Carta/PayPal SEE: Quota 9,42 € è Valida (Netto >= 1,00 €)',
    validateGroupEconomicMargin(942, 'CARD_EEA').isValid === true,
    'Deve essere valida a 9,42 €'
  );

  assert(
    'Guardrail Carta/PayPal SEE: Quota 9,50 € viene Bloccata (Netto < 1,00 €)',
    validateGroupEconomicMargin(950, 'CARD_EEA').isValid === false,
    'Deve essere bloccata a 9,50 €'
  );

  // 6. Date Engine & Ancoraggio Mensile
  const startAug17 = new Date('2026-08-17T10:00:00Z');
  const endSept17 = addOneMonth(startAug17);
  assert(
    'Ancoraggio Data Mensile (17 Agosto -> 17 Settembre)',
    endSept17.getUTCDate() === 17 && endSept17.getUTCMonth() === 8,
    `Atteso 17/9, Ottenuto: ${endSept17.getUTCDate()}/${endSept17.getUTCMonth() + 1}`
  );

  return results;
}
