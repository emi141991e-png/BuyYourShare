/**
 * BuyYourShare - Server Admin Routes (RBAC Enforced: Solo Ruolo 'admin')
 * Dashboard KPI, Gestione Utenti, Gestione Gruppi con Eliminazione Definitiva e Audit Log
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getGroupSlotsBreakdown } from '../engine/MoneyEngine.js';

export const adminRouter = express.Router();

// 🔒 BLOCCO DI SICUREZZA SERVER-SIDE: Tutti gli endpoint richiedono autenticazione e ruolo 'admin'
adminRouter.use(requireAuth, requireRole('admin'));

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
