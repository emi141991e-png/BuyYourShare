/**
 * BuyYourShare - Server Memberships Routes
 */

import express from 'express';
import { dataRepository } from '../db/dataRepository.js';
import { requireAuth } from '../middleware/auth.js';

export const membershipsRouter = express.Router();

// 1. I Miei Abbonamenti (Membro)
membershipsRouter.get('/my', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const allMems = await dataRepository.getMemberships();
    const groups = dataRepository.data.groups;
    const users = dataRepository.data.users;

    const rawMems = allMems.filter(m => {
      if (m.userId === user.id) return true;
      if (m.memberEmail && m.memberEmail.toLowerCase() === user.email.toLowerCase()) return true;
      const memUser = users.find(u => u.id === m.userId);
      return memUser && memUser.email && memUser.email.toLowerCase() === user.email.toLowerCase();
    });

    let modified = false;
    const result = rawMems.map(m => {
      if (m.userId !== user.id) {
        m.userId = user.id;
        modified = true;
      }
      const grp = groups.find(g => g.id === m.groupId);
      const owner = grp ? users.find(u => u.id === grp.ownerId) : null;
      return {
        ...m,
        group: grp ? {
          id: grp.id,
          customServiceName: grp.customServiceName,
          planName: grp.planName,
          serviceId: grp.serviceId,
          status: grp.status,
          owner: owner ? { id: owner.id, fullName: owner.fullName } : null
        } : (m.group || {
          id: m.groupId,
          customServiceName: 'Spotify',
          planName: 'Spotify Family (6 Account)',
          serviceId: 'srv-spotify',
          status: 'PUBLISHED'
        })
      };
    });

    if (modified) {
      await dataRepository.save();
    }

    return res.json({ memberships: result });
  } catch (err) {
    console.error('[MY MEMBERSHIPS GET ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// 2. Annullamento Rinnovo Automatico
membershipsRouter.post('/:id/cancel-auto-renew', requireAuth, async (req, res) => {
  try {
    const mem = await dataRepository.findMembershipById(req.params.id);
    if (!mem) return res.status(404).json({ error: 'NOT_FOUND' });

    if (mem.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    await dataRepository.updateMembership(mem.id, {
      autoRenew: false,
      status: 'CANCELLATION_SCHEDULED'
    });

    await dataRepository.addNotification({
      userId: mem.userId,
      title: 'Rinnovo Automatico Disattivato',
      message: `Il rinnovo automatico è stato annullato. L'accesso rimane valido fino al ${new Date(mem.currentPeriodEnd).toLocaleDateString('it-IT')}.`,
      actionUrl: '#miei-abbonamenti'
    });

    return res.json({ success: true, membership: mem });
  } catch (err) {
    console.error('[CANCEL AUTO RENEW ERROR]', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});
