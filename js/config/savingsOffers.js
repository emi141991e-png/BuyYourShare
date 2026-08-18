/**
 * Catalogo Offerte "Risparmia con BuyYourShare" (Configurabile)
 *
 * Questo file è completamente disaccoppiato dal codice applicativo e dall'interfaccia.
 * Modifica, aggiungi o disattiva un'offerta semplicemente cambiando i valori qui sotto.
 *
 * Parametri:
 * - id: Identificatore univoco
 * - serviceName: Nome del servizio (usato per il matching con gli abbonamenti utente)
 * - category: Categoria (Streaming, AI & Produttività, Musica, Gaming, Cloud, ecc.)
 * - standardMonthlyPrice: Prezzo standard retail mensile indicativo
 * - bysMonthlyPrice: Prezzo mensile effettivo proposto da BuyYourShare
 * - description: Breve descrizione dell'offerta/vantaggio
 * - badge: Etichetta opzionale (es. "Più Richiesto", "Super Sconto")
// =========================================================================
// CONFIGURAZIONE LINK DESTINAZIONE BUYYOURSHARE
// Pagina ufficiale del catalogo abbonamenti BuyYourShare
// =========================================================================
export const DEFAULT_BYS_URL = 'https://buyyourshare.com/pages/abbonamenti-condivisi';

export const SAVINGS_OFFERS = [
  {
    id: 'bys-netflix',
    serviceName: 'Netflix',
    category: 'Streaming',
    standardMonthlyPrice: 17.99,
    bysMonthlyPrice: 4.90,
    description: 'Account Premium Ultra HD 4K con profilo personale dedicato e protetto da PIN.',
    badge: 'Più Popolare',
    ctaText: 'Attiva con BuyYourShare',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  },
  {
    id: 'bys-spotify',
    serviceName: 'Spotify',
    category: 'Musica',
    standardMonthlyPrice: 10.99,
    bysMonthlyPrice: 3.20,
    description: 'Piano Spotify Premium Individuale, musica senza interruzioni e download offline.',
    badge: 'Super Risparmio',
    ctaText: 'Passa a BuyYourShare',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  },
  {
    id: 'bys-chatgpt',
    serviceName: 'ChatGPT Plus',
    category: 'AI & Produttività',
    standardMonthlyPrice: 22.00,
    bysMonthlyPrice: 6.90,
    description: 'Accesso completo a GPT-4o, Canvas, generazione immagini DALL-E e Voice Mode avanzata.',
    badge: 'Trend Top',
    ctaText: 'Attiva GPT Plus',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  },
  {
    id: 'bys-youtube',
    serviceName: 'YouTube Premium',
    category: 'Streaming',
    standardMonthlyPrice: 11.99,
    bysMonthlyPrice: 3.50,
    description: 'Niente pubblicità su YouTube + YouTube Music Premium incluso e riproduzione in background.',
    badge: 'Best Value',
    ctaText: 'Ottieni YouTube Premium',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  },
  {
    id: 'bys-disney',
    serviceName: 'Disney+',
    category: 'Streaming',
    standardMonthlyPrice: 11.99,
    bysMonthlyPrice: 3.90,
    description: 'Catalogo Disney, Pixar, Marvel, Star Wars e Star in 4K HDR su tutti i tuoi dispositivi.',
    badge: 'Famiglia',
    ctaText: 'Attiva Disney+',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  },
  {
    id: 'bys-canva',
    serviceName: 'Canva Pro',
    category: 'AI & Produttività',
    standardMonthlyPrice: 11.99,
    bysMonthlyPrice: 3.99,
    description: 'Accesso a milioni di grafiche premium, rimozione sfondo con AI, brand kit e template illimitati.',
    badge: 'Creator',
    ctaText: 'Sblocca Canva Pro',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  },
  {
    id: 'bys-dazn',
    serviceName: 'DAZN',
    category: 'Streaming',
    standardMonthlyPrice: 34.99,
    bysMonthlyPrice: 14.90,
    description: 'Tutta la Serie A Enilive, Serie BKT, Liga spagnola e grandi eventi sportivi in streaming.',
    badge: 'Sport',
    ctaText: 'Guarda DAZN',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  },
  {
    id: 'bys-prime',
    serviceName: 'Amazon Prime',
    category: 'Streaming',
    standardMonthlyPrice: 4.99,
    bysMonthlyPrice: 1.99,
    description: 'Spedizioni rapide illimitate, Prime Video, Prime Music e Twitch Prime.',
    badge: '',
    ctaText: 'Dettagli Offerta',
    ctaUrl: DEFAULT_BYS_URL,
    isActive: true
  }
];
