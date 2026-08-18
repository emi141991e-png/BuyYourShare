/**
 * BuyYourShare - Server Ledger & Financial Audit Routes (RBAC Enforced)
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const ledgerRouter = express.Router();

// 1. I Miei Log Finanziari (Membro / Capogruppo)
ledgerRouter.get('/my', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const memberLogs = await dataRepository.getFinancialAuditLogs({ memberId: user.id });
    const ownerLogs = await dataRepository.getFinancialAuditLogs({ ownerId: user.id });

    return res.json({
      memberLogs,
      ownerLogs
    });
  } catch (err) {
    console.error('[LEDGER MY GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 2. Audit Ledger Completo & Metriche Finanziarie (Solo Admin)
ledgerRouter.get('/admin', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const logs = await dataRepository.getFinancialAuditLogs();

    const totalVolumeCents = logs.reduce((acc, l) => acc + (l.totalAmountCents || 0), 0);
    const totalGrossFeesCents = logs.reduce((acc, l) => acc + (l.buyyourshareFeeCents || 149), 0);
    const totalProviderFeesCents = logs.reduce((acc, l) => acc + (l.paymentProviderFeeCents || 0), 0);
    const totalNetPlatformRevenueCents = logs.reduce((acc, l) => acc + (l.netPlatformAmountCents || 0), 0);
    const totalTransferredToOwnersCents = logs.filter(l => l.transferStatus === 'TRANSFERRED' || l.payoutStatus === 'PAID')
      .reduce((acc, l) => acc + (l.baseShareCents || 0), 0);

    return res.json({
      summary: {
        totalTransactionsCount: logs.length,
        totalVolumeCents,
        totalGrossFeesCents,
        totalProviderFeesCents,
        totalNetPlatformRevenueCents,
        totalTransferredToOwnersCents
      },
      logs
    });
  } catch (err) {
    console.error('[ADMIN LEDGER GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
