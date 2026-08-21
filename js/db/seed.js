/**
 * BuyYourShare - Database Initial Seed Data
 * Servizi preset iniziali (escluso qualsiasi bundle)
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
    id: 'usr-admin',
    email: 'admin@buyyourshare.com',
    fullName: 'Admin BuyYourShare',
    role: 'admin',
    isVerified: true,
    isSuspended: false,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'usr-emilio',
    email: 'emi.141991e@gmail.com',
    fullName: 'Emilio Caruso',
    role: 'user',
    isVerified: true,
    isSuspended: false,
    paypalPayoutEmail: 'emi.141991e@gmail.com',
    createdAt: '2026-08-19T20:00:00Z'
  },
  {
    id: 'usr-emilio-libero',
    email: 'emi.141991e@libero.it',
    fullName: 'Emi 141991e',
    role: 'user',
    isVerified: true,
    isSuspended: false,
    paypalPayoutEmail: 'emi.141991e@libero.it',
    createdAt: '2026-08-20T12:00:00Z'
  }
];

export const INITIAL_GROUPS = [];
export const INITIAL_ACCESS_INSTRUCTIONS = [];
export const INITIAL_MEMBERSHIPS = [];
export const INITIAL_CHATS = [];
export const INITIAL_CHAT_MESSAGES = [];

