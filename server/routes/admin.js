/**
 * BuyYourShare - Server Admin Routes (RBAC Enforced: Solo Ruolo 'admin')
 * Dashboard KPI, Gestione Utenti, Gestione Gruppi con Eliminazione Definitiva e Audit Log
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getGroupSlotsBreakdown } from '../engine/MoneyEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const adminRouter = express.Router();

// 🔒 BLOCCO DI SICUREZZA SERVER-SIDE: Tutti gli endpoint richiedono autenticazione e ruolo 'admin'
adminRouter.use(requireAuth, requireRole('admin'));

// Endpoint di Pulizia Totale Produzione: Elimina tutti i gruppi, transazioni, messaggi e utenti di test
adminRouter.post('/clean-all-data', async (req, res) => {
  try {
    dataRepository.data.groups = [];
    dataRepository.data.accessInstructions = [];
    dataRepository.data.memberships = [];
    dataRepository.data.chats = [];
    dataRepository.data.chatMessages = [];
    dataRepository.data.connectedAccounts = [];
    dataRepository.data.financialAuditLogs = [];
    dataRepository.data.notifications = [];
    dataRepository.data.sessions = [];
    dataRepository.data.reports = [];
    dataRepository.data.users = (dataRepository.data.users || []).filter(u =>
      u.role === 'admin' ||
      u.email === 'emi.141991e@gmail.com' ||
      u.email === 'emi.141991e@libero.it'
    );
    await dataRepository.save();
    return res.json({
      success: true,
      message: 'Database di produzione completamente pulito e azzerato con successo.',
      remainingUsers: dataRepository.data.users.map(u => ({ email: u.email, fullName: u.fullName })),
      groupsCount: dataRepository.data.groups.length
    });
  } catch (err) {
    console.error('[ADMIN CLEAN ALL DATA ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// Endpoint di Manutenzione: Sincronizza lo stato del database pulito sul Volume Persistente
adminRouter.post('/sync-database-clean', async (req, res) => {
  try {
    const bundledDbPath = path.join(__dirname, '..', 'data', 'database.json');
    if (fs.existsSync(bundledDbPath)) {
      const raw = fs.readFileSync(bundledDbPath, 'utf8');
      const cleanDb = JSON.parse(raw);
      // Preserva gateway config se esistente
      if (dataRepository.data?.systemConfig) {
        cleanDb.systemConfig = dataRepository.data.systemConfig;
      }
      dataRepository.data = cleanDb;
      await dataRepository.save();
      return res.json({ success: true, message: 'Database sincronizzato con successo', groupsCount: dataRepository.data.groups.length });
    }
    return res.status(404).json({ error: 'FILE_NOT_FOUND' });
  } catch (err) {
    console.error('[ADMIN SYNC ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// Endpoint per riassegnare/collegare una membership a un gruppo
adminRouter.post('/assign-membership', async (req, res) => {
  try {
    const { membershipId, memberEmail, targetGroupId, slotNumber } = req.body;
    let mem = dataRepository.data.memberships.find(m => m.id === membershipId || (m.memberEmail && m.memberEmail.toLowerCase() === (memberEmail||'').toLowerCase()));
    if (!mem && memberEmail) {
      mem = {
        id: 'mem-' + Date.now(),
        userId: 'usr-1787319996013',
        memberEmail: memberEmail,
        groupId: targetGroupId,
        slotNumber: slotNumber || 2,
        role: 'MEMBER',
        paidShareCents: 120,
        paidFeeCents: 149,
        memberTotalCents: 269,
        paymentMethod: 'CARD_EEA',
        status: 'ACTIVE',
        autoRenew: true,
        stripeSubscriptionId: 'pi_3U6rmN1JpLY88mRL0jCOeuja',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
        nextBillingDate: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
        joinedAt: new Date().toISOString()
      };
      dataRepository.data.memberships.push(mem);
    } else if (mem) {
      mem.groupId = targetGroupId;
      if (slotNumber) mem.slotNumber = slotNumber;
    }
    
// Endpoint per sincronizzare o resettare i posti dei gruppi
adminRouter.post('/sync-group-slots', async (req, res) => {
  try {
    const { groupId, resetMemberships } = req.body;
    if (resetMemberships && groupId) {
      dataRepository.data.memberships = dataRepository.data.memberships.filter(m => m.groupId !== groupId || m.role === 'OWNER');
    }
    dataRepository.data.groups.forEach(g => {
      const occ = dataRepository.data.memberships.filter(m => m.groupId === g.id && m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')).length;
      g.occupiedMemberSlots = occ;
      g.status = occ >= g.availableSlots ? 'FULL' : 'PUBLISHED';
    });
    await dataRepository.save();
    return res.json({ success: true, groups: dataRepository.data.groups });
  } catch (err) {
    console.error('[SYNC GROUP SLOTS ERROR]', err);
    return res.status(500).json({ error: err.message });
  }
});


// 1. Dashboard KPI e Metriche Globali
adminRouter.get('/dashboard', async (req, res) => {
  try {
    const metrics = await dataRepository.getAdminDashboardMetrics();
    return res.json({
      success: true,
      metrics
    });
  } catch (err) {
    console.error('[ADMIN DASHBOARD GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// 2. Elenco Completo di TUTTI i Gruppi (DRAFT, PUBLISHED, FULL, CLOSED)
adminRouter.get('/groups', async (req, res) => {
  try {
    const rawGroups = await dataRepository.getGroups();
    const memberships = await dataRepository.getMemberships();
    const users = dataRepository.data.users || [];

    const enrichedGroups = rawGroups.map(g => {
      const owner = users.find(u => u.id === g.ownerId) || { id: g.ownerId, fullName: 'Sconosciuto', email: '' };
      const groupMemberships = memberships.filter(m => m.groupId === g.id && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));
      const slotsInfo = getGroupSlotsBreakdown(g, memberships, req.user);

      return {
        id: g.id,
        serviceId: g.serviceId,
        customServiceName: g.customServiceName,
        planName: g.planName,
        ownerId: g.ownerId,
        owner: {
          id: owner.id,
          fullName: owner.fullName,
          email: owner.email
        },
        status: g.status,
        totalSlots: g.totalSlots,
        ownerSlots: g.ownerSlots,
        availableSlots: g.availableSlots,
        occupiedMemberSlots: g.occupiedMemberSlots || 0,
        realSubscriptionCostCents: g.realSubscriptionCostCents,
        baseMemberShareCents: g.baseMemberShareCents,
        platformFeeCents: g.platformFeeCents,
        memberTotalCents: g.memberTotalCents,
        createdAt: g.createdAt,
        publishedAt: g.publishedAt,
        closedAt: g.closedAt,
        activeMembersCount: groupMemberships.filter(m => m.role === 'MEMBER').length,
        slotsInfo
      };
    });

    return res.json({
      success: true,
      groups: enrichedGroups
    });
  } catch (err) {
    console.error('[ADMIN GROUPS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// 3. Modifica Stato Gruppo (es. Chiusura o Ripubblicazione)
adminRouter.put('/groups/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const validStatuses = ['DRAFT', 'PAYOUT_NOT_READY', 'PUBLISHED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'INVALID_STATUS', message: `Stato non valido. Valori ammessi: ${validStatuses.join(', ')}` });
    }

    const group = await dataRepository.findGroupById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Gruppo non trovato.' });
    }

    const previousStatus = group.status;
    const updates = { status, updatedAt: new Date().toISOString() };
    if (status === 'PUBLISHED' && !group.publishedAt) {
      updates.publishedAt = new Date().toISOString();
      updates.isPublished = true;
    }
    if (status === 'CLOSED') {
      updates.closedAt = new Date().toISOString();
      updates.isPublished = false;
    }

    await dataRepository.updateGroup(group.id, updates);

    await dataRepository.logAdminAction({
      action: 'GROUP_STATUS_CHANGED',
      targetType: 'GROUP',
      targetId: group.id,
      targetName: `${group.customServiceName} (${group.planName})`,
      performedBy: req.user.id,
      performedByName: req.user.fullName,
      details: `Stato modificato da ${previousStatus} a ${status}.`
    });

    const updated = await dataRepository.findGroupById(group.id);
    return res.json({
      success: true,
      message: `Stato del gruppo aggiornato a ${status}.`,
      group: updated
    });
  } catch (err) {
    console.error('[ADMIN GROUP STATUS PUT ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// 4. ELIMINAZIONE FISICA DEFINITIVA GRUPPO (Hard Delete dal Database Operativo)
adminRouter.delete('/groups/:id', async (req, res) => {
  try {
    const groupId = req.params.id;
    const result = await dataRepository.deleteGroup(groupId, req.user);

    if (!result) {
      return res.status(404).json({ error: 'GROUP_NOT_FOUND', message: 'Gruppo non trovato o già eliminato.' });
    }

    return res.json({
      success: true,
      message: `Gruppo "${result.groupTitle}" eliminato definitivamente dal database.`,
      deletedGroupId: groupId
    });
  } catch (err) {
    console.error('[ADMIN DELETE GROUP ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// 5. Elenco Completo Utenti (Gestione Utenti)
adminRouter.get('/users', async (req, res) => {
  try {
    const users = await dataRepository.getAllUsersAdmin();
    return res.json({
      success: true,
      users
    });
  } catch (err) {
    console.error('[ADMIN USERS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// 6. Sospensione / Riattivazione Utente
adminRouter.post('/users/:id/toggle-suspend', async (req, res) => {
  try {
    const updatedUser = await dataRepository.toggleUserSuspend(req.params.id, req.user);
    if (!updatedUser) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Utente non trovato.' });
    }

    return res.json({
      success: true,
      message: `Utente ${updatedUser.fullName} ${updatedUser.isSuspended ? 'sospeso' : 'riattivato'} con successo.`,
      isSuspended: updatedUser.isSuspended,
      user: {
        id: updatedUser.id,
        fullName: updatedUser.fullName,
        email: updatedUser.email,
        isSuspended: updatedUser.isSuspended
      }
    });
  } catch (err) {
    console.error('[ADMIN TOGGLE SUSPEND ERROR]', err);
    return res.status(400).json({ error: 'ACTION_FAILED', message: err.message });
  }
});

// 7. Audit Log Integrato (Azioni Amministrative + Registro Finanziario)
adminRouter.get('/audit-logs', async (req, res) => {
  try {
    const adminLogs = await dataRepository.getAdminAuditLogs();
    const financialLogs = await dataRepository.getFinancialAuditLogs();

    return res.json({
      success: true,
      adminLogs,
      financialLogs
    });
  } catch (err) {
    console.error('[ADMIN AUDIT LOGS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

// 8. Configurazione Email / SMTP Gateway
adminRouter.get('/email-config', async (req, res) => {
  const emailSettings = dataRepository.data.systemConfig?.emailSettings || {};
  return res.json({
    success: true,
    emailSettings: {
      emailFrom: emailSettings.emailFrom || process.env.EMAIL_FROM || '"BuyYourShare" <noreply@buyyourshare.com>',
      gmailUser: emailSettings.gmailUser || process.env.GMAIL_USER || '',
      hasGmailPass: !!(emailSettings.gmailPass || process.env.GMAIL_APP_PASSWORD),
      smtpHost: emailSettings.smtpHost || process.env.SMTP_HOST || '',
      smtpPort: emailSettings.smtpPort || process.env.SMTP_PORT || 587,
      smtpUser: emailSettings.smtpUser || process.env.SMTP_USER || '',
      hasSmtpPass: !!(emailSettings.smtpPass || process.env.SMTP_PASS),
      hasResendApiKey: !!(emailSettings.resendApiKey || process.env.RESEND_API_KEY)
    }
  });
});

adminRouter.post('/email-config', async (req, res) => {
  try {
    const { emailFrom, gmailUser, gmailPass, smtpHost, smtpPort, smtpUser, smtpPass, resendApiKey } = req.body || {};
    if (!dataRepository.data.systemConfig) {
      dataRepository.data.systemConfig = {};
    }
    if (!dataRepository.data.systemConfig.emailSettings) {
      dataRepository.data.systemConfig.emailSettings = {};
    }

    const current = dataRepository.data.systemConfig.emailSettings;
    if (emailFrom !== undefined) current.emailFrom = emailFrom;
    if (gmailUser !== undefined) current.gmailUser = gmailUser;
    if (gmailPass) current.gmailPass = gmailPass;
    if (smtpHost !== undefined) current.smtpHost = smtpHost;
    if (smtpPort !== undefined) current.smtpPort = smtpPort;
    if (smtpUser !== undefined) current.smtpUser = smtpUser;
    if (smtpPass) current.smtpPass = smtpPass;
    if (resendApiKey) current.resendApiKey = resendApiKey;

    await dataRepository.save();

    return res.json({
      success: true,
      message: 'Configurazione email e SMTP salvata con successo.'
    });
  } catch (err) {
    console.error('[ADMIN EMAIL CONFIG SAVE ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

adminRouter.post('/test-email', async (req, res) => {
  try {
    const { to } = req.body || {};
    const targetEmail = to || req.user.email;
    const { emailService } = await import('../services/emailService.js');
    const nodemailer = (await import('nodemailer')).default;

    let smtpDiag = null;
    try {
      const transporter = emailService.getTransporter();
      if (transporter) {
        const info = await transporter.sendMail({
          from: '"BuyYourShare" <emi.141991e@gmail.com>',
          to: targetEmail,
          subject: '🧪 Test Diretto Gmail SMTP - BuyYourShare',
          text: 'Test invio diretto Gmail SMTP'
        });
        smtpDiag = { success: true, messageId: info.messageId, response: info.response };
      } else {
        smtpDiag = { success: false, error: 'NO_TRANSPORTER' };
      }
    } catch (err) {
      smtpDiag = { success: false, error: err.message, stack: err.stack };
    }

    const result = await emailService.sendMail({
      to: targetEmail,
      subject: '🧪 Test Invio Email - BuyYourShare Platform',
      html: `
        <div style="font-family:sans-serif; padding:20px; border:1px solid #003087; border-radius:8px;">
          <h2 style="color:#003087;">BuyYourShare Email Gateway Funzionante!</h2>
          <p>Questa è un'email di prova inviata con successo dal server di produzione BuyYourShare.</p>
          <p>Stato invio: <strong>${new Date().toLocaleString('it-IT')}</strong></p>
        </div>
      `,
      text: 'Test invio email da BuyYourShare completato con successo.'
    });

    return res.json({
      success: true,
      result,
      smtpDiag,
      message: `Email di test inviata a ${targetEmail} (Stato: ${result.status}).`
    });
  } catch (err) {
    console.error('[ADMIN TEST EMAIL ERROR]', err);
    return res.status(500).json({ error: 'SEND_FAILED', message: err.message });
  }
});

// 9. Configurazione Gateway di Pagamento (Stripe & PayPal)
adminRouter.get('/gateway-config', async (req, res) => {
  const stripeSecret = dataRepository.getStripeSecretKey();
  const stripePublishable = dataRepository.getStripePublishableKey();
  const stripeMode = process.env.STRIPE_MODE || dataRepository.data.systemConfig?.stripe?.mode || 'live';

  const ppClient = dataRepository.getPayPalClientId();
  const ppSecret = dataRepository.getPayPalClientSecret();
  const ppMode = dataRepository.getPayPalMode();

  return res.json({
    success: true,
    stripe: {
      hasSecretKey: !!(stripeSecret && stripeSecret.startsWith('sk_')),
      publishableKey: stripePublishable || '',
      mode: stripeMode
    },
    paypal: {
      mode: ppMode,
      clientId: ppClient || '',
      hasClientId: !!ppClient,
      hasClientSecret: !!(ppSecret && !ppSecret.includes('placeholder'))
    }
  });
});

adminRouter.post('/gateway-config', async (req, res) => {
  try {
    const { stripeSecretKey, stripePublishableKey, stripeMode, paypalClientId, paypalClientSecret, paypalMode } = req.body || {};
    
    if (!dataRepository.data.systemConfig) {
      dataRepository.data.systemConfig = {};
    }
    if (!dataRepository.data.systemConfig.stripe) {
      dataRepository.data.systemConfig.stripe = {};
    }
    if (!dataRepository.data.systemConfig.paypal) {
      dataRepository.data.systemConfig.paypal = {};
    }

    const s = dataRepository.data.systemConfig.stripe;
    if (stripeSecretKey) s.secretKey = stripeSecretKey.trim();
    if (stripePublishableKey) s.publishableKey = stripePublishableKey.trim();
    if (stripeMode) s.mode = stripeMode;

    const p = dataRepository.data.systemConfig.paypal;
    if (paypalClientId) p.clientId = paypalClientId.trim();
    if (paypalClientSecret) p.clientSecret = paypalClientSecret.trim();
    if (paypalMode) p.mode = paypalMode;

    await dataRepository.save();

    return res.json({
      success: true,
      message: 'Configurazione Gateway Stripe & PayPal salvata con successo nel database persistente.',
      stripe: {
        hasSecretKey: !!(s.secretKey && s.secretKey.startsWith('sk_')),
        publishableKey: s.publishableKey || '',
        mode: s.mode || 'live'
      },
      paypal: {
        hasClientId: !!p.clientId,
        hasClientSecret: !!p.clientSecret,
        mode: p.mode || 'live'
      }
    });
  } catch (err) {
    console.error('[ADMIN GATEWAY CONFIG SAVE ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

