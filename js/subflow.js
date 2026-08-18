/**
 * SubFlow - Standalone Engine & Controller (Zero-Dependency & Universal Browser Support)
 * Funziona nativamente in qualsiasi browser, senza vincoli di moduli o dipendenze esterne.
 */

(function() {
  'use strict';

  // ==========================================
  // 1. CONFIGURAZIONE OFFERTE & PRESET
  // ==========================================
  const DEFAULT_BYS_URL = 'https://buyyourshare.com/pages/abbonamenti-condivisi';

  const SAVINGS_OFFERS = [
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

  const PRESET_SERVICES = [
    { id: 'netflix', name: 'Netflix', category: 'Streaming', defaultCost: 17.99, defaultCycle: 'monthly', brandColor: '#E50914', iconLetter: 'N' },
    { id: 'spotify', name: 'Spotify', category: 'Musica', defaultCost: 10.99, defaultCycle: 'monthly', brandColor: '#1DB954', iconLetter: 'S' },
    { id: 'chatgpt', name: 'ChatGPT Plus', category: 'AI & Produttività', defaultCost: 22.00, defaultCycle: 'monthly', brandColor: '#10A37F', iconLetter: 'AI' },
    { id: 'youtube', name: 'YouTube Premium', category: 'Streaming', defaultCost: 11.99, defaultCycle: 'monthly', brandColor: '#FF0000', iconLetter: 'YT' },
    { id: 'disney', name: 'Disney+', category: 'Streaming', defaultCost: 11.99, defaultCycle: 'monthly', brandColor: '#113CCF', iconLetter: 'D+' },
    { id: 'prime', name: 'Amazon Prime', category: 'Streaming', defaultCost: 49.90, defaultCycle: 'yearly', brandColor: '#00A8E1', iconLetter: 'P' },
    { id: 'dazn', name: 'DAZN', category: 'Streaming', defaultCost: 34.99, defaultCycle: 'monthly', brandColor: '#F28020', iconLetter: 'DZ' },
    { id: 'icloud', name: 'Apple iCloud+', category: 'Cloud & Storage', defaultCost: 2.99, defaultCycle: 'monthly', brandColor: '#007AFF', iconLetter: 'iC' },
    { id: 'canva', name: 'Canva Pro', category: 'AI & Produttività', defaultCost: 11.99, defaultCycle: 'monthly', brandColor: '#7D2AE8', iconLetter: 'C' },
    { id: 'microsoft365', name: 'Microsoft 365', category: 'AI & Produttività', defaultCost: 69.00, defaultCycle: 'yearly', brandColor: '#D83B01', iconLetter: 'M' },
    { id: 'playstation', name: 'PlayStation Plus', category: 'Gaming', defaultCost: 71.99, defaultCycle: 'yearly', brandColor: '#003791', iconLetter: 'PS' },
    { id: 'nordvpn', name: 'NordVPN', category: 'Cloud & Storage', defaultCost: 59.88, defaultCycle: 'yearly', brandColor: '#4687FF', iconLetter: 'VPN' }
  ];

  const DEMO_SUBSCRIPTIONS = [
    {
      id: 'demo-1',
      name: 'Netflix',
      category: 'Streaming',
      cost: 17.99,
      billingCycle: 'monthly',
      nextRenewalDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      brandColor: '#E50914'
    },
    {
      id: 'demo-2',
      name: 'Spotify',
      category: 'Musica',
      cost: 10.99,
      billingCycle: 'monthly',
      nextRenewalDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      brandColor: '#1DB954'
    },
    {
      id: 'demo-3',
      name: 'ChatGPT Plus',
      category: 'AI & Produttività',
      cost: 22.00,
      billingCycle: 'monthly',
      nextRenewalDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      brandColor: '#10A37F'
    },
    {
      id: 'demo-4',
      name: 'Amazon Prime',
      category: 'Streaming',
      cost: 49.90,
      billingCycle: 'yearly',
      nextRenewalDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      brandColor: '#00A8E1'
    },
    {
      id: 'demo-5',
      name: 'Apple iCloud+',
      category: 'Cloud & Storage',
      cost: 2.99,
      billingCycle: 'monthly',
      nextRenewalDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      brandColor: '#007AFF'
    }
  ];

  // ==========================================
  // 2. MOTORE DI CALCOLO
  // ==========================================
  function normalizeMonthly(cost, cycle) {
    const num = Number(cost);
    if (isNaN(num) || num <= 0) return 0;
    let val = num;
    if (cycle === 'quarterly') val = num / 3;
    else if (cycle === 'semiannual') val = num / 6;
    else if (cycle === 'yearly') val = num / 12;
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  function normalizeYearly(cost, cycle) {
    const num = Number(cost);
    if (isNaN(num) || num <= 0) return 0;
    let val = num * 12;
    if (cycle === 'quarterly') val = num * 4;
    else if (cycle === 'semiannual') val = num * 2;
    else if (cycle === 'yearly') val = num;
    return Math.round((val + Number.EPSILON) * 100) / 100;
  }

  function calculateAggregates(subscriptions) {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      return { totalMonthly: 0, totalYearly: 0, count: 0 };
    }
    let totalMonthly = 0;
    let totalYearly = 0;
    subscriptions.forEach(s => {
      totalMonthly += normalizeMonthly(s.cost, s.billingCycle);
      totalYearly += normalizeYearly(s.cost, s.billingCycle);
    });
    return {
      totalMonthly: Math.round((totalMonthly + Number.EPSILON) * 100) / 100,
      totalYearly: Math.round((totalYearly + Number.EPSILON) * 100) / 100,
      count: subscriptions.length
    };
  }

  function getUpcomingRenewals(subscriptions) {
    if (!Array.isArray(subscriptions)) return [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const list = [];
    subscriptions.forEach(sub => {
      if (!sub.nextRenewalDate) return;
      const d = new Date(sub.nextRenewalDate);
      d.setHours(0, 0, 0, 0);
      const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff <= 30) {
        list.push({ ...sub, daysRemaining: diff });
      }
    });
    return list.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  function matchSavings(subscriptions) {
    if (!Array.isArray(subscriptions)) return { matched: [], annualSavings: 0, monthlySavings: 0 };
    const matched = [];
    let annualSavings = 0;
    let monthlySavings = 0;

    SAVINGS_OFFERS.filter(o => o.isActive).forEach(offer => {
      const match = subscriptions.find(s => {
        if (!s || !s.name) return false;
        const sn = s.name.trim().toLowerCase();
        const on = offer.serviceName.trim().toLowerCase();
        return sn.includes(on) || on.includes(sn);
      });

      if (match) {
        const userM = normalizeMonthly(match.cost, match.billingCycle);
        const diff = Math.max(0, userM - offer.bysMonthlyPrice);
        if (diff > 0) {
          const ann = diff * 12;
          monthlySavings += diff;
          annualSavings += ann;
          matched.push({
            userSub: match,
            offer: offer,
            userMonthly: userM,
            bysMonthly: offer.bysMonthlyPrice,
            monthlyDiff: Math.round(diff * 100) / 100,
            annualDiff: Math.round(ann * 100) / 100
          });
        }
      }
    });

    return {
      matched,
      annualSavings: Math.round(annualSavings * 100) / 100,
      monthlySavings: Math.round(monthlySavings * 100) / 100
    };
  }

  function formatCurrency(val) {
    const n = Number(val) || 0;
    return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // 3. STORAGE
  // ==========================================
  const STORAGE_KEY = 'subflow_user_subscriptions_v1';

  function getSubscriptions() {
    try {
      const r = localStorage.getItem(STORAGE_KEY);
      return r ? JSON.parse(r) : [];
    } catch(e) {
      return [];
    }
  }

  function saveSubscriptions(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch(e) {}
  }

  // ==========================================
  // 4. STATO E UI CONTROLLER
  // ==========================================
  let currentTab = 'dashboard';
  let activeEditingId = null;

  function render() {
    const subs = getSubscriptions();
    const agg = calculateAggregates(subs);
    const renewals = getUpcomingRenewals(subs);
    const sav = matchSavings(subs);

    // KPI
    const elM = document.getElementById('kpiMonthly');
    const elY = document.getElementById('kpiYearly');
    const elC = document.getElementById('kpiCount');
    const elST = document.getElementById('kpiSavingsTeaser');
    const elBadge = document.getElementById('savingsTabBadge');

    if (elM) elM.textContent = formatCurrency(agg.totalMonthly);
    if (elY) elY.textContent = formatCurrency(agg.totalYearly);
    if (elC) elC.textContent = agg.count;
    if (elST) elST.textContent = sav.annualSavings > 0 ? `-${formatCurrency(sav.annualSavings)}/anno` : '0,00 €';

    if (elBadge) {
      if (sav.matched.length > 0) {
        elBadge.textContent = sav.matched.length;
        elBadge.classList.remove('hidden');
      } else {
        elBadge.classList.add('hidden');
      }
    }

    // Tabs
    const tabDash = document.getElementById('tabDashboard');
    const tabSav = document.getElementById('tabSavings');
    const viewDash = document.getElementById('dashboardView');
    const viewSav = document.getElementById('savingsView');

    if (currentTab === 'dashboard') {
      if (tabDash) tabDash.classList.add('active');
      if (tabSav) tabSav.classList.remove('active');
      if (viewDash) viewDash.classList.remove('hidden');
      if (viewSav) viewSav.classList.add('hidden');
    } else {
      if (tabSav) tabSav.classList.add('active');
      if (tabDash) tabDash.classList.remove('active');
      if (viewDash) viewDash.classList.add('hidden');
      if (viewSav) viewSav.classList.remove('hidden');
      renderSavingsView(subs, sav);
    }

    // Renewals Carousel
    const renSec = document.getElementById('upcomingRenewalsSection');
    const renCar = document.getElementById('renewalsCarousel');
    if (renewals.length > 0) {
      if (renSec) renSec.classList.remove('hidden');
      if (renCar) {
        renCar.innerHTML = renewals.map(r => {
          let bClass = 'normal';
          let bText = `Tra ${r.daysRemaining} gg`;
          if (r.daysRemaining === 0) { bClass = 'urgent'; bText = 'Oggi!'; }
          else if (r.daysRemaining <= 3) { bClass = 'urgent'; }
          else if (r.daysRemaining <= 7) { bClass = 'soon'; }
          const letter = r.name.substring(0, 2).toUpperCase();
          return `
            <div class="renewal-card">
              <div class="renewal-top">
                <div class="renewal-icon" style="background-color: ${r.brandColor || '#4f46e5'}">${letter}</div>
                <div class="renewal-info">
                  <h4>${escapeHtml(r.name)}</h4>
                  <p>${formatCurrency(r.cost)}</p>
                </div>
              </div>
              <span class="renewal-badge ${bClass}">${bText}</span>
            </div>
          `;
        }).join('');
      }
    } else {
      if (renSec) renSec.classList.add('hidden');
    }

    // Subscriptions List or Empty State
    const emptyState = document.getElementById('emptyState');
    const listContainer = document.getElementById('subscriptionsList');

    if (subs.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (listContainer) listContainer.innerHTML = '';
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      if (listContainer) {
        const cycleMap = { monthly: 'mese', quarterly: 'trimestre', semiannual: 'semestre', yearly: 'anno' };
        listContainer.innerHTML = subs.map(s => {
          const letter = s.name.substring(0, 2).toUpperCase();
          const me = normalizeMonthly(s.cost, s.billingCycle);
          const cl = cycleMap[s.billingCycle] || 'mese';
          return `
            <div class="sub-item-card">
              <div class="sub-item-left">
                <div class="sub-item-icon" style="background-color: ${s.brandColor || '#4f46e5'}">${letter}</div>
                <div class="sub-item-meta">
                  <h3 class="sub-item-name">${escapeHtml(s.name)}</h3>
                  <span class="sub-item-category">${escapeHtml(s.category || 'Altro')}</span>
                </div>
              </div>
              <div class="sub-item-right">
                <div class="sub-item-price-block">
                  <div class="sub-item-cost">${formatCurrency(s.cost)} <span class="sub-item-cycle">/${cl}</span></div>
                  ${s.billingCycle !== 'monthly' ? `<div class="sub-item-equivalent">≈ ${formatCurrency(me)}/m</div>` : ''}
                </div>
                <div class="sub-actions">
                  <button class="btn-icon" onclick="window.SubFlow.editSub('${s.id}')" title="Modifica">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                    </svg>
                  </button>
                  <button class="btn-icon" onclick="window.SubFlow.deleteSub('${s.id}', '${escapeHtml(s.name)}')" title="Elimina">
                    <svg width="16" height="16" fill="none" stroke="#dc2626" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  }

  function renderSavingsView(subs, sav) {
    const viewSav = document.getElementById('savingsView');
    if (!viewSav) return;

    let html = '';
    if (sav.annualSavings > 0) {
      html += `
        <div class="savings-hero-banner">
          <span class="savings-hero-badge">⚡ Opportunità Rilevata</span>
          <h2 class="savings-hero-title">Puoi risparmiare fino a</h2>
          <span class="savings-highlight-number">${formatCurrency(sav.annualSavings)} / anno</span>
          <p class="savings-hero-desc">
            Hai ${sav.matched.length} abbonamenti che puoi ottenere a prezzo ridotto passando alle soluzioni condivise di <strong>BuyYourShare</strong>.
          </p>
        </div>
      `;
    } else {
      html += `
        <div class="savings-hero-banner" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);">
          <span class="savings-hero-badge" style="background: rgba(255,255,255,0.15); color: #cbd5e1;">💡 BuyYourShare Smart Hub</span>
          <h2 class="savings-hero-title">Ottimizza i tuoi abbonamenti digitali</h2>
          <p class="savings-hero-desc" style="color: #94a3b8;">
            Aggiungi i tuoi abbonamenti per calcolare istantaneamente il risparmio mensile e annuale con BuyYourShare.
          </p>
        </div>
      `;
    }

    if (sav.matched.length > 0) {
      html += `
        <div class="savings-section-title">
          <span>Confronto Diretto sui Tuoi Servizi</span>
          <span class="text-accent" style="font-size: 13px;">${sav.matched.length} Abbinati</span>
        </div>
        <div class="savings-list">
      `;
      sav.matched.forEach(item => {
        const off = item.offer;
        html += `
          <div class="savings-match-card">
            <div class="savings-card-top">
              <div class="savings-card-brand">
                <span class="savings-brand-name">${escapeHtml(off.serviceName)}</span>
                ${off.badge ? `<span class="savings-badge-pill">${escapeHtml(off.badge)}</span>` : ''}
              </div>
              <span class="sub-item-category">${escapeHtml(off.category)}</span>
            </div>
            <div class="comparison-box">
              <div class="price-col">
                <div class="price-col-label">Paghi Attualmente</div>
                <div class="price-col-value old-price">${formatCurrency(item.userMonthly)}/m</div>
              </div>
              <div class="comparison-arrow">→</div>
              <div class="price-col">
                <div class="price-col-label">Con BuyYourShare</div>
                <div class="price-col-value new-price">${formatCurrency(item.bysMonthly)}/m</div>
              </div>
            </div>
            <div class="savings-delta-tag">
              <span>Risparmio Annuale Diretto:</span>
              <strong>+ ${formatCurrency(item.annualDiff)} / anno</strong>
            </div>
            <p class="savings-card-desc">${escapeHtml(off.description)}</p>
            <a href="${escapeHtml(off.ctaUrl || DEFAULT_BYS_URL)}" target="_blank" rel="noopener noreferrer" class="btn-bys-cta">
              ${escapeHtml(off.ctaText || 'Scopri l\'offerta')}
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </a>
          </div>
        `;
      });
      html += `</div>`;
    }

    // Tutte le offerte
    html += `
      <div class="savings-section-title">
        <span>Tutte le Offerte BuyYourShare Disponibili</span>
      </div>
      <div class="all-offers-grid">
    `;
    SAVINGS_OFFERS.filter(o => o.isActive).forEach(off => {
      html += `
        <div class="offer-mini-card">
          <div class="offer-mini-header">
            <div>
              <h4 class="offer-mini-name">${escapeHtml(off.serviceName)}</h4>
              <span class="sub-item-category" style="font-size: 10px;">${escapeHtml(off.category)}</span>
            </div>
            <div style="text-align: right;">
              <div class="offer-mini-price">${formatCurrency(off.bysMonthlyPrice)}<span style="font-size:11px; font-weight: normal; color: var(--text-muted);">/m</span></div>
              <div style="font-size: 10px; color: var(--text-muted); text-decoration: line-through;">${formatCurrency(off.standardMonthlyPrice)}/m</div>
            </div>
          </div>
          <p style="font-size: 12px; color: var(--text-secondary); margin: 8px 0 12px 0;">${escapeHtml(off.description)}</p>
          <a href="${escapeHtml(off.ctaUrl || DEFAULT_BYS_URL)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="width: 100%; font-size: 12px;">
            ${escapeHtml(off.ctaText || 'Vedi Dettagli')}
          </a>
        </div>
      `;
    });
    html += `</div>`;

    viewSav.innerHTML = html;
  }

  // ==========================================
  // 5. AZIONI PUBBLICHE (window.SubFlow)
  // ==========================================
  function openModal(subToEdit = null) {
    const modal = document.getElementById('subModal');
    const title = document.getElementById('modalTitle');
    const btnSave = document.getElementById('saveSubBtn');
    const presetsContainer = document.getElementById('presetsList');

    if (presetsContainer && presetsContainer.children.length === 0) {
      presetsContainer.innerHTML = PRESET_SERVICES.map(p => `
        <div class="preset-item" onclick="window.SubFlow.selectPreset('${p.id}')">
          <div class="preset-logo" style="background-color: ${p.brandColor}">${p.iconLetter}</div>
          <span class="preset-name">${p.name}</span>
        </div>
      `).join('');
    }

    if (subToEdit) {
      activeEditingId = subToEdit.id;
      if (title) title.textContent = 'Modifica Abbonamento';
      if (btnSave) btnSave.textContent = 'Aggiorna Modifiche';
      document.getElementById('subName').value = subToEdit.name;
      document.getElementById('subCategory').value = subToEdit.category || 'Altro';
      document.getElementById('subCost').value = subToEdit.cost;
      document.getElementById('subCycle').value = subToEdit.billingCycle || 'monthly';
      document.getElementById('subRenewalDate').value = subToEdit.nextRenewalDate || '';
      document.getElementById('subBrandColor').value = subToEdit.brandColor || '#4f46e5';
    } else {
      activeEditingId = null;
      if (title) title.textContent = 'Nuovo Abbonamento';
      if (btnSave) btnSave.textContent = 'Salva Abbonamento';
      document.getElementById('subName').value = '';
      document.getElementById('subCategory').value = 'Streaming';
      document.getElementById('subCost').value = '';
      document.getElementById('subCycle').value = 'monthly';
      const nm = new Date();
      nm.setMonth(nm.getMonth() + 1);
      document.getElementById('subRenewalDate').value = nm.toISOString().split('T')[0];
      document.getElementById('subBrandColor').value = '#4f46e5';
    }

    if (modal) {
      modal.classList.add('active');
      modal.style.pointerEvents = 'auto';
    }
  }

  function closeModal() {
    const modal = document.getElementById('subModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.pointerEvents = 'none';
    }
    activeEditingId = null;
  }

  function selectPreset(presetId) {
    const p = PRESET_SERVICES.find(x => x.id === presetId);
    if (!p) return;
    document.getElementById('subName').value = p.name;
    document.getElementById('subCategory').value = p.category;
    document.getElementById('subCost').value = p.defaultCost;
    document.getElementById('subCycle').value = p.defaultCycle;
    document.getElementById('subBrandColor').value = p.brandColor;
  }

  function submitForm(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('subName').value.trim();
    const cat = document.getElementById('subCategory').value;
    const cost = parseFloat(document.getElementById('subCost').value);
    const cycle = document.getElementById('subCycle').value;
    const date = document.getElementById('subRenewalDate').value;
    const color = document.getElementById('subBrandColor').value || '#4f46e5';

    if (!name || isNaN(cost) || cost <= 0) {
      alert('Inserisci un nome valido e un importo maggiore di zero.');
      return false;
    }

    const current = getSubscriptions();
    if (activeEditingId) {
      const idx = current.findIndex(s => s.id === activeEditingId);
      if (idx !== -1) {
        current[idx] = {
          ...current[idx],
          name: name,
          category: cat,
          cost: cost,
          billingCycle: cycle,
          nextRenewalDate: date,
          brandColor: color,
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      current.unshift({
        id: 'sub_' + Date.now(),
        name: name,
        category: cat,
        cost: cost,
        billingCycle: cycle,
        nextRenewalDate: date,
        brandColor: color,
        createdAt: new Date().toISOString()
      });
    }

    saveSubscriptions(current);
    closeModal();
    render();
    return false;
  }

  function editSub(id) {
    const subs = getSubscriptions();
    const s = subs.find(x => x.id === id);
    if (s) openModal(s);
  }

  function deleteSub(id, name) {
    if (confirm('Sei sicuro di voler eliminare ' + name + '?')) {
      const subs = getSubscriptions().filter(x => x.id !== id);
      saveSubscriptions(subs);
      render();
    }
  }

  function switchTab(tabName) {
    currentTab = tabName;
    render();
  }

  function loadDemo() {
    saveSubscriptions(DEMO_SUBSCRIPTIONS);
    render();
  }

  function clearData() {
    if (confirm('Vuoi davvero cancellare tutti i dati locali?')) {
      localStorage.removeItem(STORAGE_KEY);
      render();
    }
  }

  // Esponi globalmente
  window.SubFlow = {
    openModal,
    closeModal,
    selectPreset,
    submitForm,
    editSub,
    deleteSub,
    switchTab,
    loadDemo,
    clearData,
    render
  };

  // Inizializzazione automatica
  function setup() {
    const form = document.getElementById('subForm');
    if (form) {
      form.onsubmit = submitForm;
    }
    const modal = document.getElementById('subModal');
    if (modal) {
      modal.onclick = function(e) {
        if (e.target === modal) closeModal();
      };
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

})();
