/**
 * SubFlow - Savings Section Renderer (BuyYourShare Opportunities)
 * Mostra le opportunità di risparmio per i servizi attivi dell'utente e il catalogo completo
 */

import { matchSavingsOffers, formatCurrency } from '../engine/calculator.js';
import { SAVINGS_OFFERS, DEFAULT_BYS_URL } from '../config/savingsOffers.js';

export function renderSavingsSection(subscriptions = []) {
  const container = document.getElementById('savingsView');
  if (!container) return;

  const analysis = matchSavingsOffers(subscriptions, SAVINGS_OFFERS);
  const activeOffers = SAVINGS_OFFERS.filter(o => o.isActive !== false);

  let html = '';

  // 1. Hero Banner Risparmio
  if (analysis.potentialAnnualSavings > 0) {
    html += `
      <div class="savings-hero-banner">
        <span class="savings-hero-badge">⚡ Opportunità Rilevata</span>
        <h2 class="savings-hero-title">Puoi risparmiare fino a</h2>
        <span class="savings-highlight-number">${formatCurrency(analysis.potentialAnnualSavings)} / anno</span>
        <p class="savings-hero-desc">
          Hai ${analysis.matchedOffers.length} abbonamenti ottimizzabili passando alle soluzioni condivise di <strong>BuyYourShare</strong>.
          I tuoi servizi rimangono identici, ma a una frazione del costo.
        </p>
      </div>
    `;
  } else {
    html += `
      <div class="savings-hero-banner" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);">
        <span class="savings-hero-badge" style="background: rgba(255,255,255,0.15); color: #cbd5e1;">💡 BuyYourShare Smart Hub</span>
        <h2 class="savings-hero-title">Ottimizza i tuoi abbonamenti digitali</h2>
        <p class="savings-hero-desc" style="color: #94a3b8;">
          Aggiungi i tuoi abbonamenti digitali (come Netflix, Spotify, ChatGPT) per scoprire subito quanto puoi risparmiare ogni mese con le tariffe BuyYourShare.
        </p>
      </div>
    `;
  }

  // 2. Offerte Corrispondenti con Confronto Diretto
  if (analysis.matchedOffers.length > 0) {
    html += `
      <div class="savings-section-title">
        <span>Confronto Diretto sui Tuoi Servizi</span>
        <span class="text-accent" style="font-size: 13px;">${analysis.matchedOffers.length} Abbinati</span>
      </div>
      <div class="savings-list">
    `;

    analysis.matchedOffers.forEach(item => {
      const offer = item.offer;
      html += `
        <div class="savings-match-card">
          <div class="savings-card-top">
            <div class="savings-card-brand">
              <span class="savings-brand-name">${escapeHtml(offer.serviceName)}</span>
              ${offer.badge ? `<span class="savings-badge-pill">${escapeHtml(offer.badge)}</span>` : ''}
            </div>
            <span class="sub-item-category">${escapeHtml(offer.category)}</span>
          </div>

          <div class="comparison-box">
            <div class="price-col">
              <div class="price-col-label">Paghi Attualmente</div>
              <div class="price-col-value old-price">${formatCurrency(item.userMonthlyCost)}/m</div>
            </div>
            <div class="comparison-arrow">→</div>
            <div class="price-col">
              <div class="price-col-label">Con BuyYourShare</div>
              <div class="price-col-value new-price">${formatCurrency(item.bysMonthlyPrice)}/m</div>
            </div>
          </div>

          <div class="savings-delta-tag">
            <span>Risparmio Annuale Diretto:</span>
            <strong>+ ${formatCurrency(item.calculatedAnnualSavings)} / anno</strong>
          </div>

          <p class="savings-card-desc">${escapeHtml(offer.description)}</p>

          <a href="${escapeHtml(offer.ctaUrl || DEFAULT_BYS_URL)}" target="_blank" rel="noopener noreferrer" class="btn-bys-cta">
            ${escapeHtml(offer.ctaText || 'Scopri l\'offerta')}
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          </a>
        </div>
      `;
    });

    html += `</div>`;
  }

  // 3. Catalogo Completo Offerte BuyYourShare
  html += `
    <div class="savings-section-title">
      <span>Tutte le Offerte BuyYourShare Disponibili</span>
    </div>
    <div class="all-offers-grid">
  `;

  activeOffers.forEach(offer => {
    html += `
      <div class="offer-mini-card">
        <div class="offer-mini-header">
          <div>
            <h4 class="offer-mini-name">${escapeHtml(offer.serviceName)}</h4>
            <span class="sub-item-category" style="font-size: 10px;">${escapeHtml(offer.category)}</span>
          </div>
          <div style="text-align: right;">
            <div class="offer-mini-price">${formatCurrency(offer.bysMonthlyPrice)}<span style="font-size:11px; font-weight: normal; color: var(--text-muted);">/m</span></div>
            <div style="font-size: 10px; color: var(--text-muted); text-decoration: line-through;">${formatCurrency(offer.standardMonthlyPrice)}/m</div>
          </div>
        </div>
        <p style="font-size: 12px; color: var(--text-secondary); margin: 8px 0 12px 0;">${escapeHtml(offer.description)}</p>
        <a href="${escapeHtml(offer.ctaUrl || DEFAULT_BYS_URL)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="width: 100%; font-size: 12px;">
          ${escapeHtml(offer.ctaText || 'Vedi Dettagli')}
        </a>
      </div>
    `;
  });

  html += `</div>`;

  container.innerHTML = html;
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
