/**
 * SubFlow - Storage Manager (Offline-first / LocalStorage + Demo Data)
 * Gestisce la persistenza locale, inserimento, modifica, eliminazione e backup
 */

const STORAGE_KEY = 'subflow_user_subscriptions_v1';

export const DEMO_SUBSCRIPTIONS = [
  {
    id: 'demo-1',
    name: 'Netflix',
    category: 'Streaming',
    cost: 17.99,
    billingCycle: 'monthly',
    nextRenewalDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // tra 4 giorni
    brandColor: '#E50914',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-2',
    name: 'Spotify',
    category: 'Musica',
    cost: 10.99,
    billingCycle: 'monthly',
    nextRenewalDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // tra 11 giorni
    brandColor: '#1DB954',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-3',
    name: 'ChatGPT Plus',
    category: 'AI & Produttività',
    cost: 22.00,
    billingCycle: 'monthly',
    nextRenewalDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // tra 18 giorni
    brandColor: '#10A37F',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-4',
    name: 'Amazon Prime',
    category: 'Streaming',
    cost: 49.90,
    billingCycle: 'yearly',
    nextRenewalDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    brandColor: '#00A8E1',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-5',
    name: 'Apple iCloud+',
    category: 'Cloud & Storage',
    cost: 2.99,
    billingCycle: 'monthly',
    nextRenewalDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    brandColor: '#007AFF',
    createdAt: new Date().toISOString()
  }
];

export function getStoredSubscriptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Errore nel recupero dati da localStorage', e);
    return [];
  }
}

export function saveSubscriptions(subscriptions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriptions));
    return true;
  } catch (e) {
    console.error('Errore nel salvataggio su localStorage', e);
    return false;
  }
}

export function addSubscription(subData) {
  const current = getStoredSubscriptions();
  const newSub = {
    id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    name: subData.name.trim(),
    category: subData.category || 'Altro',
    cost: parseFloat(subData.cost) || 0,
    billingCycle: subData.billingCycle || 'monthly',
    nextRenewalDate: subData.nextRenewalDate || '',
    brandColor: subData.brandColor || '#4f46e5',
    notes: subData.notes ? subData.notes.trim() : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  current.unshift(newSub);
  saveSubscriptions(current);
  return newSub;
}

export function updateSubscription(id, updatedData) {
  const current = getStoredSubscriptions();
  const index = current.findIndex(s => s.id === id);
  if (index === -1) return null;

  current[index] = {
    ...current[index],
    name: updatedData.name.trim(),
    category: updatedData.category || current[index].category,
    cost: parseFloat(updatedData.cost) || 0,
    billingCycle: updatedData.billingCycle || current[index].billingCycle,
    nextRenewalDate: updatedData.nextRenewalDate || '',
    brandColor: updatedData.brandColor || current[index].brandColor,
    notes: updatedData.notes !== undefined ? updatedData.notes.trim() : current[index].notes,
    updatedAt: new Date().toISOString()
  };

  saveSubscriptions(current);
  return current[index];
}

export function deleteSubscription(id) {
  const current = getStoredSubscriptions();
  const filtered = current.filter(s => s.id !== id);
  saveSubscriptions(filtered);
  return filtered;
}

export function loadDemoData() {
  saveSubscriptions(DEMO_SUBSCRIPTIONS);
  return DEMO_SUBSCRIPTIONS;
}

export function clearAllSubscriptions() {
  localStorage.removeItem(STORAGE_KEY);
  return [];
}

export function exportSubscriptionsAsJSON() {
  const data = getStoredSubscriptions();
  return JSON.stringify(data, null, 2);
}
