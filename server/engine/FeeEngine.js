/**
 * BuyYourShare - Server FeeEngine
 * Regola economica: Commissione Lorda Fissa di 1,49 € (149 cents) ad ogni ciclo mensile.
 * Contabilizzazione separata dei costi gateway (PayPal/Stripe) a carico della piattaforma.
 */

export const DEFAULT_PLATFORM_FEE_CENTS = 149; // 1,49 €

export function calculateGatewayFee(amountCents, paymentMethod = 'CARD_EEA') {
  const method = (paymentMethod || '').toUpperCase();
  if (method.includes('PAYPAL')) {
    // Tariffa standard PayPal SEE: 2,2% + 0,25 €
    return Math.round(amountCents * 0.022) + 25;
  }
  // Tariffa standard carte SEE (Stripe): 1,5% + 0,25 € o test 2.2% + 0.25 €
  return Math.round(amountCents * 0.022) + 25;
}

export function allocatePaymentTransaction(baseShareCents, totalAmountCents, paymentMethod = 'CARD_EEA') {
  const grossPlatformFeeCents = DEFAULT_PLATFORM_FEE_CENTS;
  const gatewayCostCents = calculateGatewayFee(totalAmountCents, paymentMethod);
  const netPlatformRevenueCents = grossPlatformFeeCents - gatewayCostCents;

  return {
    grossAmountCents: totalAmountCents,
    ownerShareCents: baseShareCents,
    platformGrossFeeCents: grossPlatformFeeCents,
    gatewayFeeCents: gatewayCostCents,
    netPlatformRevenueCents: netPlatformRevenueCents
  };
}
