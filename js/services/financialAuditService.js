/**
 * BuyYourShare - Financial Audit & Ledger Service
 * Registro contabile immutabile per tracciare ogni singolo centesimo di ogni ciclo di fatturazione
 */

import { db } from '../db/database.js';

class FinancialAuditService {
  /**
   * Registra un evento contabile immutabile nel ledger.
   * @param {Object} logData
   */
  recordTransaction(logData) {
    // Controllo Idempotenza: verifica se la transazione/fattura è già stata registrata
    const existing = db.data.financialAuditLogs.find(l => 
      l.idempotencyKey === logData.idempotencyKey || 
      (l.invoiceId && l.invoiceId === logData.invoiceId)
    );

    if (existing) {
      console.warn(`[AUDIT] Transazione già registrata per idempotencyKey ${logData.idempotencyKey}`);
      return existing;
    }

    const newLog = {
      id: 'aud-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      transactionId: logData.transactionId || ('tx_' + Date.now()),
      invoiceId: logData.invoiceId || ('in_' + Date.now()),
      subscriptionId: logData.subscriptionId || ('sub_' + Date.now()),
      connectedAccountId: logData.connectedAccountId,
      memberId: logData.memberId,
      groupId: logData.groupId,
      slotNumber: logData.slotNumber,
      
      // Valori monetari esatti in centesimi
      baseShareCents: logData.baseShareCents,           // Quota al Capogruppo (es. 350 o 349 cents)
      buyyourshareFeeCents: logData.buyyourshareFeeCents || 149, // Fee LORDA fissa BuyYourShare (149 cents = 1,49 €)
      totalAmountCents: logData.totalAmountCents,       // Totale addebitato al Membro (es. 499 o 498 cents)
      paymentProviderFeeCents: logData.paymentProviderFeeCents || 36, // Costo di elaborazione Stripe stimato (2,2% + 0,25€)
      netPlatformAmountCents: (logData.buyyourshareFeeCents || 149) - (logData.paymentProviderFeeCents || 36), // Ricavo netto effettivo (>= 100 cents)
      transferAmountCents: logData.baseShareCents,      // Importo trasferito al Capogruppo
      
      cycleNumber: logData.cycleNumber || 1,            // Ciclo mensile (1, 2, 3...)
      paymentMethod: logData.paymentMethod || 'CARD_EEA', // Metodo di pagamento utilizzato
      paymentStatus: logData.paymentStatus || 'SUCCEEDED', // SUCCEEDED, FAILED, REFUNDED
      transferStatus: logData.transferStatus || 'TRANSFERRED', // TRANSFERRED, PENDING, FAILED
      payoutStatus: logData.payoutStatus || (logData.transferStatus === 'FAILED' ? 'FAILED' : 'PAID'), // PAID, PENDING, FAILED, REVERSED
      transferId: logData.transferId || ('tr_' + Date.now()),
      payoutId: logData.payoutId || ('po_' + Date.now()),
      payoutDestination: logData.payoutDestination || logData.connectedAccountId,
      payoutDate: logData.payoutDate || new Date().toISOString(),
      payoutFailureReason: logData.payoutFailureReason || null,
      idempotencyKey: logData.idempotencyKey || ('idem_' + Date.now()),
      createdAt: logData.createdAt || new Date().toISOString()
    };

    db.data.financialAuditLogs.unshift(newLog);
    db.save();
    return newLog;
  }

  /**
   * Restituisce il report aggregato delle metriche finanziarie per l'Admin.
   */
  getFinancialSummary(requestingUser = null) {
    if (requestingUser && requestingUser.role !== 'admin') {
      return { totalTransactionsCount: 0, totalVolumeCents: 0, totalTransfersToOwnersCents: 0, totalGrossFeesCents: 0, totalProviderFeesCents: 0, totalNetPlatformRevenueCents: 0 };
    }
    const logs = (db.data.financialAuditLogs || []).filter(l => l.paymentStatus === 'SUCCEEDED');
    
    const totalVolumeCents = logs.reduce((acc, l) => acc + l.totalAmountCents, 0);
    const totalTransfersToOwnersCents = logs.reduce((acc, l) => acc + l.transferAmountCents, 0);
    const totalGrossFeesCents = logs.reduce((acc, l) => acc + l.buyyourshareFeeCents, 0);
    const totalProviderFeesCents = logs.reduce((acc, l) => acc + l.paymentProviderFeeCents, 0);
    const totalNetPlatformRevenueCents = logs.reduce((acc, l) => acc + l.netPlatformAmountCents, 0);

    return {
      totalTransactionsCount: logs.length,
      totalVolumeCents,
      totalTransfersToOwnersCents,
      totalGrossFeesCents,
      totalProviderFeesCents,
      totalNetPlatformRevenueCents
    };
  }

  /**
   * Recupera lo storico transazioni di un membro.
   */
  getMemberLogs(memberId, requestingUser = null) {
    if (requestingUser && requestingUser.id !== memberId && requestingUser.role !== 'admin') {
      return [];
    }
    return (db.data.financialAuditLogs || [])
      .filter(l => l.memberId === memberId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Recupera lo storico transazioni di una specifica sottoscrizione.
   */
  getSubscriptionLogs(groupId, memberId, slotNumber = null, requestingUser = null) {
    if (requestingUser && requestingUser.id !== memberId && requestingUser.role !== 'admin') {
      return [];
    }
    return (db.data.financialAuditLogs || [])
      .filter(l => l.groupId === groupId && l.memberId === memberId && (slotNumber ? l.slotNumber === slotNumber : true))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Recupera lo storico transazioni di un gruppo.
   */
  getGroupLogs(groupId) {
    return (db.data.financialAuditLogs || []).filter(l => l.groupId === groupId);
  }

  /**
   * Recupera lo storico accrediti e trasferimenti ricevuti dal Capogruppo sul proprio IBAN.
   */
  getOwnerPayoutLogs(ownerId, requestingUser = null) {
    if (requestingUser && requestingUser.id !== ownerId && requestingUser.role !== 'admin') {
      return [];
    }
    return (db.data.financialAuditLogs || [])
      .filter(l => l.connectedAccountId === ownerId && l.paymentStatus === 'SUCCEEDED')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Recupera tutte le transazioni per la visualizzazione Admin.
   */
  getAllLogs(requestingUser = null) {
    if (requestingUser && requestingUser.role !== 'admin') {
      return [];
    }
    return db.data.financialAuditLogs || [];
  }
}

export const financialAuditService = new FinancialAuditService();
