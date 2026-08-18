/**
 * BuyYourShare - Server Initial Seed Data
 */

export const INITIAL_SERVICES = [
  {
    id: 'srv-spotify',
    name: 'Spotify',
    slug: 'spotify',
    category: 'Musica & Podcast',
    iconLetter: 'S',
    brandColor: '#1DB954',
    maxAllowedSlots: 6,
    isVerifiedByAdmin: true,
    isActive: true,
    complianceNotes: 'Piano Spotify Family. Invito ufficiale via link/email.'
  },
  {
    id: 'srv-youtube',
    name: 'YouTube Premium',
    slug: 'youtube-premium',
    category: 'Video & Streaming',
    iconLetter: 'YT',
    brandColor: '#FF0000',
    maxAllowedSlots: 6,
    isVerifiedByAdmin: true,
    isActive: true,
    complianceNotes: 'Piano YouTube Famiglia con musica senza pubblicità inclusa.'
  },
  {
    id: 'srv-canva',
    name: 'Canva Pro',
    slug: 'canva-pro',
    category: 'Grafica & Creator',
    iconLetter: 'C',
    brandColor: '#7D2AE8',
    maxAllowedSlots: 5,
    isVerifiedByAdmin: true,
    isActive: true,
    complianceNotes: 'Canva for Teams. Accesso tramite invito al team di lavoro.'
  },
  {
    id: 'srv-adobe',
    name: 'Adobe Creative Cloud',
    slug: 'adobe-cc',
    category: 'Design & Software',
    iconLetter: 'Ps',
    brandColor: '#FF0000',
    maxAllowedSlots: 2,
    isVerifiedByAdmin: true,
    isActive: true,
    complianceNotes: 'Accesso postazioni consentite.'
  },
  {
    id: 'srv-gemini',
    name: 'Gemini AI Pro',
    slug: 'gemini-pro',
    category: 'Intelligenza Artificiale',
    iconLetter: 'AI',
    brandColor: '#10A37F',
    maxAllowedSlots: 5,
    isVerifiedByAdmin: true,
    isActive: true,
    complianceNotes: 'Accesso strumenti Google One AI Premium.'
  },
  {
    id: 'srv-capcut',
    name: 'CapCut Pro',
    slug: 'capcut-pro',
    category: 'Video Editing',
    iconLetter: 'CC',
    brandColor: '#000000',
    maxAllowedSlots: 3,
    isVerifiedByAdmin: true,
    isActive: true,
    complianceNotes: 'Team di montaggio video.'
  }
];

export const INITIAL_USERS = [
  {
    id: 'usr-owner-1',
    email: 'marco.rossi@example.com',
    fullName: 'Marco Rossi',
    firstName: 'Marco',
    lastName: 'Rossi',
    password: 'Password123!',
    role: 'user',
    isVerified: true,
    isEmailVerified: true,
    isSuspended: false,
    iban: 'IT60X0542811101000000123456',
    bankName: 'Intesa Sanpaolo (Conto Corrente)',
    paypalPayoutEmail: 'sb-439eed52340185@personal.example.com',
    stripeAccountId: 'acct_1N42MarcoRossi',
    createdAt: '2026-08-01T10:00:00Z'
  },
  {
    id: 'usr-owner-2',
    email: 'sara.bianchi@example.com',
    fullName: 'Sara Bianchi',
    firstName: 'Sara',
    lastName: 'Bianchi',
    password: 'Password123!',
    role: 'user',
    isVerified: true,
    isEmailVerified: true,
    isSuspended: false,
    iban: 'IT40Y030020328000000789012',
    bankName: 'UniCredit (Conto Smart)',
    paypalPayoutEmail: 'sara.bianchi.paypal@gmail.com',
    stripeAccountId: 'acct_1N43SaraBianchi',
    createdAt: '2026-08-05T12:00:00Z'
  },
  {
    id: 'usr-member-1',
    email: 'elena.conti@example.com',
    fullName: 'Elena Conti',
    firstName: 'Elena',
    lastName: 'Conti',
    password: 'Password123!',
    role: 'user',
    isVerified: true,
    isEmailVerified: true,
    isSuspended: false,
    createdAt: '2026-08-10T14:00:00Z'
  },
  {
    id: 'usr-admin',
    email: 'admin@buyyourshare.com',
    fullName: 'Admin BuyYourShare',
    firstName: 'Admin',
    lastName: 'BuyYourShare',
    password: 'Password123!',
    role: 'admin',
    isVerified: true,
    isEmailVerified: true,
    isSuspended: false,
    createdAt: '2026-01-01T00:00:00Z'
  }
];

export const INITIAL_CONNECTED_ACCOUNTS = [
  {
    id: 'conn-1',
    userId: 'usr-owner-1',
    stripeAccountId: 'acct_1N42MarcoRossi',
    payoutsEnabled: true,
    chargesEnabled: true,
    detailsSubmitted: true,
    onboardingStatus: 'completed',
    businessType: 'individual',
    legalName: 'Marco Rossi',
    bankLast4: '3456',
    country: 'IT',
    defaultCurrency: 'eur',
    onboardedAt: '2026-08-01T10:00:00Z'
  },
  {
    id: 'conn-2',
    userId: 'usr-owner-2',
    stripeAccountId: 'acct_1N43SaraBianchi',
    payoutsEnabled: true,
    chargesEnabled: true,
    detailsSubmitted: true,
    onboardingStatus: 'completed',
    businessType: 'individual',
    legalName: 'Sara Bianchi',
    bankLast4: '9012',
    country: 'IT',
    defaultCurrency: 'eur',
    onboardedAt: '2026-08-05T12:00:00Z'
  }
];

export const INITIAL_GROUPS = [
  {
    id: 'grp-1042',
    ownerId: 'usr-owner-1',
    serviceId: 'srv-spotify',
    customServiceName: 'Spotify',
    planName: 'Spotify Family (6 Account)',
    realSubscriptionCostCents: 2099, // 20,99 €
    totalSlots: 6,
    ownerSlots: 1,
    availableSlots: 5,
    occupiedMemberSlots: 0,
    baseMemberShareCents: 350, // 3,50 €
    platformFeeCents: 149, // 1,49 €
    memberTotalCents: 499, // 4,99 €
    groupType: 'public',
    status: 'active',
    inviteCode: 'BYS-1042',
    rulesAndRequirements: 'Invito ufficiale Spotify Family tramite email.',
    description: 'Gruppo Spotify Family attivo da oltre 6 mesi. Rinnovo puntuale ogni mese.',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z'
  },
  {
    id: 'grp-1089',
    ownerId: 'usr-owner-1',
    serviceId: 'srv-canva',
    customServiceName: 'Canva Pro',
    planName: 'Canva for Teams',
    realSubscriptionCostCents: 1199, // 11,99 €
    totalSlots: 5,
    ownerSlots: 1,
    availableSlots: 4,
    occupiedMemberSlots: 0,
    baseMemberShareCents: 240, // 2,40 €
    platformFeeCents: 149, // 1,49 €
    memberTotalCents: 389, // 3,89 €
    groupType: 'public',
    status: 'active',
    inviteCode: 'BYS-1089',
    rulesAndRequirements: 'Accesso al team grafico con template ed elementi premium.',
    description: 'Condivisione postazioni Canva Pro Team.',
    createdAt: '2026-08-02T11:00:00Z',
    updatedAt: '2026-08-02T11:00:00Z'
  },
  {
    id: 'grp-1120',
    ownerId: 'usr-owner-2',
    serviceId: 'srv-youtube',
    customServiceName: 'YouTube Premium',
    planName: 'YouTube Famiglia',
    realSubscriptionCostCents: 1799, // 17,99 €
    totalSlots: 6,
    ownerSlots: 1,
    availableSlots: 5,
    occupiedMemberSlots: 0,
    baseMemberShareCents: 300, // 3,00 €
    platformFeeCents: 149, // 1,49 €
    memberTotalCents: 449, // 4,49 €
    groupType: 'public',
    status: 'active',
    inviteCode: 'BYS-1120',
    rulesAndRequirements: 'Video senza pubblicità e YouTube Music.',
    description: 'Gruppo YouTube Famiglia super stabile.',
    createdAt: '2026-08-05T12:00:00Z',
    updatedAt: '2026-08-05T12:00:00Z'
  }
];

export const INITIAL_ACCESS_INSTRUCTIONS = [
  {
    id: 'acc-1042',
    groupId: 'grp-1042',
    accessUrl: 'https://spotify.com/family/join/invite/demo-bys-1042',
    ownerSpotifyAccount: 'marco.rossi.spotify@gmail.com',
    instructions: '1. Clicca su "Apri Link"\n2. Accedi con il tuo account Spotify personale\n3. Inserisci le informazioni del Capogruppo.',
    additionalInfo: 'Il tuo account e le tue playlist rimangono 100% personali e privati.',
    accessCode: 'SPOTIFY-8492'
  },
  {
    id: 'acc-1089',
    groupId: 'grp-1089',
    accessUrl: 'https://canva.com/brand/join?invite=demo-bys-1089',
    instructions: '1. Clicca su "Apri Link"\n2. Accedi a Canva con la tua email\n3. Seleziona il team "BYS Creator Team".',
    additionalInfo: 'Accesso illimitato ai template Pro.',
    accessCode: 'CANVA-PRO-99'
  },
  {
    id: 'acc-1120',
    groupId: 'grp-1120',
    accessUrl: 'https://families.google.com/join/demo-bys-1120',
    instructions: '1. Clicca su "Apri Link"\n2. Accetta l\'invito al gruppo Famiglia Google\n3. Apri YouTube senza pubblicità.',
    additionalInfo: 'Include YouTube Music Premium.',
    accessCode: 'YT-PREM-44'
  }
];

export const INITIAL_MEMBERSHIPS = [
  {
    id: 'mem-1042-owner',
    groupId: 'grp-1042',
    userId: 'usr-owner-1',
    role: 'OWNER',
    slotNumber: 1,
    paidShareCents: 350,
    paidFeeCents: 0,
    memberTotalCents: 350,
    status: 'ACTIVE',
    autoRenew: true,
    currentPeriodStart: '2026-08-01T10:00:00Z',
    currentPeriodEnd: '2026-09-01T10:00:00Z',
    nextBillingDate: '2026-09-01T10:00:00Z',
    joinedAt: '2026-08-01T10:00:00Z'
  },
  {
    id: 'mem-1089-owner',
    groupId: 'grp-1089',
    userId: 'usr-owner-1',
    role: 'OWNER',
    slotNumber: 1,
    paidShareCents: 240,
    paidFeeCents: 0,
    memberTotalCents: 240,
    status: 'ACTIVE',
    autoRenew: true,
    currentPeriodStart: '2026-08-02T11:00:00Z',
    currentPeriodEnd: '2026-09-02T11:00:00Z',
    nextBillingDate: '2026-09-02T11:00:00Z',
    joinedAt: '2026-08-02T11:00:00Z'
  },
  {
    id: 'mem-1120-owner',
    groupId: 'grp-1120',
    userId: 'usr-owner-2',
    role: 'OWNER',
    slotNumber: 1,
    paidShareCents: 300,
    paidFeeCents: 0,
    memberTotalCents: 300,
    status: 'ACTIVE',
    autoRenew: true,
    currentPeriodStart: '2026-08-05T12:00:00Z',
    currentPeriodEnd: '2026-09-05T12:00:00Z',
    nextBillingDate: '2026-09-05T12:00:00Z',
    joinedAt: '2026-08-05T12:00:00Z'
  }
];

export const INITIAL_CHATS = [
  { id: 'cht-1042', groupId: 'grp-1042', status: 'ACTIVE', createdAt: '2026-08-01T10:00:00Z' },
  { id: 'cht-1089', groupId: 'grp-1089', status: 'ACTIVE', createdAt: '2026-08-02T11:00:00Z' },
  { id: 'cht-1120', groupId: 'grp-1120', status: 'ACTIVE', createdAt: '2026-08-05T12:00:00Z' }
];

export const INITIAL_CHAT_MESSAGES = [
  {
    id: 'msg-1',
    chatId: 'cht-1042',
    senderId: null,
    messageType: 'SYSTEM',
    messageContent: '🎉 Gruppo creato. Benvenuti nella chat privata del gruppo Spotify Family!',
    actionUrl: null,
    createdAt: '2026-08-01T10:00:00Z'
  }
];
