/**
 * BuyYourShare - Relational Database Manager
 * Gestione sicura, isolata e persistente del database marketplace P2P
 */

import {
  INITIAL_SERVICES,
  INITIAL_USERS,
  INITIAL_GROUPS,
  INITIAL_ACCESS_INSTRUCTIONS,
  INITIAL_MEMBERSHIPS,
  INITIAL_CHATS,
  INITIAL_CHAT_MESSAGES
} from './seed.js';
import { calculatePricingBreakdown, DEFAULT_PLATFORM_FEE_CENTS, validateGroupEconomicMargin } from '../engine/FeeEngine.js';
import { calculateMonthlyPeriod, isPeriodExpired } from '../engine/DateEngine.js';

const DB_KEY = 'buyyourshare_db_v6';

class Database {
  constructor() {
    this.data = this.load() || this.seed();
    if (!this.data.services) this.data.services = [];
    if (!this.data.users) this.data.users = [];
    if (!this.data.groups) this.data.groups = [];
    if (!this.data.accessInstructions) this.data.accessInstructions = [];
    if (!this.data.memberships) this.data.memberships = [];
    if (!this.data.chats) this.data.chats = [];
    if (!this.data.chatMessages) this.data.chatMessages = [];
    if (!this.data.reports) this.data.reports = [];
    if (!this.data.notifications) this.data.notifications = [];
    if (!this.data.connectedAccounts) this.data.connectedAccounts = [];
    if (!this.data.financialAuditLogs) this.data.financialAuditLogs = [];

    // Pulizia rigorosa da qualsiasi vecchio gruppo demo
    this.data.groups = this.data.groups.filter(g => 
      g.id !== 'grp-1042' && 
      g.id !== 'grp-1089' && 
      g.id !== 'grp-1120' && 
      g.planName !== 'Canva for Teams' && 
      g.planName !== 'YouTube Famiglia' &&
      g.status !== 'CLOSED'
    );

    if (this.data.connectedAccounts) {
      if (!this.data.connectedAccounts.some(c => c.userId === 'usr-owner-1')) {
        this.data.connectedAccounts.push({
          id: 'conn-1',
          userId: 'usr-owner-1',
          stripeAccountId: 'acct_1N42MarcoRossi',
          payoutsEnabled: true,
          chargesEnabled: true,
          detailsSubmitted: true,
          onboardingStatus: 'completed',
          bankLast4: '3456',
          country: 'IT',
          defaultCurrency: 'eur',
          onboardedAt: new Date().toISOString()
        });
      }
      if (!this.data.connectedAccounts.some(c => c.userId === 'usr-owner-2')) {
        this.data.connectedAccounts.push({
          id: 'conn-2',
          userId: 'usr-owner-2',
          stripeAccountId: 'acct_1N43SaraBianchi',
          payoutsEnabled: true,
          chargesEnabled: true,
          detailsSubmitted: true,
          onboardingStatus: 'completed',
          bankLast4: '9012',
          country: 'IT',
          defaultCurrency: 'eur',
          onboardedAt: new Date().toISOString()
        });
      }
    }
    if (this.data.memberships && this.data.financialAuditLogs) {
      const activeMembers = this.data.memberships.filter(m => m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));
      let added = false;
      activeMembers.forEach(m => {
        const hasLog = this.data.financialAuditLogs.some(l => l.memberId === m.userId && l.groupId === m.groupId && l.slotNumber === m.slotNumber);
        if (!hasLog) {
          const grp = this.data.groups.find(g => g.id === m.groupId);
          const feeCents = m.paidFeeCents !== undefined ? m.paidFeeCents : 149;
          const shareCents = m.paidShareCents || (grp ? grp.baseMemberShareCents : 350);
          const totalCents = m.memberTotalCents || (shareCents + feeCents);
          const isPayPal = (m.paymentMethod && m.paymentMethod.includes('PAYPAL')) || !!m.paypalSubscriptionId;
          const providerFee = isPayPal ? (Math.round(totalCents * 0.022) + 25) : 36;

          this.data.financialAuditLogs.push({
            id: 'aud-' + Date.now() + '-' + m.slotNumber,
            transactionId: m.paypalSubscriptionId ? ('pp_tx_' + m.paypalSubscriptionId) : ('tx_' + Date.now()),
            invoiceId: m.paypalSubscriptionId ? ('pp_sale_' + Date.now()) : ('in_' + Date.now()),
            subscriptionId: m.paypalSubscriptionId || m.stripeSubscriptionId || ('sub_' + Date.now()),
            connectedAccountId: grp ? grp.ownerId : 'usr-owner-1',
            memberId: m.userId,
            groupId: m.groupId,
            slotNumber: m.slotNumber,
            baseShareCents: shareCents,
            buyyourshareFeeCents: feeCents,
            totalAmountCents: totalCents,
            paymentProviderFeeCents: providerFee,
            netPlatformAmountCents: feeCents - providerFee,
            transferAmountCents: shareCents,
            cycleNumber: 1,
            paymentMethod: m.paymentMethod || (isPayPal ? 'PAYPAL_EEA' : 'CARD_EEA'),
            paymentStatus: 'SUCCEEDED',
            transferStatus: 'TRANSFERRED',
            idempotencyKey: `auto_sync_${m.id}`,
            createdAt: m.joinedAt || new Date().toISOString()
          });
          added = true;
        }
      });
      if (added) this.save();
    }
    this.checkExpirations();
    this.save();
  }

  async syncGroupsFromServer() {
    try {
      const resp = await fetch('/api/groups');
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.groups)) {
          this.data.groups = data.groups;
          this.save();
        }
      }
    } catch (err) {
      console.warn('[DB] Sync gruppi dal server non riuscita:', err.message);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.data));
    } catch (e) {}
  }

  seed() {
    const initial = {
      platformConfig: {
        platformFeeCents: DEFAULT_PLATFORM_FEE_CENTS // 99 centesimi (0,99 €)
      },
      services: [...INITIAL_SERVICES],
      users: [...INITIAL_USERS],
      groups: [...INITIAL_GROUPS],
      accessInstructions: [...INITIAL_ACCESS_INSTRUCTIONS],
      memberships: [...INITIAL_MEMBERSHIPS],
      chats: [...INITIAL_CHATS],
      chatMessages: [...INITIAL_CHAT_MESSAGES],
      connectedAccounts: [
        {
          id: 'conn-1',
          userId: 'usr-owner-1',
          stripeAccountId: 'acct_test_owner1',
          payoutsEnabled: true,
          chargesEnabled: true,
          defaultCurrency: 'eur',
          onboardedAt: new Date().toISOString()
        }
      ],
      financialAuditLogs: [],
      joinRequests: [],
      notifications: [
        {
          id: 'notif-1',
          userId: 'usr-member-1',
          type: 'access_ready',
          title: '🎉 Il tuo accesso Spotify è pronto!',
          message: 'Sei entrata nel gruppo Spotify Family. Apri "Il Tuo Accesso" per vedere il link di invito.',
          actionUrl: '#miei-abbonamenti',
          isRead: false,
          createdAt: new Date().toISOString()
        }
      ],
      reports: []
    };
    this.data = initial;
    this.save();
    return initial;
  }

  resetToDefault() {
    localStorage.removeItem(DB_KEY);
    this.data = this.seed();
    return this.data;
  }

  // ==========================================
  // PERIOD EXPIRATION CHECKER
  // ==========================================
  checkExpirations() {
    const now = new Date();
    let modified = false;

    // Controlla scadenze memberships
    this.data.memberships.forEach(m => {
      if (m.status === 'CANCELLATION_SCHEDULED' && isPeriodExpired(m.currentPeriodEnd, now)) {
        m.status = 'EXPIRED';
        modified = true;

        // Libera lo slot nel gruppo
        const grp = this.data.groups.find(g => g.id === m.groupId);
        if (grp) {
          grp.occupiedMemberSlots = Math.max(0, grp.occupiedMemberSlots - 1);
          if (grp.status === 'full') grp.status = 'active';
        }

        // Rimuovi dalla chat attiva
        const chat = this.data.chats.find(c => c.groupId === m.groupId);
        if (chat) {
          this.data.chatMessages.push({
            id: 'msg_sys_' + Date.now(),
            chatId: chat.id,
            senderId: null,
            messageType: 'SYSTEM',
            messageContent: `⏳ Il periodo di un membro è scaduto.`,
            createdAt: new Date().toISOString()
          });
        }
      }
    });

    // Controlla scadenze gruppi con cancellazione programmata
    this.data.groups.forEach(g => {
      if (g.status === 'cancellation_scheduled') {
        const activeMembers = this.data.memberships.filter(m => m.groupId === g.id && m.status === 'ACTIVE' && m.role === 'MEMBER');
        if (activeMembers.length === 0) {
          g.status = 'terminated';
          const chat = this.data.chats.find(c => c.groupId === g.id);
          if (chat) chat.status = 'ARCHIVED';
          modified = true;
        }
      }
    });

    if (modified) this.save();
  }

  // ==========================================
  // CONFIG & SERVICES
  // ==========================================
  getPlatformFeeCents() {
    return this.data.platformConfig?.platformFeeCents || DEFAULT_PLATFORM_FEE_CENTS;
  }

  setPlatformFeeCents(cents) {
    this.data.platformConfig.platformFeeCents = parseInt(cents, 10);
    this.save();
  }

  getServices() {
    return this.data.services.filter(s => s.isActive);
  }

  getAllServicesAdmin() {
    return this.data.services;
  }

  addService(serviceData) {
    const slug = serviceData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newService = {
      id: 'srv-' + Date.now(),
      name: serviceData.name.trim(),
      slug: slug,
      category: serviceData.category || 'Altro',
      iconLetter: serviceData.name.substring(0, 2).toUpperCase(),
      brandColor: serviceData.brandColor || '#4F46E5',
      maxAllowedSlots: parseInt(serviceData.maxAllowedSlots, 10) || 6,
      isVerifiedByAdmin: serviceData.isVerifiedByAdmin || false,
      isActive: true,
      complianceNotes: serviceData.complianceNotes || 'Condivisione autorizzata secondo i termini del fornitore.',
      createdAt: new Date().toISOString()
    };
    this.data.services.push(newService);
    this.save();
    return newService;
  }

  // ==========================================
  // GROUPS, SLOTS & PRICING
  // ==========================================
  getGroupSlotsBreakdown(group) {
    const feeCents = this.getPlatformFeeCents();
    const pricing = calculatePricingBreakdown(group.realSubscriptionCostCents, group.totalSlots, feeCents);
    const shares = pricing.exactSharesCents; // Array di quote esatte per ogni posto (es. [350, 350, 350, 350, 350, 349])

    const activeMemberships = this.data.memberships.filter(m =>
      m.groupId === group.id && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')
    );

    // Mappa ogni slot
    const slots = shares.map((shareCents, idx) => {
      const slotNumber = idx + 1;
      const isOwnerSlot = idx < group.ownerSlots;
      
      let assignedMembership = null;
      if (isOwnerSlot) {
        assignedMembership = activeMemberships.find(m => m.role === 'OWNER');
      } else {
        // Assegna in base allo slotNumber registrato o all'indice del membro
        assignedMembership = activeMemberships.find(m => m.role === 'MEMBER' && m.slotNumber === slotNumber) || null;
      }

      const isOccupied = !!assignedMembership;
      const memberTotalCents = isOwnerSlot ? shareCents : (shareCents + feeCents);

      return {
        slotIndex: idx,
        slotNumber,
        isOwnerSlot,
        isOccupied,
        baseShareCents: shareCents,
        platformFeeCents: isOwnerSlot ? 0 : feeCents,
        memberTotalCents,
        assignedUser: assignedMembership ? this.data.users.find(u => u.id === assignedMembership.userId) : null,
        membership: assignedMembership
      };
    });

    const availableMemberSlots = slots.filter(s => !s.isOwnerSlot && !s.isOccupied);
    const nextAvailableSlot = availableMemberSlots.length > 0 ? availableMemberSlots[0] : null;

    return {
      slots,
      pricing,
      totalSlots: group.totalSlots,
      occupiedSlotsCount: slots.filter(s => s.isOccupied).length,
      availableSlotsCount: availableMemberSlots.length,
      nextAvailableSlot,
      minMemberTotalCents: pricing.exactSharesCents.slice(group.ownerSlots).length > 0 
        ? Math.min(...pricing.exactSharesCents.slice(group.ownerSlots)) + feeCents 
        : pricing.memberTotalCents,
      maxMemberTotalCents: pricing.exactSharesCents.slice(group.ownerSlots).length > 0 
        ? Math.max(...pricing.exactSharesCents.slice(group.ownerSlots)) + feeCents 
        : pricing.memberTotalCents,
      minBaseShareCents: Math.min(...pricing.exactSharesCents),
      maxBaseShareCents: Math.max(...pricing.exactSharesCents)
    };
  }

  getGroups(filters = {}) {
    this.checkExpirations();
    return this.data.groups.filter(g => {
      const isDraftOrBlocked = g.status === 'DRAFT' || g.status === 'PAYOUT_NOT_READY' || g.status === 'CLOSED' || g.status === 'terminated' || g.status === 'cancellation_scheduled';
      const isPublished = g.status === 'PUBLISHED' || g.status === 'FULL' || g.status === 'active' || g.status === 'available';
      if (!isPublished || isDraftOrBlocked) return false;

      if (filters.serviceId && g.serviceId !== filters.serviceId) return false;
      if (filters.onlyAvailable && (g.occupiedMemberSlots >= g.availableSlots || (g.status !== 'PUBLISHED' && g.status !== 'active' && g.status !== 'available'))) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const srv = this.data.services.find(s => s.id === g.serviceId);
        const nameMatch = g.customServiceName?.toLowerCase().includes(q) || srv?.name.toLowerCase().includes(q);
        const planMatch = g.planName?.toLowerCase().includes(q);
        if (!nameMatch && !planMatch) return false;
      }
      return true;
    });
  }

  getGroupById(groupId, requestingUser = null) {
    this.checkExpirations();
    const group = this.data.groups.find(g => g.id === groupId);
    if (!group) return null;

    const rawOwner = this.data.users.find(u => u.id === group.ownerId);
    const service = this.data.services.find(s => s.id === group.serviceId);
    const memberships = this.data.memberships.filter(m => m.groupId === groupId && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));
    const slotsInfo = this.getGroupSlotsBreakdown(group);

    // Sanitizzazione proprietario per utenti non autorizzati (Zero Data Leakage)
    const isOwner = requestingUser && requestingUser.id === group.ownerId;
    const isAuthorizedMember = requestingUser && memberships.some(m => m.userId === requestingUser.id && m.role === 'MEMBER');
    const isAdmin = requestingUser && requestingUser.role === 'admin';

    const safeOwner = rawOwner ? {
      id: rawOwner.id,
      fullName: rawOwner.fullName,
      isVerified: rawOwner.isVerified,
      createdAt: rawOwner.createdAt,
      ...(isOwner || isAdmin ? { email: rawOwner.email, iban: rawOwner.iban, stripeAccountId: rawOwner.stripeAccountId } : {})
    } : null;

    return {
      ...group,
      owner: safeOwner,
      service,
      slotsInfo,
      activeMembersCount: memberships.filter(m => m.role === 'MEMBER').length,
      freeSlots: slotsInfo.availableSlotsCount,
      nextAvailableSlot: slotsInfo.nextAvailableSlot
    };
  }

  createGroup(groupInput, accessInput, ownerUser) {
    const realCostCents = parseInt(groupInput.realSubscriptionCostCents, 10);
    const totalSlots = parseInt(groupInput.totalSlots, 10);
    const ownerSlots = parseInt(groupInput.ownerSlots, 10) || 1;
    const availableSlots = totalSlots - ownerSlots;
    const feeCents = this.getPlatformFeeCents();

    // Calcolo matematico deterministico con MoneySplit
    const pricing = calculatePricingBreakdown(realCostCents, totalSlots, feeCents);

    // Controllo Economico Server-Side (Protezione Margine >= 1,00 € Netto con Fee 1,49 €)
    const marginCheck = validateGroupEconomicMargin(pricing.baseMemberShareCents);
    if (!marginCheck.isValid) {
      throw new Error(marginCheck.message);
    }

    const groupId = 'grp-' + Date.now();
    const newGroup = {
      id: groupId,
      ownerId: ownerUser.id,
      serviceId: groupInput.serviceId,
      customServiceName: groupInput.customServiceName.trim(),
      planName: groupInput.planName ? groupInput.planName.trim() : 'Piano Condiviso',
      realSubscriptionCostCents: realCostCents,
      totalSlots: totalSlots,
      ownerSlots: ownerSlots,
      availableSlots: availableSlots,
      occupiedMemberSlots: 0, // Nessun membro pagante all'inizio
      baseMemberShareCents: pricing.baseMemberShareCents,
      platformFeeCents: feeCents,
      memberTotalCents: pricing.memberTotalCents,
      groupType: 'public',
      status: 'active',
      inviteCode: 'BYS-' + Math.floor(1000 + Math.random() * 9000),
      rulesAndRequirements: groupInput.rulesAndRequirements || 'Uso personale nel rispetto delle condizioni del fornitore.',
      description: groupInput.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newAccess = {
      id: 'acc-' + Date.now(),
      groupId: groupId,
      accessUrl: accessInput.accessUrl ? accessInput.accessUrl.trim() : '',
      instructions: accessInput.instructions ? accessInput.instructions.trim() : '',
      additionalInfo: accessInput.additionalInfo ? accessInput.additionalInfo.trim() : '',
      accessCode: accessInput.accessCode ? accessInput.accessCode.trim() : ''
    };

    // Creazione Automatica della Chat del Gruppo (1-to-1)
    const chatId = 'cht-' + Date.now();
    const newChat = {
      id: chatId,
      groupId: groupId,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    const welcomeMsg = {
      id: 'msg-' + Date.now(),
      chatId: chatId,
      senderId: null, // System
      messageType: 'SYSTEM',
      messageContent: `🎉 Gruppo creato da ${ownerUser.fullName}. Benvenuti nella chat privata!`,
      createdAt: new Date().toISOString()
    };

    // Membership Owner (Slot 1)
    const ownerPeriod = calculateMonthlyPeriod();
    const ownerMembership = {
      id: 'mem-' + Date.now() + '-owner',
      groupId: groupId,
      userId: ownerUser.id,
      role: 'OWNER',
      slotNumber: 1,
      paidShareCents: pricing.ownerShareCents,
      paidFeeCents: 0,
      memberTotalCents: pricing.ownerShareCents,
      status: 'ACTIVE',
      autoRenew: true,
      currentPeriodStart: ownerPeriod.current_period_start,
      currentPeriodEnd: ownerPeriod.current_period_end,
      nextBillingDate: ownerPeriod.next_billing_date,
      joinedAt: new Date().toISOString()
    };

    this.data.groups.unshift(newGroup);
    this.data.accessInstructions.push(newAccess);
    this.data.chats.push(newChat);
    this.data.chatMessages.push(welcomeMsg);
    this.data.memberships.push(ownerMembership);

    this.save();
    return newGroup;
  }

  cancelGroup(groupId, ownerUser) {
    const group = this.data.groups.find(g => g.id === groupId && g.ownerId === ownerUser.id);
    if (!group) throw new Error('Gruppo non trovato o non autorizzato');

    group.status = 'cancellation_scheduled';
    group.cancellationScheduledAt = new Date().toISOString();

    // Notifica ai membri
    const activeMembers = this.data.memberships.filter(m => m.groupId === groupId && m.role === 'MEMBER');
    activeMembers.forEach(m => {
      this.addNotification(
        m.userId,
        '⚠️ Chiusura gruppo programmata dal Capogruppo',
        `Il gruppo "${group.customServiceName}" chiuderà al termine del periodo pagato. Non ci saranno rinnovi futuri.`,
        'group_cancel',
        groupId
      );
    });

    const chat = this.data.chats.find(c => c.groupId === groupId);
    if (chat) {
      this.data.chatMessages.push({
        id: 'msg-' + Date.now(),
        chatId: chat.id,
        senderId: null,
        messageType: 'SYSTEM',
        messageContent: '⚠️ Il Capogruppo ha programmato la chiusura del gruppo. I membri attivi manterranno l\'accesso fino al termine del proprio periodo già pagato.',
        createdAt: new Date().toISOString()
      });
    }

    this.save();
    return true;
  }

  getMyCreatedGroups(userId) {
    this.checkExpirations();
    return this.data.groups.filter(g => g.ownerId === userId && g.status !== 'terminated');
  }

  // ==========================================
  // ACCESS INSTRUCTIONS & SECURITY
  // ==========================================
  getAccessInstructions(groupId, requestingUserId) {
    const group = this.data.groups.find(g => g.id === groupId);
    if (!group) return null;

    // Controllo permessi rigoroso: Capogruppo o Membro con stato ACTIVE / CANCELLATION_SCHEDULED
    const isOwner = group.ownerId === requestingUserId;
    const isAuthorizedMember = this.data.memberships.some(m =>
      m.groupId === groupId &&
      m.userId === requestingUserId &&
      (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')
    );

    if (!isOwner && !isAuthorizedMember) {
      return null; // ZERO LEAKAGE
    }

    return this.data.accessInstructions.find(a => a.groupId === groupId) || null;
  }

  updateAccessInstructions(groupId, updatedAccess, ownerUser) {
    const group = this.data.groups.find(g => g.id === groupId && g.ownerId === ownerUser.id);
    if (!group) return false;

    let access = this.data.accessInstructions.find(a => a.groupId === groupId);
    if (!access) {
      access = { id: 'acc-' + Date.now(), groupId };
      this.data.accessInstructions.push(access);
    }

    access.accessUrl = updatedAccess.accessUrl ? updatedAccess.accessUrl.trim() : access.accessUrl;
    access.instructions = updatedAccess.instructions ? updatedAccess.instructions.trim() : access.instructions;
    access.additionalInfo = updatedAccess.additionalInfo !== undefined ? updatedAccess.additionalInfo.trim() : access.additionalInfo;
    access.accessCode = updatedAccess.accessCode !== undefined ? updatedAccess.accessCode.trim() : access.accessCode;
    if (updatedAccess.ownerSpotifyAccount !== undefined) {
      access.ownerSpotifyAccount = updatedAccess.ownerSpotifyAccount.trim();
    }
    access.updatedAt = new Date().toISOString();

    // Notifica broadcast a tutti i membri attivi
    const activeMembers = this.data.memberships.filter(m => m.groupId === groupId && m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));
    activeMembers.forEach(m => {
      this.addNotification(
        m.userId,
        '📢 Informazioni di accesso aggiornate',
        `Il Capogruppo di "${group.customServiceName}" ha aggiornato i dati di accesso.`,
        'access_update',
        groupId
      );
    });

    // Inserisci messaggio SYSTEM nella chat
    const chat = this.data.chats.find(c => c.groupId === groupId);
    if (chat) {
      this.data.chatMessages.push({
        id: 'msg-' + Date.now(),
        chatId: chat.id,
        senderId: null,
        messageType: 'ACCESS_UPDATE',
        messageContent: '📢 Il Capogruppo ha aggiornato le informazioni di accesso. Apri la sezione "Il Tuo Accesso" per vederle.',
        actionUrl: '#miei-abbonamenti',
        createdAt: new Date().toISOString()
      });
    }

    this.save();
    return true;
  }

  updateSpotifyOwnerAccount(groupId, spotifyEmail, ownerUser) {
    const group = this.data.groups.find(g => g.id === groupId && g.ownerId === ownerUser.id);
    if (!group) return false;

    let access = this.data.accessInstructions.find(a => a.groupId === groupId);
    if (!access) {
      access = { id: 'acc-' + Date.now(), groupId, accessUrl: '', instructions: '', additionalInfo: '', accessCode: '' };
      this.data.accessInstructions.push(access);
    }

    access.ownerSpotifyAccount = (spotifyEmail || '').trim();
    access.updatedAt = new Date().toISOString();

    // Notifica broadcast a tutti i membri attivi del gruppo
    const activeMembers = this.data.memberships.filter(m => m.groupId === groupId && m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));
    activeMembers.forEach(m => {
      this.addNotification(
        m.userId,
        '📧 Indirizzo Spotify Capogruppo aggiornato',
        `Il Capogruppo di "${group.customServiceName}" ha aggiornato l'indirizzo Spotify per l'invito Family.`,
        'access_update',
        groupId
      );
    });

    // Notifica nella chat
    const chat = this.data.chats.find(c => c.groupId === groupId);
    if (chat) {
      this.data.chatMessages.push({
        id: 'msg-' + Date.now(),
        chatId: chat.id,
        senderId: null,
        messageType: 'ACCESS_UPDATE',
        messageContent: '📧 Il Capogruppo ha aggiornato l\'indirizzo Spotify per confermare l\'invito al piano Family.',
        actionUrl: '#miei-abbonamenti',
        createdAt: new Date().toISOString()
      });
    }

    this.save();
    return true;
  }

  // ==========================================
  // MEMBERSHIPS & SIMULATED MARKETPLACE CHECKOUT
  // ==========================================
  joinGroupSimulated(groupId, memberUser, requestedSlotNumber = null) {
    const group = this.getGroupById(groupId);
    if (!group) throw new Error('Gruppo non trovato');
    if (group.status !== 'active') throw new Error('Il gruppo non accetta nuovi membri');
    
    const slotsInfo = group.slotsInfo;
    if (slotsInfo.availableSlotsCount <= 0) throw new Error('Il gruppo è al completo');

    // Trova lo slot da assegnare
    let targetSlot = null;
    if (requestedSlotNumber) {
      targetSlot = slotsInfo.slots.find(s => s.slotNumber === requestedSlotNumber && !s.isOwnerSlot && !s.isOccupied);
    }
    if (!targetSlot) {
      targetSlot = slotsInfo.nextAvailableSlot;
    }
    if (!targetSlot) throw new Error('Nessun posto disponibile per questo gruppo');

    // Verifica se l'utente è già membro attivo
    const existing = this.data.memberships.find(m => m.groupId === groupId && m.userId === memberUser.id && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));
    if (existing) throw new Error('Sei già un partecipante attivo di questo gruppo');

    // Allocazione monetaria esatta per questo slot
    const period = calculateMonthlyPeriod();
    const membershipId = 'mem-' + Date.now();

    const newMembership = {
      id: membershipId,
      groupId: groupId,
      userId: memberUser.id,
      role: 'MEMBER',
      slotNumber: targetSlot.slotNumber,
      paidShareCents: targetSlot.baseShareCents,
      paidFeeCents: targetSlot.platformFeeCents,
      memberTotalCents: targetSlot.memberTotalCents,
      status: 'ACTIVE',
      autoRenew: true,
      currentPeriodStart: period.current_period_start,
      currentPeriodEnd: period.current_period_end,
      nextBillingDate: period.next_billing_date,
      joinedAt: new Date().toISOString()
    };

    // Aggiorna posti occupati nel gruppo
    const grpRef = this.data.groups.find(g => g.id === groupId);
    grpRef.occupiedMemberSlots += 1;
    if (grpRef.occupiedMemberSlots >= grpRef.availableSlots) {
      grpRef.status = 'full';
    }

    // Aggiungi alla chat con messaggio di benvenuto
    const chat = this.data.chats.find(c => c.groupId === groupId);
    if (chat) {
      this.data.chatMessages.push({
        id: 'msg-' + Date.now(),
        chatId: chat.id,
        senderId: null,
        messageType: 'SYSTEM',
        messageContent: `👤 ${memberUser.fullName} è entrato nel gruppo (Posto #${targetSlot.slotNumber}).`,
        createdAt: new Date().toISOString()
      });
    }

    // Notifica per il Capogruppo
    this.data.notifications.push({
      id: 'notif-' + Date.now() + '-owner',
      userId: group.ownerId,
      type: 'payment',
      title: '🎉 Nuovo membro entrato nel tuo gruppo!',
      message: `${memberUser.fullName} si è unito a "${group.customServiceName}" (Posto #${targetSlot.slotNumber}). Quota: +${(targetSlot.baseShareCents / 100).toFixed(2)} €/mese.`,
      actionUrl: '#miei-gruppi',
      isRead: false,
      createdAt: new Date().toISOString()
    });

    // Notifica per il Membro
    this.data.notifications.push({
      id: 'notif-' + Date.now() + '-member',
      userId: memberUser.id,
      type: 'access_ready',
      title: '🎉 Partecipazione attivata con successo!',
      message: `Sei attivo in "${group.customServiceName}". Il tuo accesso e la chat del gruppo sono ora sbloccati.`,
      actionUrl: '#miei-abbonamenti',
      isRead: false,
      createdAt: new Date().toISOString()
    });

    this.data.memberships.push(newMembership);
    this.save();
    return newMembership;
  }

  cancelMembership(membershipId, user) {
    const membership = this.data.memberships.find(m => m.id === membershipId && m.userId === user.id);
    if (!membership) return false;

    membership.autoRenew = false;
    membership.status = 'CANCELLATION_SCHEDULED';

    const group = this.data.groups.find(g => g.id === membership.groupId);
    if (group) {
      // Notifica il capogruppo
      this.data.notifications.push({
        id: 'notif-' + Date.now(),
        userId: group.ownerId,
        type: 'cancel',
        title: 'ℹ️ Un membro ha annullato il rinnovo',
        message: `Un partecipante ha disattivato il rinnovo in "${group.customServiceName}". Rimarrà attivo fino alla scadenza del mese già pagato.`,
        actionUrl: '#miei-gruppi',
        isRead: false,
        createdAt: new Date().toISOString()
      });
    }

    this.save();
    return true;
  }

  getMyCreatedGroups(ownerUserId) {
    this.checkExpirations();
    const groups = this.data.groups.filter(g => g.ownerId === ownerUserId && g.status !== 'terminated');
    return groups.map(g => {
      const activeMembers = this.data.memberships.filter(m => m.groupId === g.id && m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED'));
      const membersDetails = activeMembers.map(m => {
        const u = this.data.users.find(user => user.id === m.userId);
        return { ...m, user: u };
      });
      return {
        ...g,
        members: membersDetails,
        freeSlots: Math.max(0, g.availableSlots - g.occupiedMemberSlots)
      };
    });
  }

  getMySubscriptions(memberUserId) {
    this.checkExpirations();
    const memberships = this.data.memberships.filter(m => m.userId === memberUserId && m.role === 'MEMBER');
    return memberships.map(m => {
      const group = this.getGroupById(m.groupId);
      return {
        ...m,
        group
      };
    });
  }

  // ==========================================
  // NATIVE PRIVATE GROUP CHAT
  // ==========================================
  getGroupChat(groupId, requestingUserId) {
    const group = this.data.groups.find(g => g.id === groupId);
    if (!group) return null;

    // Verifica accesso server-side
    const isOwner = group.ownerId === requestingUserId;
    const isMember = this.data.memberships.some(m =>
      m.groupId === groupId &&
      m.userId === requestingUserId &&
      (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')
    );

    if (!isOwner && !isMember) return null;

    const chat = this.data.chats.find(c => c.groupId === groupId);
    if (!chat) return null;

    const messages = this.data.chatMessages.filter(msg => msg.chatId === chat.id);
    const members = this.data.memberships.filter(m => m.groupId === groupId && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')).map(m => {
      const u = this.data.users.find(user => user.id === m.userId);
      return { ...m, user: u };
    });

    return {
      chat,
      group,
      members,
      messages
    };
  }

  sendChatMessage(groupId, senderUser, text) {
    const chatData = this.getGroupChat(groupId, senderUser.id);
    if (!chatData) throw new Error('Non hai i permessi per inviare messaggi in questa chat');

    const cleanText = text.trim();
    if (!cleanText) return null;

    const newMsg = {
      id: 'msg-' + Date.now(),
      chatId: chatData.chat.id,
      senderId: senderUser.id,
      senderName: senderUser.fullName,
      messageType: 'TEXT',
      messageContent: cleanText,
      createdAt: new Date().toISOString()
    };

    this.data.chatMessages.push(newMsg);

    // Notifica in-app agli altri membri
    chatData.members.forEach(m => {
      if (m.userId !== senderUser.id) {
        this.data.notifications.push({
          id: 'notif-' + Date.now() + '-' + m.userId,
          userId: m.userId,
          type: 'chat',
          title: `💬 Nuovo messaggio in "${chatData.group.customServiceName}"`,
          message: `${senderUser.fullName}: ${cleanText.length > 50 ? cleanText.substring(0, 50) + '...' : cleanText}`,
          actionUrl: `#chat-${groupId}`,
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }
    });

    this.save();
    return newMsg;
  }

  // ==========================================
  // NOTIFICATIONS
  // ==========================================
  addNotification(userId, title, message, type = 'system', groupId = null) {
    if (!this.data.notifications) {
      this.data.notifications = [];
    }
    const notif = {
      id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      userId: userId,
      type: type,
      title: title,
      message: message,
      actionUrl: groupId ? `#gruppo-${groupId}` : '#miei-abbonamenti',
      isRead: false,
      createdAt: new Date().toISOString()
    };
    this.data.notifications.push(notif);
    this.save();
    return notif;
  }

  getNotifications(userId) {
    return (this.data.notifications || [])
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  markNotificationsRead(userId) {
    (this.data.notifications || []).forEach(n => {
      if (n.userId === userId) n.isRead = true;
    });
    this.save();
  }

  // ==========================================
  // ADMIN METRICS & MODERATION
  // ==========================================
  getAdminMetrics() {
    const totalUsers = this.data.users.length;
    const totalGroups = this.data.groups.length;
    const activeGroups = this.data.groups.filter(g => g.status === 'active' || g.status === 'full').length;
    const activeMembers = this.data.memberships.filter(m => m.role === 'MEMBER' && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')).length;
    const feeCents = this.getPlatformFeeCents();
    const totalEstimatedMonthlyFeesCents = activeMembers * feeCents;

    return {
      totalUsers,
      totalGroups,
      activeGroups,
      activeMembers,
      platformFeeCents: feeCents,
      totalEstimatedMonthlyFeesCents,
      reportsCount: this.data.reports.filter(r => r.status === 'open').length
    };
  }

  createReport(reportData, reporterUser) {
    const rep = {
      id: 'rep-' + Date.now(),
      reporterId: reporterUser.id,
      targetType: reportData.targetType,
      targetId: reportData.targetId,
      reason: reportData.reason,
      details: reportData.details || '',
      status: 'open',
      createdAt: new Date().toISOString()
    };
    this.data.reports.push(rep);
    this.save();
    return rep;
  }

  // ==========================================
  // METODI DI PAGAMENTO & RICEZIONE QUOTE (IBAN / STRIPE CONNECT / CARTE / PAYPAL)
  // ==========================================
  getUserPayoutSettings(userId, requestingUser = null) {
    if (requestingUser && requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return null; // Zero leakage per utenti non autorizzati
    }
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return null;
    const conn = (this.data.connectedAccounts || []).find(c => c.userId === userId) || {};
    return {
      iban: user.iban || (conn.bankLast4 ? `IT...${conn.bankLast4}` : null),
      bankName: user.bankName || '',
      paypalPayoutEmail: user.paypalPayoutEmail || user.email,
      legalName: user.legalName || conn.legalName || user.fullName || '',
      stripeAccountId: conn.stripeAccountId || user.stripeAccountId || `acct_${user.id.replace('usr-', '')}`,
      payoutsEnabled: conn.payoutsEnabled !== false,
      onboardingStatus: conn.onboardingStatus || 'completed'
    };
  }

  updateUserPayoutSettings(userId, settings, currentUser) {
    if (currentUser && userId !== currentUser.id && currentUser.role !== 'admin') {
      throw new Error('Non autorizzato a modificare queste informazioni.');
    }
    const user = this.data.users.find(u => u.id === userId);
    if (!user) throw new Error('Utente non trovato.');

    const cleanIban = (settings.iban || '').trim().toUpperCase();
    if (cleanIban) user.iban = cleanIban;
    if (settings.bankName !== undefined) user.bankName = settings.bankName.trim();
    if (settings.paypalPayoutEmail !== undefined) user.paypalPayoutEmail = settings.paypalPayoutEmail.trim();
    if (settings.legalName !== undefined) user.legalName = settings.legalName.trim();

    // Sincronizza anche connectedAccounts
    if (!this.data.connectedAccounts) this.data.connectedAccounts = [];
    let conn = this.data.connectedAccounts.find(c => c.userId === userId);
    const last4 = cleanIban ? cleanIban.slice(-4) : (user.iban ? user.iban.slice(-4) : '');
    
    if (!conn) {
      conn = {
        id: 'conn-' + Date.now(),
        userId: userId,
        stripeAccountId: `acct_${userId.replace('usr-', '')}_${Date.now()}`,
        payoutsEnabled: true,
        chargesEnabled: true,
        detailsSubmitted: true,
        onboardingStatus: 'completed',
        bankLast4: last4,
        country: 'IT',
        defaultCurrency: 'eur',
        legalName: user.legalName || user.fullName,
        onboardedAt: new Date().toISOString()
      };
      this.data.connectedAccounts.push(conn);
    } else {
      conn.bankLast4 = last4;
      conn.payoutsEnabled = true;
      conn.chargesEnabled = true;
      conn.detailsSubmitted = true;
      conn.onboardingStatus = 'completed';
      conn.legalName = user.legalName || user.fullName;
      conn.updatedAt = new Date().toISOString();
    }

    user.stripeAccountId = conn.stripeAccountId;
    this.save();
    return this.getUserPayoutSettings(userId);
  }

  getUserPaymentMethod(userId) {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return null;
    return user.paymentMethod || {
      type: 'CARD', // 'CARD' o 'PAYPAL'
      cardBrand: 'Visa / Mastercard',
      cardLast4: '4242',
      cardExpiry: '12/28',
      paypalEmail: user.email,
      autoRenewEnabled: true
    };
  }

  updateUserPaymentMethod(userId, methodData, currentUser) {
    if (currentUser && userId !== currentUser.id && currentUser.role !== 'admin') {
      throw new Error('Non autorizzato a modificare il metodo di pagamento.');
    }
    const user = this.data.users.find(u => u.id === userId);
    if (!user) throw new Error('Utente non trovato.');

    user.paymentMethod = {
      type: methodData.type || 'CARD',
      cardBrand: methodData.cardBrand || 'Visa / Mastercard',
      cardLast4: methodData.cardLast4 || (methodData.cardNumber ? methodData.cardNumber.slice(-4) : '4242'),
      cardExpiry: methodData.cardExpiry || '12/28',
      paypalEmail: methodData.paypalEmail || user.email,
      autoRenewEnabled: methodData.autoRenewEnabled !== false,
      updatedAt: new Date().toISOString()
    };

    this.save();
    return user.paymentMethod;
  }
}

export const db = new Database();
