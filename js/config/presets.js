/**
 * Catalogo Preset Servizi Estendibile per SubFlow
 *
 * Facilmente estendibile: per aggiungere un nuovo servizio basta inserire un oggetto nell'array.
 */

export const PRESET_CATEGORIES = [
  { id: 'Streaming', name: 'Streaming Video & Film', color: '#ef4444', icon: 'film' },
  { id: 'Musica', name: 'Musica & Podcast', color: '#10b981', icon: 'music' },
  { id: 'AI & Produttività', name: 'AI, Lavoro & Software', color: '#6366f1', icon: 'sparkles' },
  { id: 'Cloud & Storage', name: 'Cloud, Backup & Utility', color: '#0ea5e9', icon: 'cloud' },
  { id: 'Gaming', name: 'Gaming & Intrattenimento', color: '#8b5cf6', icon: 'gamepad' },
  { id: 'Altro', name: 'Altro / Varie', color: '#64748b', icon: 'layers' }
];

export const PRESET_SERVICES = [
  {
    id: 'netflix',
    name: 'Netflix',
    category: 'Streaming',
    defaultCost: 17.99,
    defaultCycle: 'monthly',
    brandColor: '#E50914',
    iconLetter: 'N',
    description: 'Streaming film, serie TV originali'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    category: 'Musica',
    defaultCost: 10.99,
    defaultCycle: 'monthly',
    brandColor: '#1DB954',
    iconLetter: 'S',
    description: 'Musica illimitata e podcast'
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT Plus',
    category: 'AI & Produttività',
    defaultCost: 22.00,
    defaultCycle: 'monthly',
    brandColor: '#10A37F',
    iconLetter: 'AI',
    description: 'OpenAI GPT-4o e strumenti avanzati'
  },
  {
    id: 'youtube',
    name: 'YouTube Premium',
    category: 'Streaming',
    defaultCost: 11.99,
    defaultCycle: 'monthly',
    brandColor: '#FF0000',
    iconLetter: 'YT',
    description: 'Senza annunci + YouTube Music'
  },
  {
    id: 'disney',
    name: 'Disney+',
    category: 'Streaming',
    defaultCost: 11.99,
    defaultCycle: 'monthly',
    brandColor: '#113CCF',
    iconLetter: 'D+',
    description: 'Disney, Pixar, Marvel, Star Wars'
  },
  {
    id: 'prime',
    name: 'Amazon Prime',
    category: 'Streaming',
    defaultCost: 49.90,
    defaultCycle: 'yearly',
    brandColor: '#00A8E1',
    iconLetter: 'P',
    description: 'Prime Video + Spedizioni veloci'
  },
  {
    id: 'dazn',
    name: 'DAZN',
    category: 'Streaming',
    defaultCost: 34.99,
    defaultCycle: 'monthly',
    brandColor: '#F28020',
    iconLetter: 'DZ',
    description: 'Calcio Serie A e sport live'
  },
  {
    id: 'icloud',
    name: 'Apple iCloud+',
    category: 'Cloud & Storage',
    defaultCost: 2.99,
    defaultCycle: 'monthly',
    brandColor: '#007AFF',
    iconLetter: 'iC',
    description: 'Spazio cloud per iPhone/Mac'
  },
  {
    id: 'canva',
    name: 'Canva Pro',
    category: 'AI & Produttività',
    defaultCost: 11.99,
    defaultCycle: 'monthly',
    brandColor: '#7D2AE8',
    iconLetter: 'C',
    description: 'Grafica professionale e template'
  },
  {
    id: 'microsoft365',
    name: 'Microsoft 365',
    category: 'AI & Produttività',
    defaultCost: 69.00,
    defaultCycle: 'yearly',
    brandColor: '#D83B01',
    iconLetter: 'M',
    description: 'Word, Excel, PowerPoint + 1TB OneDrive'
  },
  {
    id: 'playstation',
    name: 'PlayStation Plus',
    category: 'Gaming',
    defaultCost: 71.99,
    defaultCycle: 'yearly',
    brandColor: '#003791',
    iconLetter: 'PS',
    description: 'Multiplayer online e giochi mensili'
  },
  {
    id: 'nordvpn',
    name: 'NordVPN',
    category: 'Cloud & Storage',
    defaultCost: 59.88,
    defaultCycle: 'yearly',
    brandColor: '#4687FF',
    iconLetter: 'VPN',
    description: 'Privacy e protezione connessione'
  }
];
