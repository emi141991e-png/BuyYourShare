/**
 * BuyYourShare - FeeEngine
 * Gestione della Commissione LORDA FISSA (1,49 € = 149 cents) per ogni membro e ciclo mensile,
 * con scomposizione specifica per metodo di pagamento (Carta, Apple/Google Pay, PayPal)
 * e garanzia di >= 1,00 € NETTO per la piattaforma.
 */

import { calculateMoneySplitBreakdown } from './MoneyEngine.js';

export const DEFAULT_PLATFORM_FEE_CENTS = 149; // 1,49 € LORDI FISSI PER MEMBRO / MESE
export const MAX_BASE_SHARE_FOR_MIN_NET_CENTS = 942; // 9,42 € (soglia standard SEE per >= 1,00 € netto)
export const MIN_NET_PROFIT_TARGET_CENTS = 100; // 1,00 € NETTO MINIMO GARANTITO

/**
 * Tariffe ufficiali verificate Stripe / PayPal per ciascun metodo di pagamento (Spazio Economico Europeo).
 */
export const PAYMENT_METHOD_RATES = {
  CARD_EEA: {
    id: 'CARD_EEA',
    name: 'Carta di Credito / Debito (SEE)',
    gatewayPercentage: 0.015,
    billingPercentage: 0.007,
    fixedCents: 25,
    maxBaseShareForMinNetCents: 942 // 9,42 €
  },
  APPLE_PAY: {
    id: 'APPLE_PAY',
    name: 'Apple Pay (SEE)',
    gatewayPercentage: 0.015,
    billingPercentage: 0.007,
    fixedCents: 25,
    maxBaseShareForMinNetCents: 942 // 9,42 €
  },
  GOOGLE_PAY: {
    id: 'GOOGLE_PAY',
    name: 'Google Pay (SEE)',
    gatewayPercentage: 0.015,
    billingPercentage: 0.007,
    fixedCents: 25,
    maxBaseShareForMinNetCents: 942 // 9,42 €
  },
  PAYPAL_EEA: {
    id: 'PAYPAL_EEA',
    name: 'PayPal (SEE / EUR)',
    gatewayPercentage: 0.015,
    billingPercentage: 0.007,
    fixedCents: 25,
    maxBaseShareForMinNetCents: 942 // 9,42 €
  },
  PAYPAL_CROSSBORDER: {
    id: 'PAYPAL_CROSSBORDER',
    name: 'PayPal Cross-Border (Extra-SEE)',
    gatewayPercentage: 0.029,
    billingPercentage: 0.007,
    fixedCents: 25,
    maxBaseShareForMinNetCents: 666 // 6,66 €
  }
};

/**
 * Calcola i costi effettivi di elaborazione specifici per il metodo di pagamento scelto.
 * @param {number} totalAmountCents 
 * @param {string} [methodKey='CARD_EEA'] 
 * @returns {number} Costo del provider in centesimi arrotondato
 */
export function calculatePaymentMethodCostCents(totalAmountCents, methodKey = 'CARD_EEA') {
  const rateConfig = PAYMENT_METHOD_RATES[methodKey] || PAYMENT_METHOD_RATES.CARD_EEA;
  const totalPercentage = rateConfig.gatewayPercentage + rateConfig.billingPercentage;
  return Math.round(totalAmountCents * totalPercentage) + rateConfig.fixedCents;
}

/**
 * Stima generica per i costi Stripe standard (2,2% + 0,25 €).
 * @param {number} totalAmountCents 
 */
export function estimateStripeProcessingCostCents(totalAmountCents) {
  return calculatePaymentMethodCostCents(totalAmountCents, 'CARD_EEA');
}

/**
 * Valida che la quota base rispetti il limite economico per garantire almeno 1,00 € netto alla piattaforma.
 * @param {number} baseShareCents 
 * @param {string} [methodKey='CARD_EEA']
 */
export function validateGroupEconomicMargin(baseShareCents, methodKey = 'CARD_EEA') {
  const rateConfig = PAYMENT_METHOD_RATES[methodKey] || PAYMENT_METHOD_RATES.CARD_EEA;
  const maxAllowedCents = rateConfig.maxBaseShareForMinNetCents;
  const isValid = baseShareCents <= maxAllowedCents;
  const totalCharged = baseShareCents + DEFAULT_PLATFORM_FEE_CENTS;
  const processingCost = calculatePaymentMethodCostCents(totalCharged, methodKey);
  const netPlatformRevenue = DEFAULT_PLATFORM_FEE_CENTS - processingCost;

  return {
    isValid,
    baseShareCents,
    methodKey,
    methodName: rateConfig.name,
    maxAllowedCents,
    estimatedProcessingCostCents: processingCost,
    estimatedNetProfitCents: netPlatformRevenue,
    message: isValid 
      ? `Margine valido con ${rateConfig.name} (Netto: ${(netPlatformRevenue / 100).toFixed(2)} €/mese)`
      : `Attenzione: La quota base per membro (${(baseShareCents / 100).toFixed(2)} €) supera la soglia massima di ${(maxAllowedCents / 100).toFixed(2)} €/mese con ${rateConfig.name}. Aumenta i posti o scegli un piano differente per mantenere la sostenibilità a 1,49 € fissi.`
  };
}

/**
 * Calcola la scomposizione economica per il gruppo e i suoi membri.
 * @param {number} realCostCents - Costo reale totale in centesimi
 * @param {number} totalSlots - Posti totali del piano
 * @param {number} [platformFeeCents=DEFAULT_PLATFORM_FEE_CENTS] - Commissione LORDA fissa BuyYourShare (149 cents)
 */
export function calculatePricingBreakdown(realCostCents, totalSlots, platformFeeCents = DEFAULT_PLATFORM_FEE_CENTS) {
  const grossFeeCents = DEFAULT_PLATFORM_FEE_CENTS; // Sempre rigorosamente 149 centesimi
  const split = calculateMoneySplitBreakdown(realCostCents, totalSlots);

  const typicalBaseShare = split.typicalMemberShareCents;

  return {
    realCostCents,
    totalSlots,
    // Quote individuali deterministiche (MoneySplit)
    exactSharesCents: split.shares,
    sumExactSharesCents: split.sumCents, // Sempre === realCostCents al 100%
    isUniform: split.isUniform,
    displayShareText: split.displayShareText,
    
    // Quota base di riferimento
    baseMemberShareCents: typicalBaseShare,
    
    // Commissione LORDA fissa BuyYourShare (a carico del Membro per OGNI ciclo mensile)
    platformFeeCents: grossFeeCents,
    
    // Totale mensile addebitato al Membro (Quota + 1,49 €)
    memberTotalCents: typicalBaseShare + grossFeeCents,
    
    // Capogruppo: ESENTE da commissione BuyYourShare
    ownerShareCents: split.shares[0] || typicalBaseShare,
    ownerFeeCents: 0,
    ownerTotalCents: split.shares[0] || typicalBaseShare
  };
}

/**
 * Registra ed alloca i flussi contabili di una transazione di pagamento mensile.
 * @param {number} baseShareCents - Quota spettante al Capogruppo (in centesimi)
 * @param {number} [grossFeeCents=DEFAULT_PLATFORM_FEE_CENTS] - Commissione LORDA BuyYourShare (149 cents)
 * @param {number} [providerFeeCents] - Costo di elaborazione del gateway (in centesimi)
 * @param {string} [paymentMethod='CARD_EEA'] - Metodo di pagamento utilizzato
 */
export function allocatePaymentTransaction(baseShareCents, grossFeeCents = DEFAULT_PLATFORM_FEE_CENTS, providerFeeCents = null, paymentMethod = 'CARD_EEA') {
  const finalGrossFee = DEFAULT_PLATFORM_FEE_CENTS; // Forzato server-side a 149 cents
  const totalCharged = baseShareCents + finalGrossFee;
  const actualProviderFee = providerFeeCents !== null 
    ? providerFeeCents 
    : calculatePaymentMethodCostCents(totalCharged, paymentMethod);
  const netPlatformRevenue = finalGrossFee - actualProviderFee;

  return {
    totalAmountCents: totalCharged,
    transferToOwnerCents: baseShareCents, // Trasferito al Connected Account del Capogruppo
    grossPlatformFeeCents: finalGrossFee, // 149 centesimi LORDI (Regola commerciale immutabile)
    paymentProviderFeeCents: actualProviderFee, // Costo di elaborazione specifico del metodo
    netPlatformAmountCents: netPlatformRevenue, // Ricavo netto effettivo per BuyYourShare
    paymentMethod: paymentMethod,
    isOwnerExempt: true
  };
}
