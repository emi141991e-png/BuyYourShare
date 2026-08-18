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

export const INITIAL_GROUPS = [];
export const INITIAL_ACCESS_INSTRUCTIONS = [];
export const INITIAL_MEMBERSHIPS = [];
export const INITIAL_CHATS = [];
export const INITIAL_CHAT_MESSAGES = [];
