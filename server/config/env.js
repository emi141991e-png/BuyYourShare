/**
 * BuyYourShare - Server Environment Configuration
 */

import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  platformFeeCents: parseInt(process.env.PLATFORM_FEE_CENTS, 10) || 149, // 1,49 € LORDA FISSA
  
  // Stripe Configuration (LIVE Production via Environment Variables & Dynamic Gateway Config)
  stripe: {
    mode: process.env.STRIPE_MODE || 'live',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
  },

  // PayPal Configuration (LIVE / Production Default)
  paypal: {
    mode: (process.env.PAYPAL_MODE || 'live').toLowerCase(),
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    // Safety Lock: true per default per impedire qualsiasi addebito reale durante la fase di verifica
    safetyLockActive: process.env.PAYPAL_SAFETY_LOCK !== 'false',
    apiBaseUrl: (process.env.PAYPAL_MODE === 'sandbox')
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com'
  }
};
