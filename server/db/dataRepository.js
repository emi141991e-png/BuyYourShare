/**
 * BuyYourShare - Server DataRepository (Abstract Data Access Layer)
 * Gestione thread-safe con scritture atomiche su server/data/database.json.
 * Strutturato con interfaccia asincrona per poter passare a PostgreSQL/MySQL con zero modifiche alle route.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  INITIAL_SERVICES,
  INITIAL_USERS,
  INITIAL_CONNECTED_ACCOUNTS,
  INITIAL_GROUPS,
  INITIAL_ACCESS_INSTRUCTIONS,
  INITIAL_MEMBERSHIPS,
  INITIAL_CHATS,
  INITIAL_CHAT_MESSAGES
} from './seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;
const DB_FILE = process.env.DATABASE_PATH || path.join(DATA_DIR, 'database.json');

class DataRepository {
  constructor() {
    this.data = null;
    this._writeLock = Promise.resolve();
    this.init();
  }

  init() {
    if (!fs.existsSync(DATA_DIR)) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      } catch (err) {
        console.warn(`[DB] Impossibile creare DATA_DIR (${DATA_DIR}), uso fallback locale:`, err.message);
      }
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
        console.log(`[DB] Database persistente caricato da: ${DB_FILE}`);
      } catch (err) {
        console.error('[DB] Errore lettura database.json, reinizializzazione con seed...', err);
        this.data = this.createDefaultState();
        this.saveSync();
      }
    } else {
      // Se siamo su volume persistente Railway vuoto, copia lo stato esistente da DEFAULT_DATA_DIR se presente
      const bundledDb = path.join(DEFAULT_DATA_DIR, 'database.json');
      if (fs.existsSync(bundledDb) && DB_FILE !== bundledDb) {
        try {
          const raw = fs.readFileSync(bundledDb, 'utf8');
          this.data = JSON.parse(raw);
          console.log(`[DB] Database inizializzato sul Volume Persistente da: ${bundledDb}`);
          this.saveSync();
        } catch (copyErr) {
          console.warn('[DB] Fallita copia da bundledDb, uso defaultState:', copyErr.message);
          this.data = this.createDefaultState();
          this.saveSync();
        }
      } else {
        this.data = this.createDefaultState();
        this.saveSync();
      }
    }

    // MIGRAZIONE DI PRODUZIONE: Pulizia definitiva da qualsiasi vecchio gruppo demo legacy per ID
    if (this.data && Array.isArray(this.data.groups)) {
      const purgedIds = [
        'grp-1042', 'grp-1089', 'grp-1120', 'grp-youtube-famiglia',
        'grp-1787178342100', // Canva Pro
        'grp-1787177542100', // CapCut Pro
        'grp-1787176742344', // YouTube Premium demo
        'grp-1787174165672', // Gemini Advanced demo
        'grp-1787083131405', 'grp-1787084045714', 'grp-1787085411282',
        'grp-1787085891636', 'grp-1787086615133', 'grp-1787087909072',
        'grp-1787072082706', 'grp-1787072412882'
      ];
      const beforeCount = this.data.groups.length;
      this.data.groups = this.data.groups.filter(g => !purgedIds.includes(g.id));
      if (this.data.memberships) {
        this.data.memberships = this.data.memberships.filter(m => !purgedIds.includes(m.groupId));
      }
      if (this.data.chats) {
        this.data.chats = this.data.chats.filter(c => !purgedIds.includes(c.groupId));
      }
      if (this.data.groups.length !== beforeCount) {
        console.log(`[DB] Migrazione: rimossi ${beforeCount - this.data.groups.length} gruppi demo legacy dal database persistente.`);
        this.saveSync();
      }
    }

    // Assicura che il gruppo reale di Marco Rossi sia presente e pubblicato
    if (this.data && Array.isArray(this.data.groups)) {
      const hasMarco = this.data.groups.some(g => g.id === 'grp-1787066374922');
      if (!hasMarco) {
        this.data.groups.push({
          id: 'grp-1787066374922',
          ownerId: 'usr-owner-1',
          serviceId: 'srv-spotify',
          customServiceName: 'Spotify',
          planName: 'Spotify Family (6 Account)',
          realSubscriptionCostCents: 2099,
          totalSlots: 6,
          ownerSlots: 1,
          availableSlots: 5,
          occupiedMemberSlots: 0,
          baseMemberShareCents: 350,
          platformFeeCents: 149,
          memberTotalCents: 499,
          groupType: 'public',
          status: 'PUBLISHED',
          isPublished: true,
          publishedAt: '2026-08-18T15:19:34.946Z',
          inviteCode: 'BYS-7127',
          rulesAndRequirements: 'Invito ufficiale Spotify Family tramite email.',
          description: 'Gruppo Spotify Family gestito da Marco Rossi con rinnovo puntuale.',
          createdAt: '2026-08-18T15:19:34.922Z',
          updatedAt: '2026-08-18T15:19:34.922Z'
        });
        this.saveSync();
      }
    }
  }

  createDefaultState() {
    return {
      users: JSON.parse(JSON.stringify(INITIAL_USERS)),
      services: JSON.parse(JSON.stringify(INITIAL_SERVICES)),
      groups: JSON.parse(JSON.stringify(INITIAL_GROUPS)),
      memberships: JSON.parse(JSON.stringify(INITIAL_MEMBERSHIPS)),
      accessInstructions: JSON.parse(JSON.stringify(INITIAL_ACCESS_INSTRUCTIONS)),
      chats: JSON.parse(JSON.stringify(INITIAL_CHATS)),
      chatMessages: JSON.parse(JSON.stringify(INITIAL_CHAT_MESSAGES)),
      connectedAccounts: JSON.parse(JSON.stringify(INITIAL_CONNECTED_ACCOUNTS)),
      financialAuditLogs: [],
      notifications: [],
      sessions: []
    };
  }

  saveSync() {
    const tempFile = DB_FILE + '.tmp.' + Date.now();
    fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  }

  async save() {
    this._writeLock = this._writeLock.then(async () => {
      const tempFile = DB_FILE + '.tmp.' + Date.now();
      await fs.promises.writeFile(tempFile, JSON.stringify(this.data, null, 2), 'utf8');
      await fs.promises.rename(tempFile, DB_FILE);
    });
    return this._writeLock;
  }

  // ==========================================
  // USERS & SESSIONS
  // ==========================================
  async findUserById(id) {
    return this.data.users.find(u => u.id === id) || null;
  }

  async findUserByEmail(email) {
    if (!email) return null;
    const clean = email.trim().toLowerCase();
    return this.data.users.find(u => u.email.toLowerCase() === clean) || null;
  }

  async createUser(userData) {
    this.data.users.push(userData);
    await this.save();
    return userData;
  }

  async updateUser(id, updateData) {
    const user = await this.findUserById(id);
    if (!user) return null;
    Object.assign(user, updateData, { updatedAt: new Date().toISOString() });
    await this.save();
    return user;
  }

  async createSession(userId) {
    const token = 'bys_token_' + Date.now() + '_' + Math.random().toString(36).substring(2, 12);
    const now = Date.now();
    const session = {
      token,
      userId,
      createdAt: new Date(now).toISOString(),
      lastActivityAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 15 * 60 * 1000).toISOString() // 15 minuti di inattività per qualunque profilo
    };
    this.data.sessions.push(session);
    await this.save();
    return session;
  }

  async findSession(token) {
    if (!token) return null;
    return this.data.sessions.find(s => s.token === token) || null;
  }

  async deleteSession(token) {
    this.data.sessions = this.data.sessions.filter(s => s.token !== token);
    await this.save();
  }

  // ==========================================
  // GROUPS & SERVICES
  // ==========================================
  async getServices() {
    return this.data.services;
  }

  async getGroups(filter = {}) {
    let list = this.data.groups;
    if (filter.serviceId) {
      list = list.filter(g => g.serviceId === filter.serviceId);
    }
    if (filter.ownerId) {
      list = list.filter(g => g.ownerId === filter.ownerId);
    }
    if (filter.status) {
      list = list.filter(g => g.status === filter.status);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(g => 
        g.customServiceName.toLowerCase().includes(q) || 
        g.planName.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
      );
    }
    return list;
  }

  async findGroupById(id) {
    return this.data.groups.find(g => g.id === id) || null;
  }

  async createGroup(groupData) {
    this.data.groups.push(groupData);
    await this.save();
    return groupData;
  }

  async updateGroup(id, updateData) {
    const group = await this.findGroupById(id);
    if (!group) return null;
    Object.assign(group, updateData, { updatedAt: new Date().toISOString() });
    await this.save();
    return group;
  }

  // ==========================================
  // MEMBERSHIPS
  // ==========================================
  async getMemberships(filter = {}) {
    let list = this.data.memberships;
    if (filter.groupId) {
      list = list.filter(m => m.groupId === filter.groupId);
    }
    if (filter.userId) {
      list = list.filter(m => m.userId === filter.userId);
    }
    if (filter.slotNumber !== undefined) {
      list = list.filter(m => m.slotNumber === filter.slotNumber);
    }
    if (filter.role) {
      list = list.filter(m => m.role === filter.role);
    }
    if (filter.status) {
      list = list.filter(m => m.status === filter.status);
    }
    return list;
  }

  async findMembershipById(id) {
    return this.data.memberships.find(m => m.id === id) || null;
  }

  async createMembership(memData) {
    this.data.memberships.push(memData);
    await this.save();
    return memData;
  }

  async updateMembership(id, updateData) {
    const mem = await this.findMembershipById(id);
    if (!mem) return null;
    Object.assign(mem, updateData, { updatedAt: new Date().toISOString() });
    await this.save();
    return mem;
  }

  // ==========================================
  // ACCESS INSTRUCTIONS
  // ==========================================
  async getAccessInstructions(groupId) {
    return this.data.accessInstructions.find(a => a.groupId === groupId) || null;
  }

  async saveAccessInstructions(groupId, data) {
    let inst = await this.getAccessInstructions(groupId);
    if (!inst) {
      inst = { id: 'acc-' + Date.now(), groupId: groupId, ...data };
      this.data.accessInstructions.push(inst);
    } else {
      Object.assign(inst, data);
    }
    await this.save();
    return inst;
  }

  // ==========================================
  // CHATS & MESSAGES
  // ==========================================
  async getChatByGroupId(groupId) {
    let chat = this.data.chats.find(c => c.groupId === groupId);
    if (!chat) {
      chat = { id: 'cht-' + Date.now(), groupId, status: 'ACTIVE', createdAt: new Date().toISOString() };
      this.data.chats.push(chat);
      await this.save();
    }
    return chat;
  }

  async getChatMessages(chatId) {
    return this.data.chatMessages.filter(m => m.chatId === chatId);
  }

  async addChatMessage(msgData) {
    this.data.chatMessages.push(msgData);
    await this.save();
    return msgData;
  }

  // ==========================================
  // CONNECTED ACCOUNTS (STRIPE CONNECT)
  // ==========================================
  async findConnectedAccountByUserId(userId) {
    return this.data.connectedAccounts.find(c => c.userId === userId) || null;
  }

  async saveConnectedAccount(data) {
    let conn = await this.findConnectedAccountByUserId(data.userId);
    if (!conn) {
      conn = { id: 'conn-' + Date.now(), ...data };
      this.data.connectedAccounts.push(conn);
    } else {
      Object.assign(conn, data);
    }
    await this.save();
    return conn;
  }

  // ==========================================
  // FINANCIAL AUDIT LOGS (LEDGER IMMUTABILE)
  // ==========================================
  async getFinancialAuditLogs(filter = {}) {
    let list = this.data.financialAuditLogs || [];
    if (filter.memberId) {
      list = list.filter(l => l.memberId === filter.memberId);
    }
    if (filter.connectedAccountId || filter.ownerId) {
      const ownerId = filter.connectedAccountId || filter.ownerId;
      list = list.filter(l => l.connectedAccountId === ownerId);
    }
    if (filter.groupId) {
      list = list.filter(l => l.groupId === filter.groupId);
    }
    if (filter.idempotencyKey) {
      list = list.filter(l => l.idempotencyKey === filter.idempotencyKey);
    }
    return list;
  }

  async recordFinancialAuditLog(logData) {
    // Controllo Idempotenza Reale
    if (logData.idempotencyKey) {
      const existing = (this.data.financialAuditLogs || []).find(l => l.idempotencyKey === logData.idempotencyKey);
      if (existing) {
        console.warn(`[LEDGER] Transazione già registrata (Idempotency Key: ${logData.idempotencyKey})`);
        return existing;
      }
    }

    const newLog = {
      id: 'tx_log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      ...logData,
      createdAt: new Date().toISOString()
    };

    if (!this.data.financialAuditLogs) this.data.financialAuditLogs = [];
    this.data.financialAuditLogs.push(newLog);
    await this.save();
    return newLog;
  }

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  async getNotifications(userId) {
    return (this.data.notifications || []).filter(n => n.userId === userId);
  }

  async addNotification(data) {
    const notif = {
      id: 'notif-' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      isRead: false,
      createdAt: new Date().toISOString(),
      ...data
    };
    if (!this.data.notifications) this.data.notifications = [];
    this.data.notifications.push(notif);
    await this.save();
    return notif;
  }

  async markNotificationsRead(userId) {
    if (!this.data.notifications) return;
    this.data.notifications.forEach(n => {
      if (n.userId === userId) n.isRead = true;
    });
    await this.save();
  }

  // ==========================================
  // ADMIN DASHBOARD & MANAGEMENT
  // ==========================================
  async getAdminDashboardMetrics() {
    const users = this.data.users || [];
    const groups = this.data.groups || [];
    const memberships = this.data.memberships || [];
    const logs = this.data.financialAuditLogs || [];

    const totalUsers = users.length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const ownerCount = users.filter(u => u.role === 'owner' || groups.some(g => g.ownerId === u.id)).length;
    const memberCount = totalUsers - adminCount - (ownerCount > 0 ? ownerCount : 0);

    const totalGroups = groups.length;
    const publishedGroups = groups.filter(g => g.status === 'PUBLISHED' || g.status === 'active').length;
    const fullGroups = groups.filter(g => g.status === 'FULL' || g.status === 'full').length;
    const draftGroups = groups.filter(g => g.status === 'DRAFT').length;
    const payoutNotReadyGroups = groups.filter(g => g.status === 'PAYOUT_NOT_READY').length;
    const closedGroups = groups.filter(g => g.status === 'CLOSED' || g.status === 'cancellation_scheduled').length;

    let totalSlots = 0;
    let occupiedSlots = 0;
    let availableSlots = 0;

    groups.forEach(g => {
      if (g.status === 'PUBLISHED' || g.status === 'FULL' || g.status === 'active') {
        totalSlots += (g.totalSlots || 0);
        occupiedSlots += (g.ownerSlots || 1) + (g.occupiedMemberSlots || 0);
        availableSlots += Math.max(0, (g.availableSlots || 0) - (g.occupiedMemberSlots || 0));
      }
    });

    const totalVolumeCents = logs.reduce((acc, l) => acc + (l.totalAmountCents || 0), 0);
    const totalGrossFeesCents = logs.reduce((acc, l) => acc + (l.buyyourshareFeeCents || 149), 0);
    const totalProviderFeesCents = logs.reduce((acc, l) => acc + (l.paymentProviderFeeCents || 0), 0);
    const totalNetPlatformRevenueCents = logs.reduce((acc, l) => acc + (l.netPlatformAmountCents || 0), 0);
    const totalTransferredToOwnersCents = logs.filter(l => l.transferStatus === 'TRANSFERRED' || l.payoutStatus === 'PAID')
      .reduce((acc, l) => acc + (l.baseShareCents || 0), 0);

    return {
      users: {
        total: totalUsers,
        members: Math.max(0, memberCount),
        owners: ownerCount,
        admins: adminCount
      },
      groups: {
        total: totalGroups,
        published: publishedGroups,
        full: fullGroups,
        draft: draftGroups,
        payoutNotReady: payoutNotReadyGroups,
        closed: closedGroups,
        totalSlots,
        occupiedSlots,
        availableSlots
      },
      finance: {
        totalVolumeCents,
        totalGrossFeesCents,
        totalProviderFeesCents,
        totalNetPlatformRevenueCents,
        totalTransferredToOwnersCents,
        transactionsCount: logs.length
      }
    };
  }

  async getAllUsersAdmin() {
    const users = this.data.users || [];
    const groups = this.data.groups || [];
    const memberships = this.data.memberships || [];

    return users.map(u => {
      const createdGroupsCount = groups.filter(g => g.ownerId === u.id).length;
      const activeMembershipsCount = memberships.filter(m => m.userId === u.id && m.status === 'ACTIVE').length;
      const { password, ...safeUser } = u;
      return {
        ...safeUser,
        createdGroupsCount,
        activeMembershipsCount
      };
    });
  }

  async toggleUserSuspend(userId, adminUser) {
    const user = await this.findUserById(userId);
    if (!user) return null;
    if (user.role === 'admin') {
      throw new Error('Non è possibile sospendere un account Amministratore.');
    }

    user.isSuspended = !user.isSuspended;
    user.updatedAt = new Date().toISOString();

    if (user.isSuspended) {
      // Invalida tutte le sessioni attive dell'utente sospeso
      this.data.sessions = (this.data.sessions || []).filter(s => s.userId !== userId);
    }

    await this.logAdminAction({
      action: user.isSuspended ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
      targetType: 'USER',
      targetId: user.id,
      targetName: user.fullName || user.email,
      performedBy: adminUser.id,
      performedByName: adminUser.fullName,
      details: `Account ${user.isSuspended ? 'sospeso' : 'riattivato'} dall'amministratore.`
    });

    await this.save();
    return user;
  }

  async deleteGroup(groupId, adminUser) {
    const group = await this.findGroupById(groupId);
    if (!group) return null;

    const groupTitle = `${group.customServiceName} (${group.planName})`;

    // 0. Se esistono subscriptions PayPal collegate a questo gruppo, richiedi la terminazione al provider
    const groupMemberships = (this.data.memberships || []).filter(m => m.groupId === groupId);
    for (const m of groupMemberships) {
      if (m.paypalSubscriptionId && m.paypalSubscriptionId.startsWith('I-')) {
        try {
          const { paypalBillingService } = await import('../services/paypalBillingService.js');
          await paypalBillingService.cancelSubscription(m.paypalSubscriptionId, `Gruppo ${groupTitle} chiuso/eliminato`);
        } catch (e) {}
      }
    }

    // 1. Rimuovi il gruppo dal catalogo operativo
    this.data.groups = this.data.groups.filter(g => g.id !== groupId);

    // 2. Rimuovi memberships operative collegate (se presenti)
    this.data.memberships = (this.data.memberships || []).filter(m => m.groupId !== groupId);

    // 3. Rimuovi istruzioni di accesso
    this.data.accessInstructions = (this.data.accessInstructions || []).filter(a => a.groupId !== groupId);

    // 4. Rimuovi chat operativa associata e messaggi
    const chat = (this.data.chats || []).find(c => c.groupId === groupId);
    if (chat) {
      this.data.chats = this.data.chats.filter(c => c.id !== chat.id);
      this.data.chatMessages = (this.data.chatMessages || []).filter(m => m.chatId !== chat.id);
    }

    // 5. Rimuovi notifiche collegate al gruppo
    this.data.notifications = (this.data.notifications || []).filter(n => !(n.actionUrl && (n.actionUrl.includes(groupId) || n.actionUrl.includes(chat?.id || '---'))));

    // 6. PRESERVAZIONE RIGOROSA DEI DATI FINANZIARI:
    // Non tocca mai this.data.financialAuditLogs (il Ledger contabile rimane intatto e immutabile)

    // 7. Registra l'azione nel registro Audit Amministrativo
    await this.logAdminAction({
      action: 'GROUP_DELETED',
      targetType: 'GROUP',
      targetId: groupId,
      targetName: groupTitle,
      performedBy: adminUser ? adminUser.id : 'usr-admin',
      performedByName: adminUser ? adminUser.fullName : 'Admin BuyYourShare',
      details: `Eliminazione fisica definitiva del gruppo ${groupTitle} e di tutte le membership/chat collegate dal database operativo.`
    });

    await this.save();
    return { success: true, deletedGroupId: groupId, groupTitle };
  }

  async logAdminAction(actionData) {
    if (!this.data.adminAuditLogs) this.data.adminAuditLogs = [];
    const entry = {
      id: 'adm_log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toISOString(),
      ...actionData
    };
    this.data.adminAuditLogs.unshift(entry); // Il più recente in cima
    await this.save();
    return entry;
  }

  async getAdminAuditLogs() {
    return this.data.adminAuditLogs || [];
  }

  getStripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY || this.data.systemConfig?.stripe?.secretKey || '';
  }

  getStripePublishableKey() {
    return process.env.STRIPE_PUBLISHABLE_KEY || this.data.systemConfig?.stripe?.publishableKey || '';
  }

  getPayPalClientId() {
    return process.env.PAYPAL_CLIENT_ID || this.data.systemConfig?.paypal?.clientId || '';
  }

  getPayPalClientSecret() {
    return process.env.PAYPAL_CLIENT_SECRET || this.data.systemConfig?.paypal?.clientSecret || '';
  }

  getPayPalMode() {
    return process.env.PAYPAL_MODE || this.data.systemConfig?.paypal?.mode || 'live';
  }
}

export const dataRepository = new DataRepository();
