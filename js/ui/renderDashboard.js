/**
 * SubFlow - Dashboard Renderer
 * Renderizza KPI, timeline scadenze e lista abbonamenti
 */

import {
  calculateAggregates,
  getUpcomingRenewals,
  normalizeMonthly,
  formatCurrency,
  matchSavingsOffers
} from '../engine/calculator.js';
import { SAVINGS_OFFERS } from '../config/savingsOffers.js';
import { openModal, handleDelete } from './modalManager.js';
import { loadDemoData } from '../storage/storageManager.js';

export function updateSavingsBadge(subscriptions = []) {
  const savingsAnalysis = matchSavingsOffers(subscriptions, SAVINGS_OFFERS);
  const savingsTabBadge = document.getElementById('savingsTabBadge');
  if (savingsTabBadge) {
    if (savingsAnalysis.matchedOffers.length > 0) {
      savingsTabBadge.textContent = savingsAnalysis.matchedOffers.length;
      savingsTabBadge.classList.remove('hidden');
    } else {
      savingsTabBadge.classList.add('hidden');
    }
  }
}

export function renderDashboard(subscriptions = [], onDataChange) {
  const aggregates = calculateAggregates(subscriptions);
  const upcomingRenewals = getUpcomingRenewals(subscriptions, 30);
  const savingsAnalysis = matchSavingsOffers(subscriptions, SAVINGS_OFFERS);

  // 1. Aggiornamento KPI Cards
  const kpiMonthly = document.getElementById('kpiMonthly');
  const kpiYearly = document.getElementById('kpiYearly');
  const kpiCount = document.getElementById('kpiCount');
  const kpiSavingsTeaser = document.getElementById('kpiSavingsTeaser');

  if (kpiMonthly) kpiMonthly.textContent = formatCurrency(aggregates.totalMonthly);
  if (kpiYearly) kpiYearly.textContent = formatCurrency(aggregates.totalYearly);
  if (kpiCount) kpiCount.textContent = aggregates.count;

  if (kpiSavingsTeaser) {
    if (savingsAnalysis.potentialAnnualSavings > 0) {
      kpiSavingsTeaser.textContent = `-${formatCurrency(savingsAnalysis.potentialAnnualSavings)}/anno`;
    } else {
      kpiSavingsTeaser.textContent = '0,00 €';
    }
  }

  updateSavingsBadge(subscriptions);

  // 2. Timeline Prossimi Rinnovi
  const renewalsSection = document.getElementById('upcomingRenewalsSection');
  const renewalsContainer = document.getElementById('renewalsCarousel');

  if (upcomingRenewals.length > 0) {
    renewalsSection.classList.remove('hidden');
    renewalsContainer.innerHTML = upcomingRenewals.map(sub => {
      let badgeClass = 'normal';
      let badgeLabel = `Tra ${sub.daysRemaining} gg`;

      if (sub.daysRemaining === 0) {
        badgeClass = 'urgent';
        badgeLabel = 'Oggi!';
      } else if (sub.daysRemaining <= 3) {
        badgeClass = 'urgent';
        badgeLabel = `Tra ${sub.daysRemaining} gg`;
      } else if (sub.daysRemaining <= 7) {
        badgeClass = 'soon';
      }

      const iconLetter = sub.name.substring(0, 2).toUpperCase();

      return `
        <div class="renewal-card">
          <div class="renewal-top">
            <div class="renewal-icon" style="background-color: ${sub.brandColor || '#4f46e5'}">
              ${iconLetter}
            </div>
            <div class="renewal-info">
              <h4>${escapeHtml(sub.name)}</h4>
              <p>${formatCurrency(sub.cost)}</p>
            </div>
          </div>
          <span class="renewal-badge ${badgeClass}">${badgeLabel}</span>
        </div>
      `;
    }).join('');
  } else {
    renewalsSection.classList.add('hidden');
  }

  // 3. Elenco Abbonamenti o Empty State
  const listContainer = document.getElementById('subscriptionsList');
  const emptyState = document.getElementById('emptyState');
  const heroAwareness = document.getElementById('heroAwareness');

  if (subscriptions.length === 0) {
    listContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    heroAwareness.classList.remove('hidden');

    // Listener per il pulsante "Carica Dati Demo"
    const loadDemoBtn = document.getElementById('loadDemoBtn');
    if (loadDemoBtn) {
      loadDemoBtn.onclick = () => {
        loadDemoData();
        onDataChange();
      };
    }
  } else {
    emptyState.classList.add('hidden');

    listContainer.innerHTML = subscriptions.map(sub => {
      const iconLetter = sub.name.substring(0, 2).toUpperCase();
      const monthlyEquiv = normalizeMonthly(sub.cost, sub.billingCycle);
      const cycleLabelMap = {
        monthly: 'mese',
        quarterly: 'trimestre',
        semiannual: 'semestre',
        yearly: 'anno'
      };
      const cycleLabel = cycleLabelMap[sub.billingCycle] || 'mese';

      return `
        <div class="sub-item-card" data-id="${sub.id}">
          <div class="sub-item-left">
            <div class="sub-item-icon" style="background-color: ${sub.brandColor || '#4f46e5'}">
              ${iconLetter}
            </div>
            <div class="sub-item-meta">
              <h3 class="sub-item-name">${escapeHtml(sub.name)}</h3>
              <span class="sub-item-category">${escapeHtml(sub.category || 'Altro')}</span>
            </div>
          </div>

          <div class="sub-item-right">
            <div class="sub-item-price-block">
              <div class="sub-item-cost">${formatCurrency(sub.cost)} <span class="sub-item-cycle">/${cycleLabel}</span></div>
              ${sub.billingCycle !== 'monthly' ? `<div class="sub-item-equivalent">≈ ${formatCurrency(monthlyEquiv)}/m</div>` : ''}
            </div>

            <div class="sub-actions">
              <button class="btn-icon edit-sub-btn" title="Modifica" data-id="${sub.id}">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
              </button>
              <button class="btn-icon delete-sub-btn" title="Elimina" data-id="${sub.id}" data-name="${escapeHtml(sub.name)}">
                <svg width="16" height="16" fill="none" stroke="#dc2626" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Event Listeners per Modifica ed Elimina
    listContainer.querySelectorAll('.edit-sub-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const sub = subscriptions.find(s => s.id === id);
        if (sub) openModal(sub);
      });
    });

    listContainer.querySelectorAll('.delete-sub-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        handleDelete(id, name, onDataChange);
      });
    });
  }
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
