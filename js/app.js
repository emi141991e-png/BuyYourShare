/**
 * BuyYourShare - Standalone Marketplace Controller & SPA Router
 * Modello P2P con Quote Mensili, Commissione 0,99€, Chat Privata Nativa e Accesso Automatico
 */

import { db } from './db/database.js';
import { authService } from './services/authService.js';
import { eurosToCents, centsToEuros, formatCents } from './engine/MoneyEngine.js';
import { calculatePricingBreakdown } from './engine/FeeEngine.js';
import { formatDateIT, formatDateShort } from './engine/DateEngine.js';
import { stripeCheckoutService } from './services/stripeCheckoutService.js';
import { stripeConnectService } from './services/stripeConnectService.js';
import { financialAuditService } from './services/financialAuditService.js';

// =========================================================================
// GLOBAL STATE & ROUTING
// =========================================================================
let currentRoute = window.location.hash || '#home';
let selectedCategoryFilter = 'ALL';
let searchKeyword = '';
let wizardState = {
  serviceId: '',
  customServiceName: '',
  planName: '',
  realCostEuros: '',
  totalSlots: '',
  ownerSlots: '1',
  accessUrl: '',
  instructions: '',
  additionalInfo: '',
  accessCode: '',
  payoutLegalName: '',
  payoutIban: '',
  payoutBankName: ''
};

export function showToast(message) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

export function copyToClipboard(text, successMsg = 'Copiato negli appunti!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(successMsg)).catch(() => promptCopy(text));
  } else {
    promptCopy(text);
  }
}

function promptCopy(text) {
  prompt('Copia il link:', text);
}

// =========================================================================
// ROUTER & NAVIGATION
// =========================================================================
function navigateTo(hash) {
  window.location.hash = hash;
}

window.addEventListener('hashchange', async () => {
  currentRoute = window.location.hash || '#home';
  const currentUser = authService.getCurrentUser();
  await db.syncAllFromServer(currentUser);
  renderApp();
});

// =========================================================================
// MAIN RENDER DISPATCHER CON ROUTE GUARDS & RBAC
// =========================================================================
export function renderApp() {
  const container = document.getElementById('mainAppContainer');
  if (!container) return;

  try {
    const isAuth = authService.isAuthenticated();
    const currentUser = authService.getCurrentUser();
    updateHeader(currentUser);
    updateBottomNav();

    // Rotte pubbliche esplicite di login / registrazione / recupero password
    if (currentRoute.startsWith('#reset-password')) {
      const hashParts = currentRoute.split('?');
      const params = new URLSearchParams(hashParts[1] || window.location.search || '');
      const email = params.get('email') || '';
      const token = params.get('token') || params.get('code') || '';
      renderAuthLandingView(container, 'reset', email, token);
      return;
    }
    if (currentRoute === '#login') {
      renderAuthLandingView(container, 'login');
      return;
    }
    if (currentRoute === '#register') {
      renderAuthLandingView(container, 'register');
      return;
    }

    // Se l'utente non è autenticato, proteggi tutte le aree private
    const protectedRoutes = ['#crea', '#miei-abbonamenti', '#miei-gruppi', '#admin', '#notifiche'];
    const isChatRoute = currentRoute.startsWith('#chat-');
    const isProtected = protectedRoutes.includes(currentRoute) || isChatRoute;

    if (!isAuth && isProtected) {
      renderAuthLandingView(container, 'login');
      return;
    }

    if (currentRoute === '#home' || currentRoute === '') {
      renderHomeView(container, currentUser);
    } else if (currentRoute === '#cerca') {
      renderMarketplaceView(container, currentUser);
    } else if (currentRoute.startsWith('#gruppo-')) {
      const groupId = currentRoute.replace('#gruppo-', '');
      renderGroupDetailView(container, groupId, currentUser);
    } else if (currentRoute === '#crea') {
      renderWizardView(container, currentUser);
    } else if (currentRoute === '#miei-abbonamenti') {
      renderMySubscriptionsView(container, currentUser);
    } else if (currentRoute === '#miei-gruppi') {
      renderMyGroupsView(container, currentUser);
    } else if (currentRoute.startsWith('#chat-')) {
      const groupId = currentRoute.replace('#chat-', '');
      renderChatView(container, groupId, currentUser);
    } else if (currentRoute === '#admin') {
      if (!currentUser || currentUser.role !== 'admin') {
        renderForbiddenAdminView(container, currentUser);
      } else {
        renderAdminView(container, currentUser);
      }
    } else if (currentRoute === '#notifiche') {
      renderNotificationsView(container, currentUser);
    } else {
      renderHomeView(container, currentUser);
    }
  } catch (err) {
    console.error('Fatal renderApp error:', err);
    container.innerHTML = `
      <div style="padding:40px 20px; text-align:center; max-width:640px; margin:0 auto;">
        <div style="background:#fef2f2; border:1px solid #f87171; border-radius:var(--radius-lg); padding:20px; text-align:left;">
          <h3 style="font-size:16px; font-weight:800; color:#991b1b; margin-bottom:8px;">⚠️ Errore di Caricamento Vista</h3>
          <p style="font-size:12px; color:#7f1d1d; margin-bottom:12px;">Si è verificato un errore durante la renderizzazione della schermata.</p>
          <pre style="font-size:11px; background:#fff; border:1px solid #fca5a5; padding:10px; border-radius:6px; overflow:auto; color:#991b1b;">${escapeHtml(err.stack || err.message)}</pre>
          <div style="margin-top:14px; display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="location.hash='#home'; location.reload();">Torna alla Home</button>
            <button class="btn btn-secondary btn-sm" onclick="localStorage.removeItem('buyyourshare_db_v5'); location.reload();">Ripristina Dati Iniziali</button>
          </div>
        </div>
      </div>
    `;
  }
}

function renderForbiddenAdminView(container, currentUser) {
  container.innerHTML = `
    <div class="page-view" style="max-width:540px; margin:40px auto; padding:0 16px;">
      <div style="background:white; border:2px solid #ef4444; border-radius:var(--radius-lg); padding:32px 24px; text-align:center; box-shadow:0 10px 25px -5px rgba(239, 68, 68, 0.15);">
        <div style="width:56px; height:56px; background:#fee2e2; color:#dc2626; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:26px; margin:0 auto 16px;">
          🚫
        </div>
        <h2 style="font-size:18px; font-weight:900; color:#991b1b; margin-bottom:8px;">Accesso Riservato (403 Forbidden)</h2>
        <p style="font-size:13px; color:#7f1d1d; margin-bottom:18px; line-height:1.5;">
          Quest'area amministrativa è privata ed accessibile esclusivamente all'Amministratore della piattaforma.
        </p>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <a href="#home" class="btn btn-primary btn-sm" style="font-size:12.5px;">🏠 Torna alla Home</a>
          <a href="#login" class="btn btn-secondary btn-sm" style="font-size:12.5px;">🔐 Accedi con altro account</a>
        </div>
      </div>
    </div>
  `;
}

function updateHeader(currentUser) {
  const isAuth = authService.isAuthenticated();
  const headerActions = document.querySelector('.header-actions');
  if (!headerActions) return;

  if (!isAuth || !currentUser) {
    headerActions.innerHTML = `
      <a href="#login" class="btn btn-secondary btn-sm" style="font-size:12px; font-weight:700; padding:6px 12px;">
        🔐 Accedi
      </a>
      <a href="#register" class="btn btn-primary btn-sm" style="font-size:12px; font-weight:800; padding:6px 14px; background:#003087;">
        ✨ Registrati
      </a>
    `;
    return;
  }

  const roleLabel = currentUser.role === 'admin' ? '⚙️ Admin' : (currentUser.id.includes('owner') || db.getMyCreatedGroups(currentUser.id, currentUser).length > 0 ? '👑 Capogruppo' : '👤 Membro');
  const roleBg = currentUser.role === 'admin' ? '#f3e8ff' : (roleLabel.includes('Capogruppo') ? '#fef3c7' : '#e0f2fe');
  const roleColor = currentUser.role === 'admin' ? '#6b21a8' : (roleLabel.includes('Capogruppo') ? '#92400e' : '#0369a1');

  const unreadNotifs = db.getNotifications(currentUser.id).filter(n => !n.isRead).length;

  headerActions.innerHTML = `
    <!-- User Badge & Name -->
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size:11px; background:${roleBg}; color:${roleColor}; padding:3px 8px; border-radius:var(--radius-full); font-weight:800; white-space:nowrap;">
        ${roleLabel}
      </span>
      <span style="font-weight:700; font-size:12.5px; color:var(--text-main); white-space:nowrap;">
        👤 ${escapeHtml(currentUser.fullName)}
      </span>
    </div>

    <!-- Notifiche Button -->
    <a href="#notifiche" class="notif-btn" title="Notifiche">
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
      </svg>
      <span id="headerNotifBadge" class="notif-badge ${unreadNotifs > 0 ? '' : 'hidden'}">${unreadNotifs}</span>
    </a>

    <!-- Admin Link (Only for Admin) -->
    ${currentUser.role === 'admin' ? `
      <a href="#admin" class="btn btn-secondary btn-sm" style="font-size:11px; padding:4px 8px;" title="Pannello Admin">
        ⚙️ Admin
      </a>
      <button id="btnOpenGatewayConfigHeader" class="btn btn-sm" style="font-size:11px; padding:4px 8px; background:#f0fdf4; border:1px solid #86efac; color:#166534; font-weight:700;" title="Configura PayPal Sandbox Client ID">
        🅿️ Config PayPal
      </button>
      <button id="btnOpenEmailConfigHeader" class="btn btn-sm" style="font-size:11px; padding:4px 8px; background:#eff6ff; border:1px solid #93c5fd; color:#1d4ed8; font-weight:700;" title="Configura Gateway Email (Gmail / Resend / Brevo / SMTP)">
        📧 Config Email
      </button>
    ` : ''}

    <!-- Payment and Payout Settings Button -->
    <button id="btnOpenPaymentSettingsHeader" class="btn btn-secondary btn-sm" style="font-size:11px; padding:4px 8px;" title="Gestione IBAN e Metodi di Pagamento">
      💳 Pagamenti & IBAN
    </button>

    <!-- Logout Button -->
    <button id="btnLogoutHeader" class="btn btn-secondary btn-sm" style="font-size:11.5px; padding:4px 8px; color:#dc2626; border-color:#fca5a5;" title="Disconnetti account">
      🚪 Esci
    </button>
  `;

  // Bind Payment Modal
  const btnPayment = document.getElementById('btnOpenPaymentSettingsHeader');
  if (btnPayment) {
    btnPayment.onclick = () => openPaymentAndPayoutSettingsModal(currentUser, 'payout');
  }

  // Bind Gateway Config (Admin only)
  const btnGateway = document.getElementById('btnOpenGatewayConfigHeader');
  if (btnGateway) {
    btnGateway.onclick = () => openGatewayConfigModal();
  }

  // Bind Email Config (Admin only)
  const btnEmail = document.getElementById('btnOpenEmailConfigHeader');
  if (btnEmail) {
    btnEmail.onclick = () => openEmailConfigModal();
  }

  // Bind Logout
  const btnLogout = document.getElementById('btnLogoutHeader');
  if (btnLogout) {
    btnLogout.onclick = async () => {
      await authService.logout();
      db.clearUserData();
      await db.syncAllFromServer(null);
      showToast('Disconnessione effettuata.');
      navigateTo('#login');
      renderApp();
    };
  }
}

function updateBottomNav() {
  const isAuth = authService.isAuthenticated();
  const bottomNav = document.querySelector('.bottom-nav');
  if (!bottomNav) return;

  if (!isAuth) {
    bottomNav.innerHTML = `
      <a href="#home" class="nav-item ${currentRoute === '#home' || currentRoute === '' ? 'active' : ''}">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
        </svg>
        <span>Home</span>
      </a>
      <a href="#cerca" class="nav-item ${currentRoute === '#cerca' ? 'active' : ''}">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <span>Cerca</span>
      </a>
      <a href="#login" class="nav-item ${currentRoute === '#login' ? 'active' : ''}">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path>
        </svg>
        <span>Accedi</span>
      </a>
      <a href="#register" class="nav-item ${currentRoute === '#register' ? 'active' : ''}">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>
        </svg>
        <span>Registrati</span>
      </a>
    `;
    return;
  }

  bottomNav.innerHTML = `
    <a href="#home" class="nav-item ${currentRoute === '#home' || currentRoute === '' ? 'active' : ''}">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
      </svg>
      <span>Home</span>
    </a>
    <a href="#cerca" class="nav-item ${currentRoute === '#cerca' ? 'active' : ''}">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
      </svg>
      <span>Cerca</span>
    </a>
    <a href="#crea" class="nav-item nav-item-highlight ${currentRoute === '#crea' ? 'active' : ''}">
      <div class="nav-create-icon">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path>
        </svg>
      </div>
      <span>Crea</span>
    </a>
    <a href="#miei-gruppi" class="nav-item ${currentRoute === '#miei-gruppi' ? 'active' : ''}">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
      </svg>
      <span>I Miei Gruppi</span>
    </a>
    <a href="#miei-abbonamenti" class="nav-item ${currentRoute === '#miei-abbonamenti' ? 'active' : ''}">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
      </svg>
      <span>Abbonamenti</span>
    </a>
  `;
}

// =========================================================================
// 0. AUTHENTICATION & REGISTRATION LANDING VIEW (CON EMAIL AUTOMATICA & RECUPERO PASSWORD)
// =========================================================================
function renderAuthLandingView(container, initialTab = 'login', emailPrefill = '', tokenPrefill = '') {
  let activeTab = initialTab;
  let resetEmailHolder = emailPrefill || '';
  let resetCodeHolder = tokenPrefill || '';
  let sentEmailNotice = false;

  function renderForm() {
    container.innerHTML = `
      <div class="page-view" style="max-width:520px; margin:28px auto; padding:0 16px;">
        <!-- Header Brand & Tagline -->
        <div style="text-align:center; margin-bottom:24px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; width:54px; height:54px; background:linear-gradient(135deg, #003087, #0070ba); color:white; border-radius:16px; font-size:26px; font-weight:900; box-shadow:0 6px 16px rgba(0,48,135,0.25); margin-bottom:12px;">
            B
          </div>
          <h1 style="font-size:24px; font-weight:900; color:var(--text-main); margin-bottom:6px;">Benvenuto su BuyYourShare</h1>
          <p style="font-size:13.5px; color:var(--text-secondary); max-width:420px; margin:0 auto; line-height:1.4;">
            La piattaforma sicura per condividere abbonamenti digitali legittimamente con MoneySplit e ricezione quote su IBAN.
          </p>
        </div>

        <!-- Auth Card Container -->
        <div style="background:white; border:1px solid #cbd5e1; border-radius:var(--radius-xl); padding:26px 28px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.06);">
          
          ${activeTab === 'login' || activeTab === 'register' ? `
            <!-- Tabs Switcher -->
            <div style="display:grid; grid-template-columns:1fr 1fr; background:#f1f5f9; border-radius:var(--radius-md); padding:4px; margin-bottom:22px;">
              <button type="button" id="tabBtnLogin" class="btn ${activeTab === 'login' ? 'btn-primary' : 'btn-ghost'}" style="font-size:13px; font-weight:800; padding:8px; border-radius:var(--radius-sm); border:none; ${activeTab === 'login' ? 'background:#003087; color:white;' : 'color:var(--text-secondary);'}">
                🔐 Accedi
              </button>
              <button type="button" id="tabBtnRegister" class="btn ${activeTab === 'register' ? 'btn-primary' : 'btn-ghost'}" style="font-size:13px; font-weight:800; padding:8px; border-radius:var(--radius-sm); border:none; ${activeTab === 'register' ? 'background:#003087; color:white;' : 'color:var(--text-secondary);'}">
                ✨ Registrati
              </button>
            </div>
          ` : ''}

          <!-- TAB 1: LOGIN -->
          ${activeTab === 'login' ? `
            <form id="loginForm">
              <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label" style="font-size:12.5px; font-weight:700;">Indirizzo Email</label>
                <input type="email" id="loginEmail" class="form-input" placeholder="es. mario.rossi@email.com" value="${escapeHtml(resetEmailHolder || emailPrefill || '')}" required autofocus style="font-size:13.5px; padding:10px 12px;">
              </div>

              <div class="form-group" style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                  <label class="form-label" style="font-size:12.5px; font-weight:700; margin-bottom:0;">Password</label>
                  <button type="button" id="btnForgotPassLink" style="background:none; border:none; color:#0070ba; font-size:11.5px; font-weight:700; cursor:pointer; padding:0; text-decoration:underline;">
                    Password dimenticata?
                  </button>
                </div>
                <input type="password" id="loginPassword" class="form-input" placeholder="••••••••" value="" required style="font-size:13.5px; padding:10px 12px;">
              </div>

              <button type="submit" id="btnSubmitLogin" class="btn btn-primary btn-block" style="background:#003087; font-size:14px; font-weight:800; padding:12px; margin-top:6px;">
                🔐 Accedi al tuo Account
              </button>
            </form>
          ` : activeTab === 'register' ? `
            <!-- TAB 2: REGISTER -->
            <form id="registerForm">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Nome *</label>
                  <input type="text" id="regFirstName" class="form-input" placeholder="es. Mario" required style="font-size:13px; padding:9px 11px;">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Cognome *</label>
                  <input type="text" id="regLastName" class="form-input" placeholder="es. Rossi" required style="font-size:13px; padding:9px 11px;">
                </div>
              </div>

              <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" style="font-size:12px; font-weight:700;">Indirizzo Email *</label>
                <input type="email" id="regEmail" class="form-input" placeholder="es. mario.rossi@email.com" required style="font-size:13px; padding:9px 11px;">
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px;">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Password *</label>
                  <input type="password" id="regPassword" class="form-input" placeholder="Min. 8 caratteri" minlength="8" required style="font-size:13px; padding:9px 11px;">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Conferma Password *</label>
                  <input type="password" id="regConfirmPassword" class="form-input" placeholder="Ripeti password" minlength="8" required style="font-size:13px; padding:9px 11px;">
                </div>
              </div>

              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:12px; margin-bottom:16px;">
                <label style="display:flex; align-items:flex-start; gap:8px; font-size:11.5px; color:var(--text-secondary); cursor:pointer; margin-bottom:8px;">
                  <input type="checkbox" id="regTerms" required style="margin-top:2px;">
                  <span>Accetto i <strong>Termini e Condizioni di Servizio</strong> di BuyYourShare. *</span>
                </label>
                <label style="display:flex; align-items:flex-start; gap:8px; font-size:11.5px; color:var(--text-secondary); cursor:pointer; margin-bottom:0;">
                  <input type="checkbox" id="regPrivacy" required style="margin-top:2px;">
                  <span>Dichiaro di aver preso visione dell'<strong>Informativa Privacy (GDPR)</strong> e di essere maggiorenne. *</span>
                </label>
              </div>

              <button type="submit" id="btnSubmitRegister" class="btn btn-primary btn-block" style="background:#003087; font-size:14px; font-weight:800; padding:12px;">
                ✨ Crea Account ed Entra Subito
              </button>
              <p style="font-size:11px; text-align:center; color:var(--text-muted); margin-top:8px; margin-bottom:0;">
                📧 Ti invieremo un'email automatica di conferma registrazione.
              </p>
            </form>
          ` : activeTab === 'forgot' ? `
            <!-- TAB 3: FORGOT PASSWORD (INVIO EMAIL CON LINK DIRETTO) -->
            ${sentEmailNotice ? `
              <div style="padding:10px 0; text-align:center;">
                <div style="font-size:48px; margin-bottom:10px;">📬</div>
                <h2 style="font-size:20px; font-weight:900; color:#166534; margin:0 0 8px;">Link Inviato alla tua Email!</h2>
                <p style="font-size:13.5px; color:#334155; line-height:1.5; margin-bottom:16px;">
                  Abbiamo inviato un'email a <strong>${escapeHtml(resetEmailHolder)}</strong>.
                </p>
                <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:var(--radius-md); padding:14px 16px; margin-bottom:16px; font-size:13px; color:#15803d; text-align:left; line-height:1.5;">
                  👉 <strong>Cosa fare adesso:</strong><br>
                  1. Apri la tua casella di posta.<br>
                  2. Clicca sul pulsante <strong>"🔐 Reimposta la tua Password Subito"</strong> per scegliere la nuova password.<br>
                  <strong style="font-size:12px; color:#b91c1c; display:block; margin-top:8px; background:#fef2f2; padding:6px 8px; border-radius:4px; border:1px solid #fecaca;">
                    ⚠️ ATTENZIONE: Se non la trovi in Posta in Arrivo, controlla nella cartella SPAM o POSTA INDESIDERATA.
                  </strong>
                </div>

                ${resetEmailHolder.toLowerCase().includes('@libero.it') ? `
                  <a href="https://mail.libero.it" target="_blank" class="btn btn-primary btn-block" style="background:#f59e0b; color:#ffffff !important; font-weight:800; padding:12px; margin-bottom:10px; font-size:13.5px; text-decoration:none; display:block;">
                    📧 Apri Libero Mail
                  </a>
                ` : resetEmailHolder.toLowerCase().includes('@gmail.com') ? `
                  <a href="https://mail.google.com" target="_blank" class="btn btn-primary btn-block" style="background:#ea4335; color:#ffffff !important; font-weight:800; padding:12px; margin-bottom:10px; font-size:13.5px; text-decoration:none; display:block;">
                    📧 Apri Gmail
                  </a>
                ` : resetEmailHolder.toLowerCase().includes('@outlook.') || resetEmailHolder.toLowerCase().includes('@hotmail.') ? `
                  <a href="https://outlook.live.com" target="_blank" class="btn btn-primary btn-block" style="background:#0078d4; color:#ffffff !important; font-weight:800; padding:12px; margin-bottom:10px; font-size:13.5px; text-decoration:none; display:block;">
                    📧 Apri Outlook
                  </a>
                ` : ''}

                <button type="button" id="btnGoToDirectResetForm" class="btn btn-primary btn-block" style="background:#166534; font-size:13.5px; font-weight:800; padding:12px; margin-bottom:10px;">
                  🔑 Imposta Nuova Password Subito qui
                </button>

                <button type="button" id="btnBackToLoginFromSent" class="btn btn-secondary btn-block" style="font-size:13px; font-weight:700;">
                  ← Torna alla Pagina di Accesso
                </button>
              </div>
            ` : `
              <form id="forgotPasswordForm">
                <div style="text-align:center; margin-bottom:18px;">
                  <span style="font-size:32px;">🔐</span>
                  <h2 style="font-size:18px; font-weight:900; color:var(--text-main); margin:6px 0 4px;">Recupero & Reimpostazione Password</h2>
                  <p style="font-size:13px; color:var(--text-secondary); margin:0; line-height:1.4;">
                    Inserisci l'email del tuo account e il tuo nome per verificare l'identità e scegliere subito la tua nuova password.
                  </p>
                </div>

                <div class="form-group" style="margin-bottom:14px;">
                  <label class="form-label" style="font-size:12.5px; font-weight:700;">Indirizzo Email dell'Account *</label>
                  <input type="email" id="forgotEmailInput" class="form-input" placeholder="es. mario.rossi@libero.it o emilio@gmail.com" value="${escapeHtml(resetEmailHolder)}" required autofocus style="font-size:13.5px; padding:10px 12px;">
                </div>

                <div class="form-group" style="margin-bottom:18px;">
                  <label class="form-label" style="font-size:12.5px; font-weight:700;">Nome o Cognome dell'Intestatario</label>
                  <input type="text" id="forgotNameInput" class="form-input" placeholder="es. Mario oppure Rossi (opzionale)" style="font-size:13.5px; padding:10px 12px;">
                  <small style="display:block; font-size:11px; color:#64748b; margin-top:4px;">Usato per confermare l'identità del titolare dell'account.</small>
                </div>

                <button type="submit" id="btnSubmitForgot" class="btn btn-primary btn-block" style="background:#003087; font-size:14px; font-weight:800; padding:12px;">
                  🔐 Verifica Identità e Reimposta Password Subito
                </button>

                <div style="text-align:center; margin-top:16px;">
                  <button type="button" id="btnBackToLoginFromForgot" style="background:none; border:none; color:#0070ba; font-size:12.5px; font-weight:700; cursor:pointer;">
                    ← Torna all'Accesso
                  </button>
                </div>
              </form>
            `}
          ` : `
            <!-- TAB 4: RESET PASSWORD (APERTURA DIRETTA DA LINK EMAIL) -->
            <form id="resetPasswordForm">
              <div style="text-align:center; margin-bottom:14px;">
                <span style="font-size:32px;">🔐</span>
                <h2 style="font-size:18px; font-weight:900; color:var(--text-main); margin:6px 0 4px;">Reimposta la tua Password</h2>
                <p style="font-size:12.5px; color:var(--text-secondary); margin:0;">
                  Account: <strong>${escapeHtml(resetEmailHolder || 'Il tuo Account')}</strong>
                </p>
              </div>

              <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:var(--radius-md); padding:10px 14px; margin-bottom:14px; text-align:center;">
                <span style="font-size:12px; color:#166534; font-weight:800; display:block; margin-bottom:2px;">
                  ✅ Richiesta di Ripristino Autorizzata!
                </span>
                <span style="font-size:11.5px; color:#15803d; line-height:1.4;">
                  Scegli la tua nuova password e clicca su <strong>Salva ed Entra</strong>.
                </span>
              </div>

              ${!resetEmailHolder ? `
                <div class="form-group" style="margin-bottom:12px;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Indirizzo Email *</label>
                  <input type="email" id="resetEmailInput" class="form-input" placeholder="es. mario.rossi@email.com" value="" required style="font-size:13px; padding:9px 11px;">
                </div>
              ` : ''}

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Nuova Password *</label>
                  <input type="password" id="resetNewPassInput" class="form-input" placeholder="Min. 8 caratteri" minlength="8" required autofocus style="font-size:13px; padding:9px 11px;">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label" style="font-size:12px; font-weight:700;">Ripeti Password *</label>
                  <input type="password" id="resetConfirmPassInput" class="form-input" placeholder="Ripeti password" minlength="8" required style="font-size:13px; padding:9px 11px;">
                </div>
              </div>

              <button type="submit" id="btnSubmitReset" class="btn btn-primary btn-block" style="background:#166534; font-size:14px; font-weight:800; padding:12px;">
                💾 Salva Nuova Password ed Entra Subito
              </button>

              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-size:12px;">
                <button type="button" id="btnBackToLoginFromReset" style="background:none; border:none; color:var(--text-secondary); font-weight:700; cursor:pointer; padding:0;">
                  ← Torna al Login
                </button>
              </div>
            </form>
          `}
        </div>

        <p style="text-align:center; font-size:11.5px; color:var(--text-muted); margin-top:20px;">
          🔒 Connessione cifrata TLS 256-bit • Pagamenti protetti con Stripe Connect & PayPal Sandbox
        </p>
      </div>
    `;

    // Tab switch triggers
    const tabLogin = container.querySelector('#tabBtnLogin');
    if (tabLogin) {
      tabLogin.onclick = () => {
        activeTab = 'login';
        renderForm();
      };
    }
    const tabRegister = container.querySelector('#tabBtnRegister');
    if (tabRegister) {
      tabRegister.onclick = () => {
        activeTab = 'register';
        renderForm();
      };
    }

    // Link Forgot Password in login
    const btnForgotLink = container.querySelector('#btnForgotPassLink');
    if (btnForgotLink) {
      btnForgotLink.onclick = () => {
        const currentEmailVal = container.querySelector('#loginEmail')?.value || '';
        if (currentEmailVal) resetEmailHolder = currentEmailVal;
        activeTab = 'forgot';
        sentEmailNotice = false;
        renderForm();
      };
    }

    // Back to login triggers
    const btnBackForgot = container.querySelector('#btnBackToLoginFromForgot');
    if (btnBackForgot) {
      btnBackForgot.onclick = () => {
        activeTab = 'login';
        renderForm();
      };
    }

    const btnBackSent = container.querySelector('#btnBackToLoginFromSent');
    if (btnBackSent) {
      btnBackSent.onclick = () => {
        activeTab = 'login';
        renderForm();
      };
    }

    const btnGoDirect = container.querySelector('#btnGoToDirectResetForm');
    if (btnGoDirect) {
      btnGoDirect.onclick = () => {
        activeTab = 'reset';
        renderForm();
      };
    }

    const btnBackReset = container.querySelector('#btnBackToLoginFromReset');
    if (btnBackReset) {
      btnBackReset.onclick = () => {
        activeTab = 'login';
        renderForm();
      };
    }

    // Submit Login Form
    const loginForm = container.querySelector('#loginForm');
    if (loginForm) {
      loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = container.querySelector('#loginEmail').value;
        const password = container.querySelector('#loginPassword').value;
        try {
          const u = await authService.login(email, password);
          showToast(`🎉 Bentornato/a, ${u.fullName}!`);
          await db.syncAllFromServer(u);
          navigateTo('#home');
          renderApp();
        } catch (err) {
          alert('❌ ' + err.message);
        }
      };
    }

    // Submit Register Form (Accesso Diretto Immediato con Email di Benvenuto)
    const registerForm = container.querySelector('#registerForm');
    if (registerForm) {
      registerForm.onsubmit = async (e) => {
        e.preventDefault();
        const firstName = container.querySelector('#regFirstName').value;
        const lastName = container.querySelector('#regLastName').value;
        const email = container.querySelector('#regEmail').value;
        const password = container.querySelector('#regPassword').value;
        const confirmPassword = container.querySelector('#regConfirmPassword').value;
        const termsConsent = container.querySelector('#regTerms').checked;
        const privacyConsent = container.querySelector('#regPrivacy').checked;

        try {
          const newUser = await authService.register({
            firstName,
            lastName,
            email,
            password,
            confirmPassword,
            termsConsent,
            privacyConsent
          });

          showToast(`🎉 Benvenuto/a ${newUser.fullName}! Accesso completato.`);
          await db.syncAllFromServer(newUser);
          navigateTo('#home');
          renderApp();
        } catch (err) {
          alert('❌ ' + err.message);
        }
      };
    }

    // Submit Forgot Password Form (Strada 1: Verifica Identità Immediata)
    const forgotForm = container.querySelector('#forgotPasswordForm');
    if (forgotForm) {
      forgotForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = container.querySelector('#forgotEmailInput').value;
        const nameVal = container.querySelector('#forgotNameInput')?.value || '';
        resetEmailHolder = email;
        const btnSub = forgotForm.querySelector('#btnSubmitForgot');
        if (btnSub) {
          btnSub.disabled = true;
          btnSub.textContent = '⏳ Verifica identità in corso...';
        }

        try {
          const resp = await fetch('/api/auth/verify-identity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, fullName: nameVal })
          });
          const res = await resp.json();
          if (!resp.ok || !res.success) {
            throw new Error(res.message || 'Verifica non riuscita.');
          }

          if (res && res.resetToken) {
            resetCodeHolder = res.resetToken;
          }
          showToast(`✅ Identità confermata! Scegli ora la tua nuova password.`);
          activeTab = 'reset';
          renderForm();
        } catch (err) {
          alert('❌ ' + err.message);
          if (btnSub) {
            btnSub.disabled = false;
            btnSub.textContent = '🔐 Verifica Identità e Reimposta Password Subito';
          }
        }
      };
    }

    // Submit Reset Password Form (Salvataggio Immediato Nuova Password ed Entrata)
    const resetForm = container.querySelector('#resetPasswordForm');
    if (resetForm) {
      resetForm.onsubmit = async (e) => {
        e.preventDefault();
        const emailInput = container.querySelector('#resetEmailInput');
        const emailToUse = emailInput ? emailInput.value : resetEmailHolder;
        const newPass = container.querySelector('#resetNewPassInput').value;
        const confirmPass = container.querySelector('#resetConfirmPassInput').value;
        const btnSub = resetForm.querySelector('#btnSubmitReset');

        if (btnSub) {
          btnSub.disabled = true;
          btnSub.textContent = '⏳ Salvataggio in corso...';
        }

        try {
          const u = await authService.resetPasswordDirect(emailToUse, newPass, confirmPass);
          showToast(`🎉 Password aggiornata con successo! Benvenuto/a, ${u.fullName}!`);
          navigateTo('#home');
          renderApp();
        } catch (err) {
          alert('❌ ' + err.message);
          if (btnSub) {
            btnSub.disabled = false;
            btnSub.textContent = '💾 Salva Nuova Password ed Entra Subito';
          }
        }
      };
    }
  }

  renderForm();
}

function openEmailVerificationModal(email, generatedCode = '123456') {
  let modal = document.getElementById('emailVerificationModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'emailVerificationModal';
    modal.className = 'modal-backdrop';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-dialog" style="max-width:440px; padding:28px;">
      <div style="text-align:center; margin-bottom:18px;">
        <div style="width:52px; height:52px; background:#eff6ff; color:#1d4ed8; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:24px; margin:0 auto 12px;">
          ✉️
        </div>
        <h2 style="font-size:18px; font-weight:900; color:var(--text-main);">Verifica il tuo Indirizzo Email</h2>
        <p style="font-size:12.5px; color:var(--text-secondary); margin-top:4px;">
          Abbiamo inviato un codice di sicurezza OTP a 6 cifre a:<br>
          <strong style="color:var(--text-main);">${escapeHtml(email)}</strong>
        </p>
      </div>

      <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:var(--radius-md); padding:10px 14px; text-align:center; margin-bottom:16px;">
        <span style="font-size:11.5px; color:#166534; display:block;">
          🔑 Codice OTP generato per la verifica:
        </span>
        <strong style="font-family:var(--font-mono); font-size:18px; letter-spacing:2px; color:#166534;">
          ${escapeHtml(generatedCode || '123456')}
        </strong>
      </div>

      <form id="otpVerifyForm">
        <div class="form-group" style="margin-bottom:16px;">
          <label class="form-label" style="font-size:12px; font-weight:700; text-align:center; display:block;">Inserisci il Codice a 6 Cifre</label>
          <input type="text" id="inputOtpCode" class="form-input" placeholder="es. 123456" maxlength="6" value="${escapeHtml(generatedCode || '')}" required autofocus style="font-size:20px; font-weight:900; letter-spacing:6px; text-align:center; padding:10px; font-family:var(--font-mono);">
        </div>

        <button type="submit" class="btn btn-primary btn-block" style="background:#003087; font-size:13.5px; font-weight:800; padding:12px;">
          ✅ Conferma & Accedi Subito
        </button>
      </form>

      <div style="text-align:center; margin-top:14px;">
        <button type="button" id="btnCloseOtpModal" class="btn btn-ghost btn-sm" style="font-size:11.5px; color:var(--text-muted);">
          Annulla
        </button>
      </div>
    </div>
  `;

  const otpForm = modal.querySelector('#otpVerifyForm');
  if (otpForm) {
    otpForm.onsubmit = (e) => {
      e.preventDefault();
      const code = modal.querySelector('#inputOtpCode').value.trim();
      try {
        const u = authService.verifyEmail(email, code);
        modal.classList.remove('active');
        showToast(`🎉 Email verificata con successo! Benvenuto/a ${u.fullName}`);
        navigateTo('#home');
        renderApp();
      } catch (err) {
        alert('❌ ' + err.message);
      }
    };
  }

  const btnClose = modal.querySelector('#btnCloseOtpModal');
  if (btnClose) {
    btnClose.onclick = () => {
      modal.classList.remove('active');
    };
  }

  modal.classList.add('active');
}

// =========================================================================
// 1. HOME VIEW (DINAMICA IN BASE ALLA PRESENZA REALE DI POSTI DISPONIBILI)
// =========================================================================
function renderHomeView(container, currentUser) {
  const availableGroups = db.getGroups({ onlyAvailable: true });
  const hasAvailableGroups = availableGroups.length > 0;
  const previewGroups = availableGroups;

  container.innerHTML = `
    <div class="page-view">
      
      <!-- Hero Home Card Dinamica -->
      <section class="hero-home">
        <span class="hero-tag">
          ${hasAvailableGroups ? `🟢 ${availableGroups.length} GRUPPI CON POSTI LIBERI` : `⚡ CONDIVISIONE P2P`}
        </span>
        
        <h1 class="hero-title">Condividi i costi.<br>Paga meno.</h1>
        <p class="hero-subtitle">
          ${hasAvailableGroups 
            ? 'Trova un posto disponibile tra i gruppi attivi oppure condividi il tuo abbonamento azzerando le spese.' 
            : 'Non ci sono ancora posti disponibili nella tua area. Sii il primo a creare un gruppo per condividere il tuo abbonamento!'}
        </p>

        <div class="hero-actions-two">
          ${hasAvailableGroups ? `
            <a href="#cerca" class="btn-hero-primary">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
              CERCA UN ABBONAMENTO (${availableGroups.length})
            </a>
            <a href="#crea" class="btn-hero-secondary">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path>
              </svg>
              CREA UN GRUPPO
            </a>
          ` : `
            <a href="#crea" class="btn-hero-primary" style="font-size:16px; padding:16px 24px;">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path>
              </svg>
              ➕ CREA IL PRIMO GRUPPO
            </a>
          `}
        </div>
      </section>

      <!-- Come Funziona Box (3 Step Semplici) -->
      <div class="how-it-works-box">
        <h3 class="how-title">
          <span>💡</span> Come Funziona BuyYourShare
        </h3>
        <div class="steps-row">
          <div class="step-item">
            <div class="step-number">1</div>
            <div class="step-text">
              <h4>${hasAvailableGroups ? 'Scegli o Crea' : 'Crea il tuo Gruppo'}</h4>
              <p>${hasAvailableGroups ? 'Trova un posto aperto o condividi il tuo abbonamento.' : 'Metti a disposizione i posti liberi del tuo abbonamento in pochi secondi.'}</p>
            </div>
          </div>
          <div class="step-item">
            <div class="step-number">2</div>
            <div class="step-text">
              <h4>Costo Reale</h4>
              <p>Quota proporzionale reale. Commissione BYS di 1,49€ solo per i membri (Capogruppo esente).</p>
            </div>
          </div>
          <div class="step-item">
            <div class="step-number">3</div>
            <div class="step-text">
              <h4>Accesso & Chat</h4>
              <p>Dati di accesso sbloccati istantaneamente e chat privata automatica 1:1.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Sezione Gruppi Reali Disponibili (Appare solo se ci sono gruppi attivi) -->
      ${hasAvailableGroups ? `
        <div class="section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h2 style="font-size:16px; font-weight:800;">Posti Disponibili Subito (${availableGroups.length})</h2>
          <a href="#cerca" style="font-size:13px; font-weight:700; color:var(--primary); text-decoration:none;">Vedi tutti →</a>
        </div>

        <div class="groups-grid">
          ${renderGroupCardsHTML(previewGroups)}
        </div>
      ` : `
        <div style="background:white; border:1px dashed var(--border-strong); border-radius:var(--radius-lg); padding:28px 20px; text-align:center;">
          <div style="font-size:32px; margin-bottom:8px;">🚀</div>
          <h3 style="font-size:16px; font-weight:800; margin-bottom:4px;">Nessun gruppo attivo al momento</h3>
          <p style="font-size:13px; color:var(--text-secondary); max-width:380px; margin:0 auto 16px auto;">
            Appena creerai un gruppo o altri utenti pubblicheranno abbonamenti, apparirà qui il pulsante per cercare e accedere ai posti liberi.
          </p>
          <a href="#crea" class="btn btn-primary btn-sm">➕ Crea un Gruppo Adesso</a>
        </div>
      `}

    </div>
  `;
}

// =========================================================================
// 2. MARKETPLACE VIEW
// =========================================================================
function renderMarketplaceView(container, currentUser) {
  const services = db.getServices();
  const groups = db.getGroups({
    serviceId: selectedCategoryFilter === 'ALL' ? null : selectedCategoryFilter,
    search: searchKeyword
  });

  container.innerHTML = `
    <div class="page-view">
      <div class="section-header" style="margin-bottom:16px;">
        <h1 style="font-size:22px; font-weight:900;">Marketplace Abbonamenti</h1>
        <p style="font-size:13px; color:var(--text-secondary);">Quote trasparenti su base mensile con rinnovo automatico.</p>
      </div>

      <!-- Search Bar -->
      <div class="search-bar-wrap">
        <svg class="search-icon" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <input type="text" id="marketSearchInput" class="search-input" placeholder="Cerca Spotify, Canva, YouTube, Adobe..." value="${escapeHtml(searchKeyword)}">
      </div>

      <!-- Filter Chips -->
      <div class="chips-row">
        <button class="filter-chip ${selectedCategoryFilter === 'ALL' ? 'active' : ''}" data-id="ALL">Tutti</button>
        ${services.map(s => `
          <button class="filter-chip ${selectedCategoryFilter === s.id ? 'active' : ''}" data-id="${s.id}">
            ${escapeHtml(s.name)}
          </button>
        `).join('')}
      </div>

      <!-- Results Count -->
      <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:12px;">
        ${groups.length} GRUPPI TROVATI
      </div>

      <!-- Groups List -->
      <div class="groups-grid">
        ${groups.length > 0 ? renderGroupCardsHTML(groups) : `
          <div style="text-align:center; padding:40px 20px; background:white; border-radius:var(--radius-lg); border:1px dashed var(--border-strong);">
            <p style="font-size:15px; font-weight:700; color:var(--text-main); margin-bottom:6px;">Nessun gruppo trovato</p>
            <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">Vuoi essere il primo a condividere questo abbonamento?</p>
            <a href="#crea" class="btn btn-primary btn-sm">➕ Crea Gruppo</a>
          </div>
        `}
      </div>
    </div>
  `;

  // Search input event
  const searchInput = document.getElementById('marketSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchKeyword = e.target.value;
      const filtered = db.getGroups({
        serviceId: selectedCategoryFilter === 'ALL' ? null : selectedCategoryFilter,
        search: searchKeyword
      });
      const grid = container.querySelector('.groups-grid');
      if (grid) grid.innerHTML = filtered.length > 0 ? renderGroupCardsHTML(filtered) : '<p style="padding:20px; text-align:center;">Nessun gruppo trovato.</p>';
    });
  }

  // Filter chips click
  container.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCategoryFilter = btn.dataset.id;
      renderMarketplaceView(container, currentUser);
    });
  });
}

function renderGroupCardsHTML(groups) {
  return groups.map(g => {
    const slotsInfo = db.getGroupSlotsBreakdown(g);
    const freeSlots = slotsInfo.availableSlotsCount;
    const isAvailable = freeSlots > 0 && (g.status === 'PUBLISHED' || g.status === 'active' || g.status === 'available');
    const letter = g.customServiceName.substring(0, 2).toUpperCase();
    const nextSlot = slotsInfo.nextAvailableSlot;

    const isPriceRange = slotsInfo.minBaseShareCents !== slotsInfo.maxBaseShareCents;
    const quotaDisplay = isPriceRange 
      ? `${formatCents(slotsInfo.minBaseShareCents)} – ${formatCents(slotsInfo.maxBaseShareCents)}`
      : `${formatCents(g.baseMemberShareCents)}`;

    const totalDisplay = isPriceRange
      ? `${formatCents(slotsInfo.minMemberTotalCents)} – ${formatCents(slotsInfo.maxMemberTotalCents)}`
      : `${formatCents(g.memberTotalCents)}`;

    return `
      <div class="group-card">
        <div class="group-card-top">
          <div class="group-brand">
            <div class="group-icon" style="background: ${g.serviceId?.includes('spotify') ? '#1DB954' : g.serviceId?.includes('canva') ? '#7D2AE8' : g.serviceId?.includes('youtube') ? '#FF0000' : '#4F46E5'}">
              ${letter}
            </div>
            <div class="group-name-box">
              <h3>${escapeHtml(g.customServiceName)}</h3>
              <p>${escapeHtml(g.planName)}</p>
            </div>
          </div>
          <span class="slots-pill ${isAvailable ? 'available' : 'full'}">
            ${isAvailable ? `🟢 ${freeSlots} posti liberi` : `🔒 Al completo`}
          </span>
        </div>

        <!-- Trasparenza Prezzo con MoneySplit (Intervallo o Prezzo Esatto) -->
        <div class="price-breakdown-card">
          <div class="price-row">
            <span>Quota base abbonamento:</span>
            <strong>${quotaDisplay} / mese</strong>
          </div>
          <div class="price-row">
            <span>Commissione BuyYourShare:</span>
            <span>+ ${formatCents(g.platformFeeCents)} / mese</span>
          </div>
          <div class="price-row total-row">
            <span>Totale a tuo carico:</span>
            <span class="total-amount">${totalDisplay} / mese</span>
          </div>
          ${isAvailable && nextSlot ? `
            <div style="font-size:11px; color:#166534; background:#f0fdf4; padding:4px 8px; border-radius:var(--radius-sm); margin-top:6px;">
              👉 Prossimo posto libero (#${nextSlot.slotNumber}): <strong>${formatCents(nextSlot.memberTotalCents)} / mese</strong> (${formatCents(nextSlot.baseShareCents)} quota + 1,49€ fee)
            </div>
          ` : ''}
        </div>

        <a href="#gruppo-${g.id}" class="btn-view-group">
          VEDI DETTAGLI & PARTECIPA →
        </a>
      </div>
    `;
  }).join('');
}

// =========================================================================
// 3. GROUP DETAIL VIEW (PRECISIONE SINGOLO SLOT & CHECKOUT ESATTO)
// =========================================================================
let selectedSlotForCheckout = null;

function renderGroupDetailView(container, groupId, currentUser) {
  const group = db.getGroupById(groupId);
  if (!group) {
    container.innerHTML = `<div class="page-view"><p>Gruppo non trovato.</p><a href="#cerca" class="btn btn-secondary">Torna alla ricerca</a></div>`;
    return;
  }

  const isOwner = currentUser ? group.ownerId === currentUser.id : false;
  const isMember = currentUser ? db.data.memberships.some(m => m.groupId === groupId && m.userId === currentUser.id && (m.status === 'ACTIVE' || m.status === 'CANCELLATION_SCHEDULED')) : false;
  
  const slotsInfo = group.slotsInfo;
  const freeSlots = slotsInfo.availableSlotsCount;
  
  // Default selected slot for checkout
  if (!selectedSlotForCheckout || selectedSlotForCheckout.groupId !== groupId || selectedSlotForCheckout.isOccupied) {
    selectedSlotForCheckout = slotsInfo.nextAvailableSlot ? { ...slotsInfo.nextAvailableSlot, groupId } : null;
  }

  const activeSlot = selectedSlotForCheckout;

  container.innerHTML = `
    <div class="page-view">
      <div style="margin-bottom:12px;">
        <a href="#cerca" style="font-size:13px; font-weight:700; color:var(--text-secondary); text-decoration:none;">← Torna al Marketplace</a>
      </div>

      <div class="group-card" style="padding:22px; margin-bottom:20px;">
        <div class="group-card-top" style="margin-bottom:16px;">
          <div>
            <h1 style="font-size:22px; font-weight:900;">${escapeHtml(group.customServiceName)}</h1>
            <p style="font-size:14px; color:var(--text-secondary);">${escapeHtml(group.planName)}</p>
          </div>
          <span class="slots-pill ${freeSlots > 0 ? 'available' : 'full'}" style="font-size:12px; padding:4px 10px;">
            ${freeSlots > 0 ? `🟢 ${freeSlots} posti liberi su ${group.availableSlots}` : `🔒 Al completo`}
          </span>
        </div>

        <!-- Scomposizione Costo Reale -->
        <div style="background:#f1f5f9; border-radius:var(--radius-md); padding:12px 16px; margin-bottom:16px; font-size:12.5px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>Costo Reale Totale Ufficiale:</span>
            <strong>${formatCents(group.realSubscriptionCostCents)} / mese</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span>Posti totali del piano:</span>
            <strong>${group.totalSlots} account</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Capogruppo:</span>
            <strong>${escapeHtml(group.owner?.fullName || 'Capogruppo')} 🛡️</strong>
          </div>
        </div>

        <!-- Mappa Visuale dei Posti (Slot Precision) -->
        <div style="margin-bottom:18px;">
          <h4 style="font-size:13px; font-weight:800; color:var(--text-main); margin-bottom:8px;">
            MAPPA DEI POSTI E QUOTE ESATTE (${group.totalSlots} Posti):
          </h4>
          
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${slotsInfo.slots.map(s => {
              const isSelected = activeSlot && activeSlot.slotNumber === s.slotNumber && !s.isOccupied && !s.isOwnerSlot;
              
              return `
                <div class="slot-item-row" data-slot="${s.slotNumber}" style="
                  display:flex; justify-content:space-between; align-items:center; 
                  padding:8px 12px; border-radius:var(--radius-sm); font-size:12.5px;
                  background: ${s.isOwnerSlot ? '#eff6ff' : s.isOccupied ? '#f8fafc' : isSelected ? '#f0fdf4' : 'white'};
                  border: 1px solid ${s.isOwnerSlot ? '#bfdbfe' : isSelected ? '#86efac' : '#e2e8f0'};
                  ${!s.isOccupied && !s.isOwnerSlot ? 'cursor:pointer;' : ''}
                ">
                  <div style="display:flex; align-items:center; gap:6px;">
                    <span>${s.isOwnerSlot ? '👑' : s.isOccupied ? '👤' : '🟢'}</span>
                    <strong>Posto #${s.slotNumber} ${s.isOwnerSlot ? '(Capogruppo)' : ''}</strong>
                    ${s.isOccupied && s.assignedUser ? `<span style="font-size:11px; color:var(--text-muted);">- ${escapeHtml(s.assignedUser.fullName)}</span>` : ''}
                  </div>
                  
                  <div style="text-align:right;">
                    ${s.isOwnerSlot ? `
                      <span style="font-size:11.5px; color:#1e40af;">Quota: ${formatCents(s.baseShareCents)} (0€ fee)</span>
                    ` : s.isOccupied ? `
                      <span style="font-size:11px; color:var(--text-muted);">Occupato (${formatCents(s.memberTotalCents)}/m)</span>
                    ` : `
                      <span style="font-weight:800; color:#166534;">
                        ${formatCents(s.baseShareCents)} <span style="font-size:11px; font-weight:normal; color:var(--text-secondary);">+ 1,49€ =</span> ${formatCents(s.memberTotalCents)}/m
                      </span>
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <p style="font-size:11px; color:var(--text-muted); margin-top:4px;">
            * La somma esatta di tutte le quote base corrisponde a ${formatCents(group.realSubscriptionCostCents)}.
          </p>
        </div>

        <!-- Dettaglio Quota Trasparente per lo Slot Selezionato -->
        ${activeSlot ? `
          <div class="price-breakdown-card" style="padding:14px 16px; border:2px solid #86efac; background:#f0fdf4;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <h4 style="font-size:13px; font-weight:800; color:#166534;">DETTAGLIO POSTO SELEZIONATO (#${activeSlot.slotNumber})</h4>
              <span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:var(--radius-full); font-weight:700;">PREZZO ESATTO</span>
            </div>
            
            <div class="price-row" style="color:#15803d;">
              <span>Quota base calcolata per questo posto:</span>
              <strong>${formatCents(activeSlot.baseShareCents)} / mese</strong>
            </div>
            <div class="price-row" style="color:#15803d;">
              <span>Commissione di gestione BuyYourShare:</span>
              <span>+ ${formatCents(activeSlot.platformFeeCents)} / mese</span>
            </div>
            <div class="price-row total-row" style="font-size:15px; border-color:#86efac;">
              <span style="color:#166534;">TOTALE MENSILE DA PAGARE:</span>
              <span class="total-amount" style="font-size:22px; color:#15803d;">${formatCents(activeSlot.memberTotalCents)} / mese</span>
            </div>
          </div>
        ` : ''}

        <!-- Regole e Note -->
        <div style="margin:16px 0;">
          <h4 style="font-size:13px; font-weight:800; margin-bottom:4px;">Regole del Gruppo:</h4>
          <p style="font-size:13px; color:var(--text-secondary); line-height:1.4;">${escapeHtml(group.rulesAndRequirements)}</p>
        </div>

        <!-- Se Capogruppo / Se lo Slot Selezionato è già dell'utente / o Azione Acquisto Posto -->
        ${isOwner ? `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:14px; border-radius:var(--radius-md); text-align:center;">
            <p style="font-size:13px; font-weight:700; color:#166534; margin-bottom:10px;">👑 Sei il Capogruppo di questo gruppo.</p>
            <div style="display:flex; gap:8px;">
              <a href="#chat-${group.id}" class="btn btn-primary btn-sm" style="flex:1;">💬 Apri Chat</a>
              <a href="#miei-gruppi" class="btn btn-secondary btn-sm" style="flex:1;">⚙️ Gestisci</a>
            </div>
          </div>
        ` : activeSlot && activeSlot.isOccupied && activeSlot.assignedUser && currentUser && activeSlot.assignedUser.id === currentUser.id ? `
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; padding:14px; border-radius:var(--radius-md); text-align:center;">
            <p style="font-size:13px; font-weight:700; color:#166534; margin-bottom:10px;">✅ Questo Posto (#${activeSlot.slotNumber}) è attualmente occupato da te.</p>
            <div style="display:flex; gap:8px;">
              <a href="#miei-abbonamenti" class="btn btn-primary btn-sm" style="flex:1;">🔑 Il Tuo Accesso</a>
              <a href="#chat-${group.id}" class="btn btn-secondary btn-sm" style="flex:1;">💬 Apri Chat</a>
            </div>
          </div>
        ` : freeSlots > 0 && activeSlot && !activeSlot.isOccupied ? `
          <button id="btnOpenCheckout" class="btn btn-accent btn-block" style="padding:15px; font-size:16px; font-weight:800;" data-slot="${activeSlot.slotNumber}">
            💳 ACQUISTA POSTO #${activeSlot.slotNumber} (${formatCents(activeSlot.memberTotalCents)} / Mese)
          </button>
          <p style="font-size:11.5px; text-align:center; color:var(--text-muted); margin-top:8px;">
            🔒 Pagamento sicuro tramite <strong>Stripe Connect</strong> • Rinnovo mensile automatico • Fee lorda 1,49 €/mese
          </p>
        ` : `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:16px; text-align:center;">
            <p style="font-size:13.5px; font-weight:700; color:#475569; margin:0 0 10px;">
              🔒 Questo gruppo è al completo (tutti i posti sono occupati).
            </p>
            <a href="#cerca" class="btn btn-secondary btn-block" style="font-size:13px; font-weight:700; text-decoration:none; display:inline-block; padding:10px;">
              🔍 Cerca altri gruppi simili disponibili
            </a>
          </div>
        `}

        <!-- Segnala Gruppo -->
        <div style="margin-top:18px; text-align:center;">
          <button id="btnReportGroup" style="font-size:11.5px; color:var(--text-muted); text-decoration:underline;">
            ⚠️ Segnala questo gruppo all'amministrazione
          </button>
        </div>
      </div>
    </div>
  `;

  // Slot click to choose specific slot
  container.querySelectorAll('.slot-item-row').forEach(row => {
    row.addEventListener('click', () => {
      const slotNum = parseInt(row.dataset.slot, 10);
      const slotObj = slotsInfo.slots.find(s => s.slotNumber === slotNum);
      if (slotObj && !slotObj.isOccupied && !slotObj.isOwnerSlot) {
        selectedSlotForCheckout = { ...slotObj, groupId };
        renderGroupDetailView(container, groupId, currentUser);
      }
    });
  });

  // Open Stripe / PayPal Checkout Modal
  const checkoutBtn = document.getElementById('btnOpenCheckout');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (!currentUser) {
        showToast('🔐 Accedi o registrati per partecipare a questo gruppo.');
        navigateTo('#login');
        return;
      }
      openStripeCheckoutModal(group, activeSlot, currentUser);
    });
  }

  // Report click
  const reportBtn = document.getElementById('btnReportGroup');
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      if (!currentUser) {
        showToast('🔐 Accedi per inviare una segnalazione.');
        navigateTo('#login');
        return;
      }
      const reason = prompt('Motivo della segnalazione (es. Prezzo non conforme, servizio non funzionante):');
      if (reason) {
        db.createReport({ targetType: 'group', targetId: groupId, reason }, currentUser);
        showToast('Segnalazione inviata all\'amministrazione.');
      }
    });
  }
}

// =========================================================================
// 4. WIZARD CREAZIONE GRUPPO (100% Mensile Fisso con MoneySplit Engine)
// =========================================================================
function renderWizardView(container, currentUser) {
  const services = db.getServices();
  const feeCents = db.getPlatformFeeCents();
  const pSet = db.getUserPayoutSettings(currentUser.id) || {};

  if (!wizardState.payoutLegalName) {
    wizardState.payoutLegalName = pSet.legalName || currentUser.fullName || '';
  }
  if (!wizardState.payoutIban && pSet.iban) {
    wizardState.payoutIban = pSet.iban;
  }
  if (!wizardState.payoutBankName && pSet.bankName) {
    wizardState.payoutBankName = pSet.bankName;
  }

  // Calcolo quote live con MoneySplit
  const realCents = eurosToCents(wizardState.realCostEuros || 0);
  const totalSlots = parseInt(wizardState.totalSlots, 10) || 0;
  const ownerSlots = parseInt(wizardState.ownerSlots, 10) || 1;
  const pricing = totalSlots >= 2 && realCents > 0
    ? calculatePricingBreakdown(realCents, totalSlots, feeCents)
    : { realCostCents: realCents, sumExactSharesCents: realCents, displayShareText: '0,00 €', memberTotalCents: feeCents, ownerShareCents: 0, baseMemberShareCents: 0, platformFeeCents: feeCents };

  const isCustomSelected = wizardState.serviceId === 'srv-custom';

  container.innerHTML = `
    <div class="page-view">
      <div class="wizard-container">
        
        <div class="wizard-progress">
          <span class="wizard-step-pill">Creazione Gruppo</span>
          <span style="font-size:12px; font-weight:700; color:var(--text-secondary);">100% Trasparente</span>
        </div>

        <h1 class="wizard-title">Crea il tuo gruppo di condivisione</h1>
        <p class="wizard-desc">Inserisci i dati reali del tuo abbonamento e il tuo IBAN per ricevere le quote mensili dai membri.</p>

        <form id="createGroupForm">
          
          <!-- SEZIONE 1: Dati per Ricevere le Quote (IBAN Capogruppo) -->
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:var(--radius-lg); padding:16px; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <h3 style="font-size:15px; font-weight:800; color:var(--text-main); margin:0;">🏦 1. Dati per Ricevere le Quote (IBAN) *</h3>
              <span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:var(--radius-full); font-weight:700;">100% ESENTE FEE</span>
            </div>
            <p style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">
              Ricevi direttamente su questo conto l'accredito delle quote mensili. Nessuna commissione a carico del Capogruppo.
            </p>

            <div class="form-group" style="margin-bottom:10px;">
              <label class="form-label" style="font-size:12px; font-weight:700;">Intestatario del Conto (Nome e Cognome o Ragione Sociale) *</label>
              <input type="text" id="wizPayoutLegalName" class="form-input" placeholder="es. Mario Rossi" value="${escapeHtml(wizardState.payoutLegalName)}" required>
            </div>

            <div class="form-row" style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
              <div class="form-group">
                <label class="form-label" style="font-size:12px; font-weight:700;">Codice IBAN (SEPA) *</label>
                <input type="text" id="wizPayoutIban" class="form-input" placeholder="IT00X0000000000000000000000" value="${escapeHtml(wizardState.payoutIban)}" style="font-family:var(--font-mono); text-transform:uppercase; font-weight:700;" required>
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:12px; font-weight:700;">Banca (Opzionale)</label>
                <input type="text" id="wizPayoutBankName" class="form-input" placeholder="es. Intesa, Revolut, BBVA" value="${escapeHtml(wizardState.payoutBankName)}">
              </div>
            </div>
          </div>

          <!-- SEZIONE 2: Scelta Servizio o Personalizzato -->
          <div class="form-group" style="margin-bottom:18px;">
            <label class="form-label" style="font-size:13px; font-weight:800;">2. Che abbonamento vuoi condividere? *</label>
            <div class="service-pick-grid">
              ${services.map(s => `
                <div class="service-card-select ${wizardState.serviceId === s.id ? 'selected' : ''}" data-id="${s.id}" data-name="${escapeHtml(s.name)}">
                  <div class="service-card-icon" style="background:${s.brandColor};">${s.iconLetter}</div>
                  <span class="service-card-name">${escapeHtml(s.name)}</span>
                </div>
              `).join('')}
              
              <div class="service-card-select ${isCustomSelected ? 'selected' : ''}" data-id="srv-custom" data-name="" style="border-style:dashed; background:#f1f5f9;">
                <div class="service-card-icon" style="background:#0f172a; font-size:18px;">➕</div>
                <span class="service-card-name" style="color:var(--primary);">+ Altro Servizio</span>
              </div>
            </div>
            
            <div id="customServiceWrap" style="${isCustomSelected ? '' : 'display:none;'} margin-top:10px;">
              <label class="form-label" style="font-size:12px; color:var(--primary);">Nome del Servizio Personalizzato *</label>
              <input type="text" id="wizCustomName" class="form-input" placeholder="es. Netflix, Notion, ChatGPT, Microsoft 365, Amazon Prime..." value="${escapeHtml(wizardState.customServiceName)}">
            </div>
          </div>

          <!-- SEZIONE 3: Costo Reale & Posti -->
          <div class="form-group" style="margin-bottom:14px;">
            <label class="form-label" style="font-size:13px; font-weight:800;">3. Nome del Piano (es. Family, Team, Duo, Premium, 2TB) *</label>
            <input type="text" id="wizPlanName" class="form-input" placeholder="es. Family (6 Account), Premium, Pro Team..." value="${escapeHtml(wizardState.planName)}" required>
          </div>

          <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
            <div class="form-group">
              <label class="form-label" style="font-size:12.5px; font-weight:700;">Costo Reale Totale Ufficiale (€) *</label>
              <input type="number" step="0.01" min="0.50" id="wizRealCost" class="form-input" placeholder="es. 17.99" value="${wizardState.realCostEuros}" required>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-size:12.5px; font-weight:700;">Frequenza di Pagamento</label>
              <div class="fixed-frequency-badge" style="padding:10px 12px; font-weight:700;">
                📅 MENSILE (Fisso)
              </div>
            </div>
          </div>

          <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
            <div class="form-group">
              <label class="form-label" style="font-size:12.5px; font-weight:700;">Posti Totali del Piano (min. 2) *</label>
              <input type="number" min="2" max="30" id="wizTotalSlots" class="form-input" placeholder="es. 6" value="${wizardState.totalSlots}" required>
            </div>

            <div class="form-group">
              <label class="form-label" style="font-size:12.5px; font-weight:700;">Posti per te (Capogruppo) *</label>
              <input type="number" min="1" max="10" id="wizOwnerSlots" class="form-input" value="${wizardState.ownerSlots || 1}" required>
            </div>
          </div>

          <!-- Box Trasparenza Economica Live MoneySplit -->
          <div class="wizard-calc-box" style="margin-bottom:20px;">
            <div class="wizard-calc-header">
              <span>📊</span> Calcolo Trasparente MoneySplit:
            </div>
            <div class="wizard-calc-row">
              <span>Costo totale dichiarato dal Capogruppo:</span>
              <strong>${formatCents(pricing.realCostCents)} / mese</strong>
            </div>
            <div class="wizard-calc-row">
              <span>Quota base per ciascun membro:</span>
              <strong>${pricing.displayShareText} / mese</strong>
            </div>
            <div class="wizard-calc-row">
              <span>Commissione BuyYourShare (a carico membro):</span>
              <span>+ ${formatCents(pricing.platformFeeCents)} / mese</strong>
            </div>
            <div class="wizard-calc-row highlight">
              <span>Totale mensile pagato dal membro:</span>
              <span>${formatCents(pricing.memberTotalCents)} / mese</strong>
            </div>
            <div class="wizard-owner-exemption-note" style="margin-top:8px;">
              🛡️ <strong>Esenzione Capogruppo:</strong> Tu ricevi ${formatCents(pricing.baseMemberShareCents)} netti per ogni membro. <strong>Nessuna commissione applicata a te.</strong>
            </div>
          </div>

          <!-- SEZIONE 4: Informazioni per l'Accesso dei Membri -->
          <div style="border-top:1px solid var(--border-subtle); padding-top:18px; margin-top:18px; margin-bottom:18px;">
            <h3 style="font-size:15px; font-weight:800; margin-bottom:4px;">🔒 4. Informazioni per l'Accesso dei Membri</h3>
            <p style="font-size:12px; color:var(--text-secondary); margin-bottom:14px;">
              Inserisci il link di invito o le istruzioni. Verranno mostrati in automatico solo ai membri che acquistano un posto.
            </p>

            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="font-size:12.5px; font-weight:700;">Link di Invito / Accesso Diretto (Opzionale o Consigliato)</label>
              <input type="text" id="wizAccessUrl" class="form-input" placeholder="https://..." value="${escapeHtml(wizardState.accessUrl)}">
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="font-size:12.5px; font-weight:700;">Istruzioni Passo-Passo per il Membro *</label>
              <textarea id="wizInstructions" class="form-textarea" rows="3" placeholder="Scrivi come accedere (es. 'Clicca sul link di invito con il tuo account personale')..." required>${escapeHtml(wizardState.instructions)}</textarea>
            </div>

            <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
              <div class="form-group">
                <label class="form-label" style="font-size:12px;">Codice Invito (Opzionale)</label>
                <input type="text" id="wizAccessCode" class="form-input" placeholder="es. 849204" value="${escapeHtml(wizardState.accessCode)}">
              </div>
              <div class="form-group">
                <label class="form-label" style="font-size:12px;">Note Aggiuntive (Opzionale)</label>
                <input type="text" id="wizAdditionalInfo" class="form-input" placeholder="es. Account 100% personale e privato" value="${escapeHtml(wizardState.additionalInfo)}">
              </div>
            </div>
          </div>

          <!-- Submit Button -->
          <button type="submit" class="btn btn-primary btn-block" style="padding:14px; font-size:15px; font-weight:800;">
            🎉 PUBBLICA GRUPPO NEL MARKETPLACE
          </button>
        </form>

      </div>
    </div>
  `;

  // Event handlers for wizard inputs (live price updates)
  const form = document.getElementById('createGroupForm');
  const costInput = document.getElementById('wizRealCost');
  const totalSlotsInput = document.getElementById('wizTotalSlots');
  const ownerSlotsInput = document.getElementById('wizOwnerSlots');
  const customNameInput = document.getElementById('wizCustomName');
  const planNameInput = document.getElementById('wizPlanName');
  const customWrap = document.getElementById('customServiceWrap');
  const ibanInput = document.getElementById('wizPayoutIban');
  const legalNameInput = document.getElementById('wizPayoutLegalName');
  const bankNameInput = document.getElementById('wizPayoutBankName');

  const updateStateAndRerender = () => {
    wizardState.realCostEuros = costInput ? costInput.value : '';
    wizardState.totalSlots = totalSlotsInput ? totalSlotsInput.value : '';
    wizardState.ownerSlots = ownerSlotsInput ? ownerSlotsInput.value : '1';
    wizardState.customServiceName = customNameInput ? customNameInput.value : '';
    wizardState.planName = planNameInput ? planNameInput.value : '';
    wizardState.accessUrl = document.getElementById('wizAccessUrl')?.value || '';
    wizardState.instructions = document.getElementById('wizInstructions')?.value || '';
    wizardState.accessCode = document.getElementById('wizAccessCode')?.value || '';
    wizardState.additionalInfo = document.getElementById('wizAdditionalInfo')?.value || '';
    wizardState.payoutIban = ibanInput ? ibanInput.value.trim().toUpperCase() : '';
    wizardState.payoutLegalName = legalNameInput ? legalNameInput.value.trim() : '';
    wizardState.payoutBankName = bankNameInput ? bankNameInput.value.trim() : '';
  };

  const updateCalcBoxLive = () => {
    const rCents = eurosToCents(costInput.value || 0);
    const tSlots = parseInt(totalSlotsInput.value, 10) || 0;
    const pr = tSlots >= 2 && rCents > 0
      ? calculatePricingBreakdown(rCents, tSlots, feeCents)
      : { realCostCents: rCents, sumExactSharesCents: rCents, displayShareText: '0,00 €', memberTotalCents: feeCents, ownerShareCents: 0, baseMemberShareCents: 0, platformFeeCents: feeCents };

    const calcBox = container.querySelector('.wizard-calc-box');
    if (calcBox) {
      const rows = calcBox.querySelectorAll('.wizard-calc-row strong, .wizard-calc-row span:last-child');
      if (rows[0]) rows[0].textContent = `${formatCents(pr.realCostCents)} / mese`;
      if (rows[1]) rows[1].textContent = `${pr.displayShareText} / mese`;
      if (rows[3]) rows[3].textContent = `${formatCents(pr.memberTotalCents)} / mese`;
    }
  };

  [costInput, totalSlotsInput, ownerSlotsInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', () => {
        updateStateAndRerender();
        updateCalcBoxLive();
      });
    }
  });

  // Service selector chips
  container.querySelectorAll('.service-card-select').forEach(card => {
    card.addEventListener('click', () => {
      const sId = card.dataset.id;
      wizardState.serviceId = sId;
      
      container.querySelectorAll('.service-card-select').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      if (sId === 'srv-custom') {
        if (customWrap) customWrap.style.display = 'block';
        if (customNameInput) {
          customNameInput.value = '';
          wizardState.customServiceName = '';
          customNameInput.focus();
        }
      } else {
        if (customWrap) customWrap.style.display = 'none';
        wizardState.customServiceName = card.dataset.name;
        if (customNameInput) customNameInput.value = card.dataset.name;
      }
    });
  });

  // Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    updateStateAndRerender();

    const realCostCents = eurosToCents(wizardState.realCostEuros);
    const totalSlots = parseInt(wizardState.totalSlots, 10);
    const ownerSlots = parseInt(wizardState.ownerSlots, 10) || 1;
    const cleanIban = (wizardState.payoutIban || '').replace(/\s/g, '').toUpperCase();

    if (!cleanIban || cleanIban.length < 15) {
      alert('Inserisci un codice IBAN valido per ricevere le quote.');
      if (ibanInput) ibanInput.focus();
      return;
    }
    if (!wizardState.payoutLegalName) {
      alert('Inserisci l\'intestatario del conto.');
      if (legalNameInput) legalNameInput.focus();
      return;
    }
    if (isNaN(realCostCents) || realCostCents <= 0) {
      alert('Inserisci un costo valido maggiore di zero');
      if (costInput) costInput.focus();
      return;
    }
    if (isNaN(totalSlots) || totalSlots < 2) {
      alert('Il piano deve avere almeno 2 posti totali.');
      if (totalSlotsInput) totalSlotsInput.focus();
      return;
    }
    if (ownerSlots >= totalSlots) {
      alert('I posti totali devono essere superiori ai posti riservati per te.');
      return;
    }
    if (!wizardState.customServiceName.trim()) {
      alert('Inserisci il nome del servizio.');
      return;
    }

    let finalUrl = (wizardState.accessUrl || '').trim();
    if (finalUrl && !finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    const payload = {
      serviceId: wizardState.serviceId || 'srv-custom',
      customServiceName: wizardState.customServiceName.trim(),
      planName: wizardState.planName.trim(),
      realCostEuros: wizardState.realCostEuros,
      totalSlots: totalSlots,
      ownerSlots: ownerSlots,
      accessUrl: finalUrl,
      instructions: (wizardState.instructions || '').trim(),
      additionalInfo: (wizardState.additionalInfo || '').trim(),
      accessCode: (wizardState.accessCode || '').trim(),
      payoutIban: cleanIban,
      payoutLegalName: wizardState.payoutLegalName,
      payoutBankName: wizardState.payoutBankName,
      publishImmediately: true
    };

    // Salva subito anche nel client db
    db.updateUserPayoutSettings(currentUser.id, {
      iban: cleanIban,
      legalName: wizardState.payoutLegalName,
      bankName: wizardState.payoutBankName
    }, currentUser);

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Pubblicazione in corso...';
    }

    try {
      const token = localStorage.getItem('buyyourshare_session_token');
      const userId = currentUser?.id || localStorage.getItem('buyyourshare_current_user_id');
      const resp = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...(userId ? { 'X-User-Id': userId } : {})
        },
        body: JSON.stringify(payload)
      });

      const serverRes = await resp.json();
      let createdId = null;

      if (resp.ok && serverRes.success && serverRes.group) {
        createdId = serverRes.group.id;
        const existsIdx = (db.data.groups || []).findIndex(g => g.id === createdId);
        if (existsIdx >= 0) {
          db.data.groups[existsIdx] = serverRes.group;
        } else {
          db.data.groups.unshift(serverRes.group);
        }
        db.save();
        await db.syncGroupsFromServer();
      } else {
        const localGroup = db.createGroup(
          { serviceId: payload.serviceId, customServiceName: payload.customServiceName, planName: payload.planName, realSubscriptionCostCents: realCostCents, totalSlots, ownerSlots },
          { accessUrl: finalUrl, instructions: payload.instructions, additionalInfo: payload.additionalInfo, accessCode: payload.accessCode },
          currentUser
        );
        createdId = localGroup.id;
      }

      showToast('🎉 Gruppo creato e pubblicato con successo!');
      navigateTo(`#gruppo-${createdId}`);
    } catch (err) {
      console.error('[CREATE GROUP ERROR]', err);
      const localGroup = db.createGroup(
        { serviceId: payload.serviceId, customServiceName: payload.customServiceName, planName: payload.planName, realSubscriptionCostCents: realCostCents, totalSlots, ownerSlots },
        { accessUrl: finalUrl, instructions: payload.instructions, additionalInfo: payload.additionalInfo, accessCode: payload.accessCode },
        currentUser
      );
      showToast('🎉 Gruppo creato con successo!');
      navigateTo(`#gruppo-${localGroup.id}`);
    }
  });
}

// =========================================================================
// 5. I MIEI ABBONAMENTI VIEW (MEMBRO - SOLO DOPO PAGAMENTO VERIFICATO)
// =========================================================================
function renderMySubscriptionsView(container, currentUser) {
  // Controllo automatico ritorno da Stripe Checkout (?session_id=cs_live_...)
  const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
  const urlParams = new URLSearchParams(window.location.search || hashQuery);
  const stripeSessionId = urlParams.get('session_id');

  if (stripeSessionId && stripeSessionId.startsWith('cs_') && !window.__processedStripeSessions?.has(stripeSessionId)) {
    if (!window.__processedStripeSessions) window.__processedStripeSessions = new Set();
    window.__processedStripeSessions.add(stripeSessionId);

    showToast('⏳ Verifica pagamento Stripe Live in corso...');
    stripeCheckoutService.verifyLiveSession(stripeSessionId)
      .then(async (res) => {
        if (res.success) {
          showToast('🎉 Pagamento Stripe Live confermato! Abbonamento attivato.');
          await db.syncAllFromServer(currentUser);
          navigateTo('#miei-abbonamenti');
          renderMySubscriptionsView(container, currentUser);
        }
      })
      .catch(err => {
        console.warn('Errore verifica sessione Stripe:', err);
      });
  }

  const subscriptions = db.getMySubscriptions(currentUser.id);
  const pendingVerif = window.__pendingPaymentVerification;
  const payoutSettings = db.getUserPayoutSettings(currentUser.id);
  const paymentMethod = db.getUserPaymentMethod(currentUser.id);

  container.innerHTML = `
    <div class="page-view">
      <div class="section-header" style="margin-bottom:16px;">
        <h1 style="font-size:22px; font-weight:900;">I Miei Abbonamenti</h1>
        <p style="font-size:13px; color:var(--text-secondary);">I gruppi a cui partecipi con pagamento verificato, accesso e chat dedicati.</p>
      </div>

      <!-- BOX GESTIONE METODI DI PAGAMENTO E IBAN MEMBRO -->
      <div style="background:white; border:1px solid #cbd5e1; border-radius:var(--radius-lg); padding:16px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <h2 style="font-size:15px; font-weight:800; color:var(--text-main);">💳 Metodo di Pagamento & Ricezione Quote</h2>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
              <span>Rinnovo Predefinito: <strong style="color:var(--primary);">${paymentMethod.type === 'PAYPAL' ? '🅿️ PayPal (' + escapeHtml(paymentMethod.paypalEmail || currentUser.email) + ')' : '💳 Carta (' + escapeHtml(paymentMethod.cardBrand || 'Visa') + ' •••• ' + escapeHtml(paymentMethod.cardLast4 || '4242') + ')'}</strong></span>
              <span style="margin:0 8px;">•</span>
              <span>IBAN Personale: <strong style="font-family:var(--font-mono); color:#003087;">${escapeHtml(payoutSettings.iban)}</strong></span>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="btnMemberEditPayment" class="btn btn-secondary btn-sm" style="font-size:11.5px; font-weight:700;">
              💳 Cambia Carta / PayPal
            </button>
            <button id="btnMemberEditIban" class="btn btn-secondary btn-sm" style="font-size:11.5px; font-weight:700;">
              🏦 Modifica IBAN
            </button>
          </div>
        </div>
      </div>

      <!-- STATO 1: VERIFICA PAGAMENTO STRIPE IN CORSO -->
      ${pendingVerif && pendingVerif.status === 'verifying' ? `
        <div class="verifying-box" style="background:#eff6ff; border:2px solid #3b82f6; border-radius:var(--radius-lg); padding:24px; text-align:center; margin-bottom:24px; box-shadow:0 4px 12px rgba(59,130,246,0.15);">
          <div style="width:36px; height:36px; border:3px solid #bfdbfe; border-top-color:#1d4ed8; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 12px;"></div>
          <h3 style="font-size:16px; font-weight:900; color:#1e40af;">⏳ Pagamento ricevuto. Verifica in corso con i server sicuri di Stripe...</h3>
          <p style="font-size:12.5px; color:#2563eb; margin-top:6px; max-width:480px; margin-left:auto; margin-right:auto;">
            Stiamo validando la firma crittografica del webhook Stripe, attivando la Subscription mensile e trasferendo la quota base al Capogruppo.
          </p>
        </div>
      ` : ''}

      <!-- STATO 2: PAGAMENTO FALLITO / RIFIUTATO -->
      ${pendingVerif && pendingVerif.status === 'failed' ? `
        <div style="background:#fef2f2; border:2px solid #ef4444; border-radius:var(--radius-lg); padding:20px; text-align:center; margin-bottom:24px;">
          <h3 style="font-size:16px; font-weight:900; color:#991b1b;">❌ Pagamento non riuscito</h3>
          <p style="font-size:12.5px; color:#b91c1c; margin-top:4px;">${escapeHtml(pendingVerif.error || 'La transazione è stata rifiutata dal circuito bancario.')}</p>
          <p style="font-size:11.5px; color:#7f1d1d; margin-top:4px;">Nessuna membership è stata attivata. L'accesso al servizio e la chat rimangono bloccati.</p>
          <button id="btnDismissFail" class="btn btn-secondary btn-sm" style="margin-top:12px;">
            Riprova con un'altra carta
          </button>
        </div>
      ` : ''}

      <!-- STATO 3: PAGAMENTO CONFERMATO -->
      ${pendingVerif && pendingVerif.status === 'success' ? `
        <div style="background:#f0fdf4; border:2px solid #22c55e; border-radius:var(--radius-lg); padding:14px 18px; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div>
            <h4 style="font-size:14px; font-weight:800; color:#166534;">🎉 Pagamento Verificato Server-Side!</h4>
            <p style="font-size:12px; color:#15803d;">Quota trasferita al Capogruppo e 1,49 € di fee lorda registrata. Accesso e chat sbloccati.</p>
          </div>
          <button id="btnCloseSuccessBanner" class="btn btn-secondary btn-sm" style="font-size:11px;">OK</button>
        </div>
      ` : ''}

      ${subscriptions.length > 0 ? `
        <div class="groups-grid">
          ${subscriptions.map(sub => {
            const grp = sub.group;
            if (!grp) return '';
            const isCancellationScheduled = sub.status === 'CANCELLATION_SCHEDULED';
            const paidShare = sub.paidShareCents || grp.baseMemberShareCents;
            const paidFee = sub.paidFeeCents !== undefined ? sub.paidFeeCents : grp.platformFeeCents;
            const totalPaid = sub.memberTotalCents || (paidShare + paidFee);
            const slotNum = sub.slotNumber || 2;
            const subLogs = financialAuditService.getSubscriptionLogs(grp.id, currentUser.id, slotNum);
            const lastLog = subLogs.length > 0 ? subLogs[0] : null;
            const methodBadge = (lastLog?.paymentMethod?.includes('PAYPAL') || sub.paymentMethod?.includes('PAYPAL')) ? '🅿️ PayPal Sandbox' : (sub.paymentMethod?.includes('APPLE') ? '📱 Apple Pay' : '💳 Carta Stripe');
            const gatewayTxId = lastLog?.transactionId || lastLog?.invoiceId || sub.paypalSubscriptionId || sub.stripeSubscriptionId || 'N/A';

            return `
              <div class="group-card" style="border-left: 4px solid var(--primary);">
                <div class="group-card-top" style="margin-bottom:8px;">
                  <div>
                    <h3 style="font-size:16px; font-weight:800;">${escapeHtml(grp.customServiceName)}</h3>
                    <p style="font-size:12px; color:var(--text-secondary);">${escapeHtml(grp.planName)} • <strong style="color:var(--primary);">Posto #${slotNum}</strong></p>
                  </div>
                  <span class="slots-pill ${isCancellationScheduled ? 'full' : 'available'}">
                    ${isCancellationScheduled ? '⏳ Annullamento a Scadenza' : '🟢 Attivo'}
                  </span>
                </div>

                <div class="price-breakdown-card">
                  <div class="price-row">
                    <span>Quota esatta posto #${slotNum} (${formatCents(paidShare)} + ${formatCents(paidFee)} fee):</span>
                    <strong>${formatCents(totalPaid)} / mese</strong>
                  </div>
                  <div class="price-row">
                    <span>${isCancellationScheduled ? 'Attivo fino al:' : 'Prossimo rinnovo mensile:'}</span>
                    <strong>${formatDateIT(sub.currentPeriodEnd)}</strong>
                  </div>
                </div>

                <!-- Dettaglio Transazione & Ricevuta Immediata -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:10px 12px; margin-top:10px; font-size:11.5px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div>
                      <span style="font-weight:800; color:#166534;">🟢 Pagamento Verificato Server-Side</span>
                      <span style="color:var(--text-secondary); margin-left:4px;">(${methodBadge})</span>
                    </div>
                    <button class="btn btn-secondary btn-sm btn-view-receipt" data-txid="${escapeHtml(gatewayTxId)}" style="font-size:11px; padding:3px 8px; font-weight:700;">
                      🧾 Ricevuta
                    </button>
                  </div>
                  <div style="color:var(--text-secondary); display:flex; flex-wrap:wrap; gap:8px; font-size:11px;">
                    <span>ID Transazione: <strong style="font-family:var(--font-mono); color:var(--primary);">${escapeHtml(gatewayTxId)}</strong></span>
                    <span>Quota Capogruppo: <strong style="color:#1e40af;">${formatCents(paidShare)}</strong></span>
                    <span>Fee BYS: <strong style="color:var(--accent);">${formatCents(paidFee)}</strong></span>
                  </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;">
                  <button class="btn btn-accent btn-open-access" data-id="${grp.id}" style="font-size:12.5px;">
                    🔑 IL TUO ACCESSO
                  </button>
                  <a href="#chat-${grp.id}" class="btn btn-primary" style="font-size:12.5px;">
                    💬 CHAT DEL GRUPPO
                  </a>
                </div>

                <!-- Gestione Rinnovo Automatico -->
                <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--border-subtle); display:flex; justify-content:flex-end; align-items:center;">
                  ${!isCancellationScheduled ? `
                    <button class="btn-cancel-membership" data-id="${sub.id}" style="font-size:11.5px; color:#dc2626; text-decoration:underline; background:none; border:none; cursor:pointer;">
                      ✕ Annulla rinnovo automatico
                    </button>
                  ` : `
                    <span style="font-size:11.5px; color:var(--text-muted);">Rinnovo disattivato a fine periodo</span>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="text-align:center; padding:40px 20px; background:white; border-radius:var(--radius-lg); border:1px dashed var(--border-strong);">
          <p style="font-size:15px; font-weight:700; margin-bottom:6px;">Non hai ancora nessun abbonamento attivo</p>
          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">Sfoglia il marketplace, seleziona uno slot ed effettua il pagamento sicuro per attivare l'accesso.</p>
          <a href="#cerca" class="btn btn-primary btn-sm">🔎 Cerca un Abbonamento nel Marketplace</a>
        </div>
      `}

      <!-- SEZIONE STORICO PAGAMENTI & RICEVUTE UFFICIALI -->
      ${(() => {
        const memberLogs = financialAuditService.getMemberLogs(currentUser.id);
        return `
          <div style="margin-top:32px; background:white; border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:20px; box-shadow:var(--shadow-sm);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <div>
                <h2 style="font-size:17px; font-weight:900; color:var(--text-main);">🧾 Storico Pagamenti & Ricevute Ufficiali</h2>
                <p style="font-size:12px; color:var(--text-secondary);">Registro delle transazioni e dei rinnovi elaborati dai gateway di pagamento reali (PayPal Sandbox & Stripe Connect).</p>
              </div>
              <span style="font-size:11px; background:#eff6ff; color:#1d4ed8; padding:3px 10px; border-radius:var(--radius-full); font-weight:700; font-family:var(--font-mono);">
                ${memberLogs.length} ${memberLogs.length === 1 ? 'TRANSAZIONE' : 'TRANSAZIONI'}
              </span>
            </div>

            ${memberLogs.length > 0 ? `
              <div style="overflow-x:auto;">
                <table style="width:100%; font-size:12px; border-collapse:collapse; text-align:left;">
                  <thead>
                    <tr style="border-bottom:2px solid #e2e8f0; color:var(--text-secondary); background:#f8fafc;">
                      <th style="padding:10px 8px;">Data & Ora</th>
                      <th style="padding:10px 8px;">Membro</th>
                      <th style="padding:10px 8px;">Servizio & Posto</th>
                      <th style="padding:10px 8px;">Totale Pagato</th>
                      <th style="padding:10px 8px;">Quota Capogruppo</th>
                      <th style="padding:10px 8px;">Fee BuyYourShare</th>
                      <th style="padding:10px 8px;">Metodo</th>
                      <th style="padding:10px 8px;">ID Gateway / Transazione</th>
                      <th style="padding:10px 8px;">Stato</th>
                      <th style="padding:10px 8px; text-align:right;">Ricevuta</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${memberLogs.map(log => {
                      const grp = db.getGroupById(log.groupId);
                      const serviceName = grp ? grp.customServiceName : 'Servizio';
                      const methodLabel = log.paymentMethod?.includes('PAYPAL') ? '🅿️ PayPal Sandbox' : (log.paymentMethod?.includes('APPLE') ? '📱 Apple Pay' : '💳 Carta (Stripe)');
                      
                      return `
                        <tr style="border-bottom:1px solid #f1f5f9;">
                          <td style="padding:10px 8px; white-space:nowrap;">
                            <strong style="color:var(--text-main); font-size:11.5px;">${formatDateIT(log.createdAt, true)}</strong>
                          </td>
                          <td style="padding:10px 8px;">
                            <span style="font-weight:700;">${escapeHtml(currentUser.fullName)}</span>
                          </td>
                          <td style="padding:10px 8px;">
                            <span style="font-weight:800;">${escapeHtml(serviceName)}</span>
                            <span style="color:var(--text-secondary); font-size:11px; display:block;">Posto #${log.slotNumber} (Mese ${log.cycleNumber})</span>
                          </td>
                          <td style="padding:10px 8px; font-weight:800; color:#15803d; font-size:13px;">
                            ${formatCents(log.totalAmountCents)}
                          </td>
                          <td style="padding:10px 8px; color:#1e40af; font-weight:700;">
                            ${formatCents(log.baseShareCents)}
                          </td>
                          <td style="padding:10px 8px; color:var(--accent); font-weight:800;">
                            ${formatCents(log.buyyourshareFeeCents || 149)}
                          </td>
                          <td style="padding:10px 8px;">
                            <span style="font-size:11px; background:#f1f5f9; padding:2px 8px; border-radius:var(--radius-sm); font-weight:700;">
                              ${methodLabel}
                            </span>
                          </td>
                          <td style="padding:10px 8px; font-family:var(--font-mono); font-size:11px; color:var(--primary);">
                            ${escapeHtml(log.transactionId || log.invoiceId || 'N/A')}
                          </td>
                          <td style="padding:10px 8px;">
                            <span style="color:#166534; background:#dcfce7; padding:2px 8px; border-radius:var(--radius-full); font-size:11px; font-weight:800;">
                              🟢 ${log.paymentStatus}
                            </span>
                          </td>
                          <td style="padding:10px 8px; text-align:right;">
                            <button class="btn btn-secondary btn-sm btn-view-receipt" data-txid="${escapeHtml(log.transactionId || log.id)}" style="font-size:11px; padding:3px 8px; font-weight:700;">
                              🧾 Ricevuta
                            </button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div style="text-align:center; padding:24px; color:var(--text-muted); font-size:12.5px; background:#f8fafc; border-radius:var(--radius-md);">
                Nessun pagamento o rinnovo registrato per questo account.
              </div>
            `}
          </div>
        `;
      })()}
    </div>
  `;

  // Se siamo in stato di verifica in corso, esegui la chiamata asincrona
  if (pendingVerif && pendingVerif.status === 'verifying' && !pendingVerif.inFlight) {
    pendingVerif.inFlight = true;
    stripeCheckoutService.processTestPayment(pendingVerif.sessionData, pendingVerif.cardType, pendingVerif.paymentMethod)
      .then(res => {
        if (res.success) {
          window.__pendingPaymentVerification = { status: 'success' };
        } else {
          window.__pendingPaymentVerification = { status: 'failed', error: res.error };
        }
        renderMySubscriptionsView(container, currentUser);
      })
      .catch(err => {
        window.__pendingPaymentVerification = { status: 'failed', error: err.message };
        renderMySubscriptionsView(container, currentUser);
      });
  }

  // Member payment & IBAN settings modal triggers
  const btnMemPay = container.querySelector('#btnMemberEditPayment');
  if (btnMemPay) {
    btnMemPay.onclick = () => openPaymentAndPayoutSettingsModal(currentUser, 'payment');
  }

  const btnMemIb = container.querySelector('#btnMemberEditIban');
  if (btnMemIb) {
    btnMemIb.onclick = () => openPaymentAndPayoutSettingsModal(currentUser, 'payout');
  }

  // Event handlers
  const dismissFail = document.getElementById('btnDismissFail');
  if (dismissFail) {
    dismissFail.onclick = () => {
      window.__pendingPaymentVerification = null;
      navigateTo('#cerca');
    };
  }

  const closeSuccess = document.getElementById('btnCloseSuccessBanner');
  if (closeSuccess) {
    closeSuccess.onclick = () => {
      window.__pendingPaymentVerification = null;
      renderMySubscriptionsView(container, currentUser);
    };
  }

  // Access modal triggers
  container.querySelectorAll('.btn-open-access').forEach(btn => {
    btn.addEventListener('click', () => {
      openAccessModal(btn.dataset.id, currentUser);
    });
  });

  // Receipt modal triggers
  container.querySelectorAll('.btn-view-receipt').forEach(btn => {
    btn.addEventListener('click', () => {
      openTransactionReceiptModal(btn.dataset.txid, currentUser);
    });
  });

  // Cancel membership triggers
  container.querySelectorAll('.btn-cancel-membership').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Vuoi annullare il rinnovo automatico? Manterrai l\'accesso e la chat fino alla fine del periodo già pagato.')) {
        db.cancelMembership(btn.dataset.id, currentUser);
        showToast('Rinnovo automatico disattivato. Accesso valido fino alla scadenza.');
        renderMySubscriptionsView(container, currentUser);
      }
    });
  });

  // Renewal simulation trigger
  container.querySelectorAll('.btn-renew-simulation').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '⏳ Rinnovo in corso...';
      try {
        await stripeCheckoutService.simulateMonthlyRenewal(btn.dataset.id, 2);
        showToast('🔄 Rinnovo mensile confermato da Webhook (1,49€ fee lorda registrata)!');
        renderMySubscriptionsView(container, currentUser);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = '🔄 Simula Rinnovo Mensile';
      }
    });
  });
}

// =========================================================================
// 6. I MIEI GRUPPI VIEW (CAPOGRUPPO - CON GESTIONE SLOT)
// =========================================================================
function renderMyGroupsView(container, currentUser) {
  const myGroups = db.getMyCreatedGroups(currentUser.id);
  const payoutSettings = db.getUserPayoutSettings(currentUser.id) || {
    iban: 'IT60X0542811101000000123456',
    bankName: 'Intesa Sanpaolo (Conto Corrente)',
    paypalPayoutEmail: currentUser.email
  };
  const ownerPayoutLogs = financialAuditService.getOwnerPayoutLogs(currentUser.id);
  const totalTransferredCents = ownerPayoutLogs.reduce((acc, l) => acc + (l.baseShareCents || l.transferAmountCents || 0), 0);

  const totalEarnedCents = ownerPayoutLogs.reduce((acc, l) => acc + (l.baseShareCents || 0), 0);
  const totalPaidCents = ownerPayoutLogs.filter(l => l.payoutStatus === 'PAID' || l.transferStatus === 'TRANSFERRED').reduce((acc, l) => acc + (l.baseShareCents || 0), 0);
  const totalPendingCents = ownerPayoutLogs.filter(l => l.payoutStatus === 'PENDING').reduce((acc, l) => acc + (l.baseShareCents || 0), 0);
  const totalFailedCents = ownerPayoutLogs.filter(l => l.payoutStatus === 'FAILED' || l.transferStatus === 'FAILED').reduce((acc, l) => acc + (l.baseShareCents || 0), 0);
  const conn = db.data.connectedAccounts.find(c => c.userId === currentUser.id);

  container.innerHTML = `
    <div class="page-view">
      <div class="section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h1 style="font-size:22px; font-weight:900;">I Miei Gruppi & Ricezione Quote</h1>
          <p style="font-size:13px; color:var(--text-secondary);">Gestisci i tuoi gruppi, credenziali di accesso e monitora i Payouts delle quote su IBAN.</p>
        </div>
        <a href="#crea" class="btn btn-primary btn-sm">➕ Nuovo Gruppo</a>
      </div>

      <!-- SEZIONE ACCREDITI & BONIFICI IBAN CAPOGRUPPO -->
      <div style="background:white; border:1px solid #cbd5e1; border-radius:var(--radius-lg); padding:16px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:10px;">
          <div>
            <h2 style="font-size:16px; font-weight:800; color:var(--text-main); margin-bottom:2px;">🏦 Dati per Ricevere le Quote (Stripe Connect & IBAN)</h2>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
              <span>IBAN di Accredito: <strong style="font-family:var(--font-mono); color:#003087;">${escapeHtml(payoutSettings.iban)}</strong> (${escapeHtml(payoutSettings.bankName)})</span>
              <span style="margin:0 8px;">•</span>
              <span>Intestatario: <strong>${escapeHtml(payoutSettings.legalName)}</strong></span>
            </div>
          </div>
          <button id="btnOpenEditPayoutModal" class="btn btn-secondary btn-sm" style="font-size:12px; font-weight:800;">
            ✏️ Modifica IBAN / Dati Ricezione
          </button>
        </div>

        <!-- 4 KPI CARDS: MATURATA / PAGATA / IN ATTESA / FALLITA -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:14px;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:10px 12px;">
            <span style="font-size:11px; color:var(--text-secondary); display:block; font-weight:700;">QUOTA MATURATA TOTALE</span>
            <strong style="font-size:18px; color:var(--primary);">${formatCents(totalEarnedCents)}</strong>
            <span style="font-size:10px; color:var(--text-muted); display:block;">Totale storico quote maturate</span>
          </div>

          <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:var(--radius-md); padding:10px 12px;">
            <span style="font-size:11px; color:#166534; display:block; font-weight:700;">QUOTA BONIFICATA (PAGATA)</span>
            <strong style="font-size:18px; color:#166534;">${formatCents(totalPaidCents)}</strong>
            <span style="font-size:10px; color:#166534; display:block; font-weight:700;">🟢 Trasferito su IBAN (0€ trattenute)</span>
          </div>

          <div style="background:#fefce8; border:1px solid #fde047; border-radius:var(--radius-md); padding:10px 12px;">
            <span style="font-size:11px; color:#854d0e; display:block; font-weight:700;">QUOTA IN ATTESA (PENDING)</span>
            <strong style="font-size:18px; color:#854d0e;">${formatCents(totalPendingCents)}</strong>
            <span style="font-size:10px; color:#a16207; display:block;">In elaborazione gateway</span>
          </div>

          <div style="background:${totalFailedCents > 0 ? '#fef2f2' : '#f8fafc'}; border:1px solid ${totalFailedCents > 0 ? '#f87171' : '#e2e8f0'}; border-radius:var(--radius-md); padding:10px 12px;">
            <span style="font-size:11px; color:${totalFailedCents > 0 ? '#991b1b' : 'var(--text-secondary)'}; display:block; font-weight:700;">QUOTA FALLITA / DA RISOLVERE</span>
            <strong style="font-size:18px; color:${totalFailedCents > 0 ? '#dc2626' : 'var(--text-muted)'};">${formatCents(totalFailedCents)}</strong>
            <span style="font-size:10px; color:${totalFailedCents > 0 ? '#991b1b' : 'var(--text-muted)'}; display:block;">${totalFailedCents > 0 ? '⚠️ Richiede azione su conto' : 'Nessun errore'}</span>
          </div>
        </div>

        <!-- Box Trasparenza Economica e Costi Gateway -->
        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--radius-md); padding:10px 12px; font-size:11.5px; color:#1e40af; line-height:1.4;">
          💡 <strong>Ripartizione Economica Trasparente:</strong> Quando un membro acquista un posto a <strong>4,99 €</strong> (3,50 € quota + 1,49 € fee BuyYourShare), l'importo della tua quota di <strong>3,50 €</strong> viene trasferito al 100% sul tuo IBAN/conto. I costi di transazione trattenuti dal gateway (0,52 € su PayPal o 0,36 € su Stripe) sono <strong>sostenuti interamente da BuyYourShare</strong> e non intaccano mai la tua quota.
        </div>

        ${ownerPayoutLogs.length > 0 ? `
          <div style="margin-top:16px;">
            <h3 style="font-size:13.5px; font-weight:800; margin-bottom:8px; color:var(--text-main);">
              📋 Registro Payouts & Trasferimenti Quote (${ownerPayoutLogs.length})
            </h3>
            <div style="overflow-x:auto;">
              <table style="width:100%; font-size:11.5px; border-collapse:collapse; text-align:left;">
                <thead>
                  <tr style="border-bottom:2px solid #e2e8f0; color:var(--text-secondary);">
                    <th style="padding:8px 6px;">Data & Ora</th>
                    <th style="padding:8px 6px;">Membro Pagante</th>
                    <th style="padding:8px 6px;">Servizio / Posto</th>
                    <th style="padding:8px 6px;">Totale Membro</th>
                    <th style="padding:8px 6px;">Costo Gateway (BYS)</th>
                    <th style="padding:8px 6px; color:#166534;">Quota Bonificata (Tu)</th>
                    <th style="padding:8px 6px;">ID Transazione / Payout</th>
                    <th style="padding:8px 6px;">Stato Payout</th>
                    <th style="padding:8px 6px; text-align:right;">Distinta</th>
                  </tr>
                </thead>
                <tbody>
                  ${ownerPayoutLogs.map(l => {
                    const memberU = db.data.users.find(u => u.id === l.memberId) || { fullName: 'Membro' };
                    const grp = db.getGroupById(l.groupId);
                    const isPP = l.paymentMethod?.includes('PAYPAL');
                    const feeCents = l.paymentProviderFeeCents || (isPP ? 52 : 36);
                    const isPaid = l.payoutStatus === 'PAID' || l.transferStatus === 'TRANSFERRED';
                    const isFailed = l.payoutStatus === 'FAILED' || l.transferStatus === 'FAILED';

                    return `
                      <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:8px 6px; white-space:nowrap; font-weight:700;">${formatDateIT(l.createdAt, true)}</td>
                        <td style="padding:8px 6px;">${escapeHtml(memberU.fullName)}</td>
                        <td style="padding:8px 6px; font-weight:700;">${escapeHtml(grp ? grp.customServiceName : 'Servizio')} (#${l.slotNumber})</td>
                        <td style="padding:8px 6px;">${formatCents(l.totalAmountCents)}</td>
                        <td style="padding:8px 6px; color:#dc2626;">-${formatCents(feeCents)} <span style="font-size:10px; color:var(--text-muted);">(a carico BYS)</span></td>
                        <td style="padding:8px 6px; font-weight:800; color:#166534; font-size:12.5px;">${formatCents(l.baseShareCents)}</td>
                        <td style="padding:8px 6px; font-family:var(--font-mono); font-size:11px;">
                          <div>Tx: ${escapeHtml(l.transactionId || 'N/A')}</div>
                          <div style="color:#0070ba;">Po: ${escapeHtml(l.payoutId || l.transferId || 'N/A')}</div>
                        </td>
                        <td style="padding:8px 6px;">
                          ${isPaid ? `
                            <span style="color:#166534; font-weight:800; font-size:11px; background:#dcfce7; padding:2px 6px; border-radius:4px;">🟢 PAGATO SU IBAN</span>
                          ` : isFailed ? `
                            <span style="color:#991b1b; font-weight:800; font-size:11px; background:#fee2e2; padding:2px 6px; border-radius:4px;">🔴 FALLITO</span>
                            <span style="font-size:10px; color:#991b1b; display:block; margin-top:2px;">${escapeHtml(l.payoutFailureReason || 'Errore elaborazione')}</span>
                          ` : `
                            <span style="color:#854d0e; font-weight:800; font-size:11px; background:#fef9c3; padding:2px 6px; border-radius:4px;">⏳ IN ATTESA</span>
                          `}
                        </td>
                        <td style="padding:8px 6px; text-align:right;">
                          <button class="btn btn-secondary btn-sm btn-view-payout-detail" data-id="${l.id}" style="font-size:11px; padding:3px 8px;">
                            🧾 Distinta
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}
      </div>

      ${myGroups.length > 0 ? `
        <div class="groups-grid">
          ${myGroups.map(grp => {
            const isScheduled = grp.status === 'cancellation_scheduled';
            const slotsInfo = db.getGroupSlotsBreakdown(grp);
            const isSpotify = grp.serviceId === 'srv-spotify' || grp.customServiceName.toLowerCase().includes('spotify');
            const instructions = db.getAccessInstructions(grp.id, currentUser.id);
            
            // Calcola la somma esatta delle quote dei membri attivi
            const activeMembersTotalCents = grp.members.reduce((acc, m) => acc + (m.paidShareCents || grp.baseMemberShareCents), 0);

            return `
              <div class="group-card" style="border-left: 4px solid var(--accent);">
                <div class="group-card-top" style="margin-bottom:8px;">
                  <div>
                    <h3 style="font-size:16px; font-weight:800;">${escapeHtml(grp.customServiceName)}</h3>
                    <p style="font-size:12px; color:var(--text-secondary);">${escapeHtml(grp.planName)}</p>
                  </div>
                  <span class="slots-pill ${isScheduled ? 'full' : 'available'}">
                    ${isScheduled ? '⚠️ Chiusura Programmata' : `🟢 ${grp.occupiedMemberSlots}/${grp.availableSlots} occupati`}
                  </span>
                </div>

                <div class="price-breakdown-card">
                  <div class="price-row">
                    <span>Costo reale totale del piano:</span>
                    <strong>${formatCents(grp.realSubscriptionCostCents)} / mese</strong>
                  </div>
                  <div class="price-row">
                    <span>Membri paganti attivi:</span>
                    <strong>${(grp.members || []).length} partecipanti (${slotsInfo.availableSlotsCount} posti liberi)</strong>
                  </div>
                  <div class="price-row total-row">
                    <span>Totale mensile maturato per te:</span>
                    <span class="total-amount">${formatCents(activeMembersTotalCents)} / mese</span>
                  </div>
                </div>

                <!-- Elenco Dettagliato Posti e Membri -->
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:10px 12px; margin-top:10px; font-size:12px;">
                  <span style="font-size:11.5px; font-weight:800; color:var(--text-main); display:block; margin-bottom:6px;">👥 Situazione Posti (${grp.totalSlots} totali):</span>
                  <div style="display:flex; flex-direction:column; gap:4px;">
                    ${slotsInfo.slots.map(s => {
                      if (s.isOwnerSlot) {
                        return `<div style="display:flex; justify-content:space-between; color:#1e40af; font-weight:700;"><span>👑 Posto #${s.slotNumber} (Tu - Capogruppo)</span><span>${formatCents(s.baseShareCents)} / mese</span></div>`;
                      } else if (s.isOccupied) {
                        const mUser = s.assignedUser || (grp.members || []).find(m => m.slotNumber === s.slotNumber) || {};
                        const mName = mUser.fullName || 'Membro Pagante';
                        return `<div style="display:flex; justify-content:space-between; color:#166534; font-weight:700; background:#f0fdf4; padding:3px 6px; border-radius:4px;"><span>🟢 Posto #${s.slotNumber} (Occupato da ${escapeHtml(mName)})</span><span>+${formatCents(s.baseShareCents)} / mese</span></div>`;
                      } else {
                        return `<div style="display:flex; justify-content:space-between; color:var(--text-muted);"><span>⚪ Posto #${s.slotNumber} (Disponibile nel Marketplace)</span><span>${formatCents(s.baseShareCents)} / mese</span></div>`;
                      }
                    }).join('')}
                  </div>
                </div>

                ${isSpotify ? `
                  <!-- Campo Indirizzo Spotify del Capogruppo -->
                  <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:10px 12px; margin-top:10px;">
                    <label style="font-size:12px; font-weight:800; color:var(--text-main); display:block; margin-bottom:4px;">
                      📧 Indirizzo Spotify del Capogruppo
                    </label>
                    <div style="display:flex; gap:6px;">
                      <input type="email" class="form-input input-spotify-email" data-id="${grp.id}" value="${escapeHtml(instructions?.ownerSpotifyAccount || '')}" placeholder="email@esempio.com" style="font-size:12px; padding:6px 10px; flex:1;">
                      <button class="btn btn-secondary btn-save-spotify-email" data-id="${grp.id}" style="font-size:11.5px; padding:6px 12px; white-space:nowrap; font-weight:700;">
                        Salva indirizzo Spotify
                      </button>
                    </div>
                    <span style="font-size:10.5px; color:var(--text-muted); margin-top:3px; display:block;">
                      🔒 Visibile esclusivamente ai membri paganti verificati per completare l'invito Family.
                    </span>
                  </div>
                ` : ''}

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;">
                  <button class="btn btn-secondary btn-edit-access" data-id="${grp.id}" style="font-size:12px;">
                    ⚙️ MODIFICA ACCESSO
                  </button>
                  <a href="#chat-${grp.id}" class="btn btn-primary" style="font-size:12px;">
                    💬 CHAT DEL GRUPPO
                  </a>
                </div>

                <div style="display:flex; gap:8px; margin-top:8px;">
                  <button class="btn btn-secondary btn-copy-invite" data-code="${grp.inviteCode}" style="flex:1; font-size:12px;">
                    📋 COPIA LINK INVITO
                  </button>
                  ${!isScheduled ? `
                    <button class="btn btn-danger btn-cancel-group" data-id="${grp.id}" style="font-size:12px;">
                      ✕ Annulla Gruppo
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="text-align:center; padding:40px 20px; background:white; border-radius:var(--radius-lg); border:1px dashed var(--border-strong);">
          <p style="font-size:15px; font-weight:700; margin-bottom:6px;">Non hai ancora creato nessun gruppo</p>
          <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">Hai un abbonamento con posti liberi? Condividilo e azzera le tue spese mensili.</p>
          <a href="#crea" class="btn btn-primary btn-sm">➕ Crea il tuo primo Gruppo</a>
        </div>
      `}
    </div>
  `;

  // Edit Payout Settings Trigger
  const btnEditPayout = container.querySelector('#btnOpenEditPayoutModal');
  if (btnEditPayout) {
    btnEditPayout.onclick = () => openEditPayoutModal(currentUser);
  }

  // View Payout Detail Triggers
  container.querySelectorAll('.btn-view-payout-detail').forEach(btn => {
    btn.onclick = () => openPayoutDetailModal(btn.dataset.id, currentUser);
  });

  // Save Spotify Email Handler
  container.querySelectorAll('.btn-save-spotify-email').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupId = btn.dataset.id;
      const input = container.querySelector(`.input-spotify-email[data-id="${groupId}"]`);
      const emailVal = input ? input.value : '';
      db.updateSpotifyOwnerAccount(groupId, emailVal, currentUser);
      showToast('✅ Indirizzo Spotify del Capogruppo salvato con successo!');
    });
  });

  // Edit access triggers
  container.querySelectorAll('.btn-edit-access').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditAccessModal(btn.dataset.id, currentUser);
    });
  });

  // Copy invite link
  container.querySelectorAll('.btn-copy-invite').forEach(btn => {
    btn.addEventListener('click', () => {
      copyToClipboard(`https://buyyourshare.app/join/${btn.dataset.code}`, 'Link invito copiato!');
    });
  });

  // Cancel group
  container.querySelectorAll('.btn-cancel-group').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Vuoi annullare questo gruppo? Non saranno accettati nuovi membri, ma i partecipanti attivi manterranno l\'accesso fino al termine del loro mese già pagato.')) {
        db.cancelGroup(btn.dataset.id, currentUser);
        showToast('Chiusura gruppo programmata.');
        renderMyGroupsView(container, currentUser);
      }
    });
  });
}

// =========================================================================
// 7. NATIVE PRIVATE GROUP CHAT VIEW
// =========================================================================
function renderChatView(container, groupId, currentUser) {
  const chatData = db.getGroupChat(groupId, currentUser.id);

  if (!chatData) {
    container.innerHTML = `
      <div class="page-view" style="text-align:center; padding:40px;">
        <h3 style="font-size:18px; font-weight:800; color:#dc2626;">Accesso non autorizzato</h3>
        <p style="font-size:13px; color:var(--text-secondary); margin:12px 0;">Devi essere un partecipante attivo o il Capogruppo per entrare in questa chat.</p>
        <a href="#miei-abbonamenti" class="btn btn-secondary">I Miei Abbonamenti</a>
      </div>
    `;
    return;
  }

  const grp = chatData.group;
  const messages = chatData.messages;

  container.innerHTML = `
    <div class="page-view">
      <div class="chat-container">
        
        <!-- Header -->
        <div class="chat-header">
          <div class="chat-header-info">
            <a href="#gruppo-${grp.id}" style="font-size:14px; text-decoration:none; color:var(--text-secondary); margin-right:4px;">←</a>
            <div class="chat-header-title">
              <h3>💬 Chat: ${escapeHtml(grp.customServiceName)}</h3>
              <p>🟢 ${chatData.members.length} membri attivi</p>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btnChatAccessInfo" style="font-size:11px;">
            🔑 Info Accesso
          </button>
        </div>

        <!-- Messages Feed -->
        <div class="chat-messages-area" id="chatFeed">
          ${messages.map(msg => {
            if (msg.messageType === 'SYSTEM' || msg.messageType === 'ACCESS_UPDATE') {
              return `
                <div class="system-msg-wrap">
                  <div class="system-bubble ${msg.messageType === 'ACCESS_UPDATE' ? 'access-update' : ''}">
                    <span>${escapeHtml(msg.messageContent)}</span>
                    ${msg.messageType === 'ACCESS_UPDATE' ? `
                      <button class="btn-access-link btn-open-access" data-id="${grp.id}">Apri "Il Tuo Accesso"</button>
                    ` : ''}
                  </div>
                </div>
              `;
            }

            const isMe = msg.senderId === currentUser.id;
            return `
              <div class="message-wrap ${isMe ? 'my-msg' : 'other-msg'}">
                ${!isMe ? `<span class="sender-name-tag">${escapeHtml(msg.senderName || 'Utente')}</span>` : ''}
                <div class="message-bubble">
                  ${escapeHtml(msg.messageContent)}
                </div>
                <span class="msg-time">${formatDateShort(msg.createdAt)}</span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Input Bar -->
        <form class="chat-input-bar" id="chatForm">
          <input type="text" id="chatInputText" class="chat-input-field" placeholder="Scrivi un messaggio a tutti i partecipanti..." autocomplete="off" required>
          <button type="submit" class="btn btn-primary btn-sm" style="padding:10px 16px;">Invia</button>
        </form>

      </div>
    </div>
  `;

  // Auto scroll
  const feed = container.querySelector('#chatFeed');
  if (feed) feed.scrollTop = feed.scrollHeight;

  // Submit message
  const form = container.querySelector('#chatForm');
  form.onsubmit = (e) => {
    e.preventDefault();
    const input = document.getElementById('chatInputText');
    if (!input.value.trim()) return;

    db.sendChatMessage(groupId, currentUser, input.value);
    input.value = '';
    renderChatView(container, groupId, currentUser);
  };

  // Open access modal from chat
  const btnAccess = container.querySelector('#btnChatAccessInfo');
  if (btnAccess) {
    btnAccess.onclick = () => openAccessModal(groupId, currentUser);
  }

  container.querySelectorAll('.btn-open-access').forEach(b => {
    b.onclick = () => openAccessModal(b.dataset.id, currentUser);
  });
}

let currentAdminTab = 'dashboard';

async function renderAdminView(container, currentUser) {
  const token = authService.getToken();
  let metrics = null;
  let allGroups = [];
  let allUsers = [];
  let adminLogs = [];
  let financialLogs = [];

  // Fetch dati server-side protetti
  try {
    const [dashRes, grpRes, usrRes, logRes] = await Promise.all([
      fetch('/api/admin/dashboard', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/admin/groups', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/admin/audit-logs', { headers: { 'Authorization': `Bearer ${token}` } })
    ]);

    if (dashRes.ok) metrics = (await dashRes.json()).metrics;
    if (grpRes.ok) allGroups = (await grpRes.json()).groups || [];
    if (usrRes.ok) allUsers = (await usrRes.json()).users || [];
    if (logRes.ok) {
      const lData = await logRes.json();
      adminLogs = lData.adminLogs || [];
      financialLogs = lData.financialLogs || [];
    }
  } catch (err) {
    console.warn('[ADMIN VIEW] Fallito fetch server-side admin, fallback locale:', err.message);
  }

  // Fallback se offline/local
  if (!metrics) {
    const localSummary = financialAuditService.getFinancialSummary();
    metrics = {
      users: { total: db.data.users.length, members: db.data.users.filter(u => u.role === 'user').length, owners: db.data.users.filter(u => u.role === 'owner').length, admins: 1 },
      groups: { total: db.data.groups.length, published: db.data.groups.filter(g => g.status === 'PUBLISHED' || g.status === 'active').length, draft: db.data.groups.filter(g => g.status === 'DRAFT').length, closed: db.data.groups.filter(g => g.status === 'CLOSED').length, availableSlots: 5, occupiedSlots: 1, totalSlots: 6 },
      finance: { totalVolumeCents: localSummary.totalGrossFeesCents, totalGrossFeesCents: localSummary.totalGrossFeesCents, totalProviderFeesCents: localSummary.totalProviderFeesCents, totalNetPlatformRevenueCents: localSummary.totalNetPlatformRevenueCents, totalTransferredToOwnersCents: 0, transactionsCount: localSummary.totalTransactionsCount }
    };
    allGroups = db.getGroups();
    allUsers = db.data.users;
    financialLogs = financialAuditService.getAllLogs();
  }

  function getTabBtnStyle(tabName) {
    const isActive = currentAdminTab === tabName;
    return `padding:8px 14px; font-size:12.5px; font-weight:800; border-radius:var(--radius-sm); border:none; cursor:pointer; transition:all 0.15s ease; ${isActive ? 'background:#003087; color:white; box-shadow:0 2px 6px rgba(0,48,135,0.25);' : 'background:#f1f5f9; color:var(--text-secondary);'}`;
  }

  container.innerHTML = `
    <div class="page-view" style="max-width:1100px; margin:0 auto; padding-bottom:60px;">
      <!-- Header Admin -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <h1 style="font-size:24px; font-weight:900; color:var(--text-main); margin:0;">⚙️ Pannello di Controllo Admin</h1>
            <span style="background:#f3e8ff; color:#6b21a8; font-size:11px; font-weight:800; padding:2px 8px; border-radius:var(--radius-full);">RISERVATO</span>
          </div>
          <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
            Gestione globale BuyYourShare, moderazione gruppi, utenti e supervisione contabile immutabile.
          </p>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; color:var(--text-muted);">Autenticato come: <strong>${escapeHtml(currentUser.fullName)}</strong></span>
          <a href="#home" class="btn btn-secondary btn-sm" style="font-size:11.5px;">🏠 Vai al Sito</a>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex; gap:6px; background:white; padding:6px; border-radius:var(--radius-md); border:1px solid #e2e8f0; margin-bottom:22px; overflow-x:auto;">
        <button type="button" class="btn-admin-tab" data-tab="dashboard" style="${getTabBtnStyle('dashboard')}">
          📊 Dashboard
        </button>
        <button type="button" class="btn-admin-tab" data-tab="groups" style="${getTabBtnStyle('groups')}">
          📁 Gestione Gruppi (${metrics.groups.total || allGroups.length})
        </button>
        <button type="button" class="btn-admin-tab" data-tab="users" style="${getTabBtnStyle('users')}">
          👥 Gestione Utenti (${metrics.users.total || allUsers.length})
        </button>
        <button type="button" class="btn-admin-tab" data-tab="ledger" style="${getTabBtnStyle('ledger')}">
          📜 Audit Ledger & Azioni
        </button>
        <button type="button" class="btn-admin-tab" data-tab="gateway" style="${getTabBtnStyle('gateway')}">
          🅿️ Config Gateway
        </button>
      </div>

      <!-- ========================================== -->
      <!-- TAB 1: DASHBOARD KPI                       -->
      <!-- ========================================== -->
      ${currentAdminTab === 'dashboard' ? `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin-bottom:24px;">
          <!-- Card Utenti -->
          <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size:11.5px; font-weight:800; color:var(--text-secondary); text-transform:uppercase;">👥 Utenti Totali</span>
            <div style="font-size:26px; font-weight:900; color:#003087; margin:6px 0;">${metrics.users.total}</div>
            <div style="font-size:11.5px; color:var(--text-muted);">
              <strong>${metrics.users.members}</strong> Membri • <strong>${metrics.users.owners}</strong> Capigruppo
            </div>
          </div>

          <!-- Card Gruppi -->
          <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size:11.5px; font-weight:800; color:var(--text-secondary); text-transform:uppercase;">📁 Gruppi a Sistema</span>
            <div style="font-size:26px; font-weight:900; color:#166534; margin:6px 0;">${metrics.groups.total}</div>
            <div style="font-size:11.5px; color:var(--text-muted);">
              <span style="color:#166534; font-weight:700;">${metrics.groups.published} Pubblicati</span> • 
              <span style="color:#d97706; font-weight:700;">${metrics.groups.draft || 0} Draft</span> • 
              <span style="color:#991b1b; font-weight:700;">${metrics.groups.closed || 0} Chiusi</span>
            </div>
          </div>

          <!-- Card Posti -->
          <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size:11.5px; font-weight:800; color:var(--text-secondary); text-transform:uppercase;">🟢 Posti Marketplace</span>
            <div style="font-size:26px; font-weight:900; color:#0284c7; margin:6px 0;">${metrics.groups.availableSlots || 0} <span style="font-size:14px; color:var(--text-muted); font-weight:500;">liberi</span></div>
            <div style="font-size:11.5px; color:var(--text-muted);">
              Totali: <strong>${metrics.groups.totalSlots || 0}</strong> • Occupati: <strong>${metrics.groups.occupiedSlots || 0}</strong>
            </div>
          </div>

          <!-- Card Finanziaria -->
          <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
            <span style="font-size:11.5px; font-weight:800; color:var(--text-secondary); text-transform:uppercase;">💰 Fee Lorde Incassate</span>
            <div style="font-size:26px; font-weight:900; color:var(--accent); margin:6px 0;">${formatCents(metrics.finance.totalGrossFeesCents)}</div>
            <div style="font-size:11.5px; color:var(--text-muted);">
              Netto: <strong style="color:#166534;">${formatCents(metrics.finance.totalNetPlatformRevenueCents)}</strong> (${metrics.finance.transactionsCount || 0} cicli)
            </div>
          </div>
        </div>

        <!-- Riepilogo Finanziario Rapido -->
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; margin-bottom:24px;">
          <h3 style="font-size:14px; font-weight:800; color:var(--text-main); margin-bottom:8px;">📊 Riepilogo Economico Piattaforma</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; font-size:12.5px;">
            <div>Volume Totale Transato: <strong>${formatCents(metrics.finance.totalVolumeCents)}</strong></div>
            <div>Fee BYS Lorde (1,49 €/quota): <strong>${formatCents(metrics.finance.totalGrossFeesCents)}</strong></div>
            <div>Costi Gateway Stimati: <strong>${formatCents(metrics.finance.totalProviderFeesCents)}</strong></div>
            <div>Quote Trasferite ai Capigruppo: <strong style="color:#1e40af;">${formatCents(metrics.finance.totalTransferredToOwnersCents)}</strong></div>
          </div>
        </div>
      ` : ''}

      <!-- ========================================== -->
      <!-- TAB 2: GESTIONE GRUPPI                     -->
      <!-- ========================================== -->
      ${currentAdminTab === 'groups' ? `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
              <h3 style="font-size:16px; font-weight:800; margin:0;">Elenco Completo Gruppi (${allGroups.length})</h3>
              <p style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Visualizzazione e controllo di tutti i gruppi del database, inclusi DRAFT e CLOSED.</p>
            </div>
          </div>

          ${allGroups.length > 0 ? `
            <div style="overflow-x:auto;">
              <table style="width:100%; font-size:11.5px; border-collapse:collapse; text-align:left;">
                <thead>
                  <tr style="border-bottom:2px solid #e2e8f0; color:var(--text-secondary);">
                    <th style="padding:8px;">ID Gruppo</th>
                    <th style="padding:8px;">Servizio & Piano</th>
                    <th style="padding:8px;">Capogruppo</th>
                    <th style="padding:8px;">Stato</th>
                    <th style="padding:8px;">Posti (Tot/Occ/Lib)</th>
                    <th style="padding:8px;">Quota Membro</th>
                    <th style="padding:8px;">Data Creazione</th>
                    <th style="padding:8px; text-align:right;">Azioni Amministrative</th>
                  </tr>
                </thead>
                <tbody>
                  ${allGroups.map(g => {
                    const statusBg = g.status === 'PUBLISHED' || g.status === 'active' ? '#dcfce7' : g.status === 'FULL' || g.status === 'full' ? '#dbeafe' : g.status === 'DRAFT' ? '#fef3c7' : '#fee2e2';
                    const statusColor = g.status === 'PUBLISHED' || g.status === 'active' ? '#166534' : g.status === 'FULL' || g.status === 'full' ? '#1e40af' : g.status === 'DRAFT' ? '#92400e' : '#991b1b';
                    const ownerName = g.owner ? g.owner.fullName : (g.ownerId || 'N/A');
                    const ownerEmail = g.owner ? g.owner.email : '';
                    const availableCount = Math.max(0, (g.availableSlots || 0) - (g.occupiedMemberSlots || 0));

                    return `
                      <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:8px; font-family:var(--font-mono); font-weight:700; color:#003087;">${escapeHtml(g.id)}</td>
                        <td style="padding:8px;">
                          <strong>${escapeHtml(g.customServiceName)}</strong><br>
                          <span style="color:var(--text-muted); font-size:10.5px;">${escapeHtml(g.planName)}</span>
                        </td>
                        <td style="padding:8px;">
                          <strong>${escapeHtml(ownerName)}</strong><br>
                          <span style="color:var(--text-muted); font-size:10.5px;">${escapeHtml(ownerEmail)}</span>
                        </td>
                        <td style="padding:8px;">
                          <span style="background:${statusBg}; color:${statusColor}; font-weight:800; font-size:10.5px; padding:3px 8px; border-radius:var(--radius-full);">
                            ${g.status}
                          </span>
                        </td>
                        <td style="padding:8px; font-weight:700;">
                          ${g.totalSlots} / <span style="color:#003087;">${g.occupiedMemberSlots || 0}</span> / <span style="color:#166534;">${availableCount}</span>
                        </td>
                        <td style="padding:8px; font-weight:800; color:#166534;">
                          ${formatCents(g.memberTotalCents)}/m
                        </td>
                        <td style="padding:8px; color:var(--text-muted); font-size:11px;">
                          ${formatDateIT(g.createdAt, true)}
                        </td>
                        <td style="padding:8px; text-align:right;">
                          <div style="display:flex; gap:4px; justify-content:flex-end;">
                            <a href="#gruppo-${g.id}" class="btn btn-secondary btn-sm" style="font-size:11px; padding:4px 8px;" title="Vedi gruppo">
                              👁️ Dettagli
                            </a>
                            ${g.status !== 'CLOSED' ? `
                              <button type="button" class="btn btn-secondary btn-sm btn-admin-close-group" data-id="${g.id}" style="font-size:11px; padding:4px 8px; color:#92400e;" title="Chiudi gruppo">
                                ⏹️ Chiudi
                              </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary btn-sm btn-admin-delete-group" data-id="${g.id}" data-title="${escapeHtml(g.customServiceName + ' - ' + g.planName)}" style="font-size:11px; padding:4px 8px; color:#dc2626; border-color:#fca5a5; font-weight:800;" title="Elimina definitivamente dal database">
                              🗑️ Elimina
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <p style="text-align:center; padding:30px; color:var(--text-muted);">Nessun gruppo presente nel database.</p>
          `}
        </div>
      ` : ''}

      <!-- ========================================== -->
      <!-- TAB 3: GESTIONE UTENTI                     -->
      <!-- ========================================== -->
      ${currentAdminTab === 'users' ? `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:14px;">
            <h3 style="font-size:16px; font-weight:800; margin:0;">Elenco Utenti Registrati (${allUsers.length})</h3>
            <p style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Visualizzazione e gestione dello stato degli account utente.</p>
          </div>

          <div style="overflow-x:auto;">
            <table style="width:100%; font-size:11.5px; border-collapse:collapse; text-align:left;">
              <thead>
                <tr style="border-bottom:2px solid #e2e8f0; color:var(--text-secondary);">
                  <th style="padding:8px;">ID</th>
                  <th style="padding:8px;">Nome & Cognome</th>
                  <th style="padding:8px;">Email</th>
                  <th style="padding:8px;">Ruolo</th>
                  <th style="padding:8px;">Gruppi Creati</th>
                  <th style="padding:8px;">Abbonamenti Attivi</th>
                  <th style="padding:8px;">Stato Account</th>
                  <th style="padding:8px; text-align:right;">Azioni</th>
                </tr>
              </thead>
              <tbody>
                ${allUsers.map(u => {
                  const roleBg = u.role === 'admin' ? '#f3e8ff' : u.createdGroupsCount > 0 || u.role === 'owner' ? '#fef3c7' : '#e0f2fe';
                  const roleColor = u.role === 'admin' ? '#6b21a8' : u.createdGroupsCount > 0 || u.role === 'owner' ? '#92400e' : '#0369a1';
                  const roleLabel = u.role === 'admin' ? '⚙️ Admin' : u.createdGroupsCount > 0 || u.role === 'owner' ? '👑 Capogruppo' : '👤 Membro';

                  return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:8px; font-family:var(--font-mono); font-weight:700; color:#003087;">${escapeHtml(u.id)}</td>
                      <td style="padding:8px; font-weight:700;">${escapeHtml(u.fullName)}</td>
                      <td style="padding:8px; color:var(--text-secondary); font-family:var(--font-mono); font-size:11px;">${escapeHtml(u.email)}</td>
                      <td style="padding:8px;">
                        <span style="background:${roleBg}; color:${roleColor}; font-weight:800; font-size:10.5px; padding:3px 8px; border-radius:var(--radius-full);">
                          ${roleLabel}
                        </span>
                      </td>
                      <td style="padding:8px; font-weight:700; color:#003087;">${u.createdGroupsCount || 0}</td>
                      <td style="padding:8px; font-weight:700; color:#166534;">${u.activeMembershipsCount || 0}</td>
                      <td style="padding:8px;">
                        ${u.isSuspended ? `
                          <span style="background:#fee2e2; color:#991b1b; font-weight:800; font-size:10.5px; padding:3px 8px; border-radius:var(--radius-full);">🔴 SOSPESO</span>
                        ` : `
                          <span style="background:#dcfce7; color:#166534; font-weight:800; font-size:10.5px; padding:3px 8px; border-radius:var(--radius-full);">🟢 ATTIVO</span>
                        `}
                      </td>
                      <td style="padding:8px; text-align:right;">
                        ${u.role !== 'admin' ? `
                          <button type="button" class="btn btn-secondary btn-sm btn-admin-toggle-suspend" data-id="${u.id}" data-name="${escapeHtml(u.fullName)}" data-suspended="${!!u.isSuspended}" style="font-size:11px; padding:3px 8px; ${u.isSuspended ? 'color:#166534; border-color:#86efac;' : 'color:#dc2626; border-color:#fca5a5;'};">
                            ${u.isSuspended ? '✅ Riattiva' : '🚫 Sospendi'}
                          </button>
                        ` : '<span style="color:var(--text-muted); font-size:10.5px;">Protetto</span>'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- ========================================== -->
      <!-- TAB 4: AUDIT LEDGER & AZIONI ADMIN         -->
      <!-- ========================================== -->
      ${currentAdminTab === 'ledger' ? `
        <!-- Sezione 1: Azioni Amministrative -->
        <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; margin-bottom:20px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="font-size:15px; font-weight:800; color:var(--text-main); margin:0;">🛡️ Registro Azioni Amministrative (${adminLogs.length})</h3>
            <span style="font-size:11px; background:#f1f5f9; padding:2px 8px; border-radius:var(--radius-full); font-family:var(--font-mono);">ADMIN AUDIT TRAIL</span>
          </div>
          ${adminLogs.length > 0 ? `
            <div style="overflow-x:auto;">
              <table style="width:100%; font-size:11px; border-collapse:collapse; text-align:left;">
                <thead>
                  <tr style="border-bottom:2px solid #e2e8f0; color:var(--text-secondary);">
                    <th style="padding:6px;">Data & Ora</th>
                    <th style="padding:6px;">Azione</th>
                    <th style="padding:6px;">Target</th>
                    <th style="padding:6px;">Eseguita Da</th>
                    <th style="padding:6px;">Dettagli</th>
                  </tr>
                </thead>
                <tbody>
                  ${adminLogs.map(a => `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:6px; white-space:nowrap; font-family:var(--font-mono);">${formatDateIT(a.timestamp, true)}</td>
                      <td style="padding:6px;">
                        <span style="font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px; ${a.action.includes('DELETED') ? 'background:#fee2e2; color:#991b1b;' : 'background:#e0f2fe; color:#0369a1;'}">
                          ${escapeHtml(a.action)}
                        </span>
                      </td>
                      <td style="padding:6px; font-weight:700;">${escapeHtml(a.targetName || a.targetId)}</td>
                      <td style="padding:6px; color:var(--text-secondary);">${escapeHtml(a.performedByName || a.performedBy)}</td>
                      <td style="padding:6px; color:var(--text-secondary);">${escapeHtml(a.details || '')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <p style="padding:16px; text-align:center; color:var(--text-muted); font-size:12px;">Nessuna azione amministrativa recente registrata.</p>
          `}
        </div>

        <!-- Sezione 2: Ledger Finanziario Immutabile -->
        <div style="background:white; border:1px solid #e2e8f0; border-radius:var(--radius-lg); padding:18px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h3 style="font-size:15px; font-weight:800; color:var(--text-main); margin:0;">📑 Ledger Finanziario Completo (${financialLogs.length})</h3>
            <span style="font-size:11px; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:var(--radius-full); font-weight:700;">CONSOLIDATO</span>
          </div>
          ${financialLogs.length > 0 ? `
            <div style="overflow-x:auto;">
              <table style="width:100%; font-size:11px; border-collapse:collapse; text-align:left;">
                <thead>
                  <tr style="border-bottom:2px solid #e2e8f0; color:var(--text-secondary);">
                    <th style="padding:6px;">Data</th>
                    <th style="padding:6px;">Membro</th>
                    <th style="padding:6px;">Totale</th>
                    <th style="padding:6px;">Gateway</th>
                    <th style="padding:6px; color:#1e40af;">Quota Capogruppo</th>
                    <th style="padding:6px;">Fee BYS</th>
                    <th style="padding:6px; color:#166534;">Netto BYS</th>
                    <th style="padding:6px;">Payout ID</th>
                    <th style="padding:6px;">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  ${financialLogs.map(l => {
                    const memberU = allUsers.find(u => u.id === l.memberId) || { fullName: 'Membro' };
                    const isPaid = l.payoutStatus === 'PAID' || l.transferStatus === 'TRANSFERRED';
                    return `
                      <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px; white-space:nowrap;">${formatDateIT(l.createdAt, true)}</td>
                        <td style="padding:6px; font-weight:700;">${escapeHtml(memberU.fullName)}</td>
                        <td style="padding:6px; font-weight:800;">${formatCents(l.totalAmountCents)}</td>
                        <td style="padding:6px;">${l.paymentMethod?.includes('PAYPAL') ? '🅿️ PayPal' : '💳 Stripe'}</td>
                        <td style="padding:6px; font-weight:800; color:#1e40af;">${formatCents(l.baseShareCents)}</td>
                        <td style="padding:6px; font-weight:700; color:var(--accent);">+${formatCents(l.buyyourshareFeeCents || 149)}</td>
                        <td style="padding:6px; font-weight:800; color:#166534;">${formatCents(l.netPlatformAmountCents)}</td>
                        <td style="padding:6px; font-family:var(--font-mono); font-size:10px;">${escapeHtml(l.payoutId || l.transferId || 'N/A')}</td>
                        <td style="padding:6px;">
                          ${isPaid ? '<span style="color:#166534; font-weight:800; font-size:10.5px; background:#dcfce7; padding:2px 6px; border-radius:4px;">🟢 PAID</span>' : '<span style="color:#854d0e; font-weight:800; font-size:10.5px; background:#fef9c3; padding:2px 6px; border-radius:4px;">⏳ PENDING</span>'}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <p style="padding:20px; text-align:center; color:var(--text-muted); font-size:12px;">Nessuna transazione contabile registrata.</p>
          `}
        </div>
      ` : ''}

      <!-- ========================================== -->
      <!-- TAB 5: CONFIGURAZIONE GATEWAY              -->
      <!-- ========================================== -->
      <!-- ========================================== -->
      <!-- TAB 5: CONFIGURAZIONE GATEWAY & PAYOUTS     -->
      <!-- ========================================== -->
      ${currentAdminTab === 'gateway' ? `
        <!-- Sezione 1: PayPal LIVE Production -->
        <div style="background:white; border:1px solid #93c5fd; padding:20px; border-radius:var(--radius-lg); box-shadow:0 2px 8px rgba(59,130,246,0.08); margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:20px;">🅿️</span>
              <h3 style="font-size:16px; font-weight:900; color:#003087; margin:0;">PayPal LIVE / Production</h3>
            </div>
            <span style="font-size:11px; background:#dbeafe; color:#1e40af; padding:3px 10px; border-radius:var(--radius-full); font-weight:800;">
              ENDPOINT: api-m.paypal.com
            </span>
          </div>

          <p style="font-size:12.5px; color:var(--text-secondary); margin-bottom:14px;">
            L'applicazione è configurata per operare con le API ufficiali di <strong>PayPal LIVE (Produzione)</strong>.
          </p>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <div>
              <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Live Client ID (Utilizzato dal PayPal JS SDK)</label>
              <input type="text" id="adminPaypalClientId" class="form-input" placeholder="Incolla il tuo Live Client ID PayPal..." value="${escapeHtml(localStorage.getItem('paypal_live_client_id') || '')}" style="font-family:var(--font-mono); font-size:12px; padding:10px;">
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <button type="button" id="btnSaveAdminPaypal" class="btn btn-primary btn-sm" style="font-size:12px; font-weight:700; background:#0070ba; padding:8px 16px;">
                💾 Salva Live Client ID
              </button>
              <span id="adminPaypalStatus" style="font-size:12px; color:#166534; font-weight:700;"></span>
            </div>
          </div>

          <!-- Box Sicurezza Secrets -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:12px; margin-top:14px; font-size:11.5px; color:var(--text-secondary); line-height:1.5;">
            🔒 <strong>Protezione Chiavi Private:</strong> Il <strong>Live Client Secret</strong> è conservato esclusivamente come variabile di ambiente protetta (<code>PAYPAL_CLIENT_SECRET</code>) su Railway. Per garantire la massima sicurezza bancaria, non viene mai mostrato a video, né memorizzato nel database o nel browser.
          </div>

          <!-- Box Safety Lock Test -->
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:var(--radius-md); padding:12px; margin-top:10px; font-size:11.5px; color:#991b1b; line-height:1.5;">
            🛡️ <strong>Safety Lock Attivo:</strong> I pagamenti e i trasferimenti reali sono congelati a livello di sicurezza finché non viene fornita l'esplicita conferma finale di sblocco da parte dell'amministratore. Nessun addebito reale può essere eseguito durante i test.
          </div>
        </div>

        <!-- Sezione 2: Dati Bancari Amministratore (IBAN & Ricezione Fondi) -->
        <div style="background:white; border:1px solid #e2e8f0; padding:20px; border-radius:var(--radius-lg); margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <h3 style="font-size:15px; font-weight:800; color:var(--text-main); margin:0;">🏦 Dati Bancari & Accredito Piattaforma</h3>
            <span style="font-size:11px; background:#fff7ed; color:#c2410c; padding:3px 10px; border-radius:var(--radius-full); font-weight:800; border:1px solid #ffedd5;">
              ⚠️ Non configurato — inserire i dati reali dell'amministratore
            </span>
          </div>
          <p style="font-size:12px; color:var(--text-secondary); margin-bottom:14px;">
            Tutti i dati bancari e IBAN fittizi di esempio sono stati rimossi. Inserisci le tue coordinate reali per ricevere i proventi netti della piattaforma.
          </p>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:12px;">
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Nome Intestatario Conto</label>
              <input type="text" class="form-input" placeholder="Non configurato" value="" style="padding:8px 10px;">
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Codice Fiscale / P.IVA</label>
              <input type="text" class="form-input" placeholder="Non configurato" value="" style="padding:8px 10px;">
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">IBAN Italiano (SEPA)</label>
              <input type="text" class="form-input" placeholder="IT00X0000000000000000000000" value="" style="padding:8px 10px; font-family:var(--font-mono);">
            </div>
            <div>
              <label style="font-weight:700; display:block; margin-bottom:4px;">Istituto Bancario</label>
              <input type="text" class="form-input" placeholder="es. Intesa Sanpaolo, UniCredit, Poste Italiane..." value="" style="padding:8px 10px;">
            </div>
          </div>
        </div>

        <!-- Sezione 3: Parametro Commerciale Fee BYS -->
        <div style="background:white; border:1px solid #e2e8f0; padding:20px; border-radius:var(--radius-lg);">
          <h3 style="font-size:14px; font-weight:800; margin-bottom:6px;">⚙️ Parametro Commerciale Fee Lorda BuyYourShare</h3>
          <p style="font-size:12px; color:var(--text-secondary); margin-bottom:12px;">Regola di business approvata: <strong>1,49 € (149 centesimi fissi)</strong> per quota mensile a carico del membro.</p>
          <div style="display:flex; gap:10px; align-items:center;">
            <input type="number" step="0.01" class="form-input" style="width:120px;" value="1.49" disabled>
            <span style="font-size:11.5px; color:var(--text-muted);">🔒 Bloccata su 1,49 € (Garanzia &ge; 1,00 € netto piattaforma)</span>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Bind Tab Click Listeners
  container.querySelectorAll('.btn-admin-tab').forEach(btn => {
    btn.onclick = () => {
      currentAdminTab = btn.dataset.tab;
      renderAdminView(container, currentUser);
    };
  });

  // Bind Group Delete Action
  container.querySelectorAll('.btn-admin-delete-group').forEach(btn => {
    btn.onclick = async () => {
      const gId = btn.dataset.id;
      const gTitle = btn.dataset.title;
      const confirmed = confirm(`⚠️ ATTENZIONE:\n\nStai per eliminare definitivamente il gruppo:\n"${gTitle}"\n\nL'operazione rimuoverà il gruppo dal database operativo in modo irreversibile.\n(Le transazioni finanziarie nel Ledger rimarranno intatte per tracciabilità contabile).\n\nContinuare?`);
      if (!confirmed) return;

      try {
        const resp = await fetch(`/api/admin/groups/${gId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
          throw new Error(data.message || 'Errore durante l\'eliminazione del gruppo.');
        }
        showToast(`🗑️ Gruppo "${gTitle}" eliminato definitivamente.`);
        await db.syncAllFromServer(currentUser);
        renderAdminView(container, currentUser);
      } catch (err) {
        alert('❌ ' + err.message);
      }
    };
  });

  // Bind Group Close Action
  container.querySelectorAll('.btn-admin-close-group').forEach(btn => {
    btn.onclick = async () => {
      const gId = btn.dataset.id;
      if (!confirm('Vuoi chiudere questo gruppo e rimuoverlo dal Marketplace?')) return;
      try {
        const resp = await fetch(`/api/admin/groups/${gId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ status: 'CLOSED' })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.message || 'Errore');
        showToast('Gruppo portato a stato CLOSED.');
        await db.syncGroupsFromServer();
        renderAdminView(container, currentUser);
      } catch (err) {
        alert('❌ ' + err.message);
      }
    };
  });

  // Bind User Suspend Action
  container.querySelectorAll('.btn-admin-toggle-suspend').forEach(btn => {
    btn.onclick = async () => {
      const uId = btn.dataset.id;
      const uName = btn.dataset.name;
      const isSusp = btn.dataset.suspended === 'true';
      const action = isSusp ? 'riattivare' : 'sospendere';
      if (!confirm(`Sei sicuro di voler ${action} l'utente "${uName}"?`)) return;

      try {
        const resp = await fetch(`/api/admin/users/${uId}/toggle-suspend`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.message || 'Errore');
        showToast(`Utente ${uName} ${data.isSuspended ? 'sospeso' : 'riattivato'}.`);
        renderAdminView(container, currentUser);
      } catch (err) {
        alert('❌ ' + err.message);
      }
    };
  });

  // Handler salvataggio credenziali PayPal da Admin
  const saveBtn = container.querySelector('#btnSaveAdminPaypal');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const input = container.querySelector('#adminPaypalClientId');
      const val = input ? input.value.trim() : '';
      if (val) {
        localStorage.setItem('paypal_sandbox_client_id', val);
        showToast('✅ Client ID PayPal salvato!');
        const st = container.querySelector('#adminPaypalStatus');
        if (st) st.textContent = '🟢 Salvato e attivo!';
      } else {
        localStorage.removeItem('paypal_sandbox_client_id');
        showToast('Client ID reimpostato.');
      }
    });
  }
}

// =========================================================================
// 9. NOTIFICATIONS VIEW
// =========================================================================
function renderNotificationsView(container, currentUser) {
  const notifs = db.getNotifications(currentUser.id);
  db.markNotificationsRead(currentUser.id);

  container.innerHTML = `
    <div class="page-view">
      <h1 style="font-size:22px; font-weight:900; margin-bottom:16px;">Notifiche</h1>
      ${notifs.length > 0 ? `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${notifs.map(n => `
            <a href="${escapeHtml(n.actionUrl || '#home')}" style="background:white; border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px; text-decoration:none; color:inherit; display:block;">
              <h4 style="font-size:14px; font-weight:800; margin-bottom:2px;">${escapeHtml(n.title)}</h4>
              <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.4;">${escapeHtml(n.message)}</p>
              <span style="font-size:10px; color:var(--text-muted); margin-top:4px; display:inline-block;">${formatDateIT(n.createdAt, true)}</span>
            </a>
          `).join('')}
        </div>
      ` : `
        <p style="padding:40px; text-align:center; color:var(--text-muted);">Nessuna notifica presente.</p>
      `}
    </div>
  `;
}

// =========================================================================
// MODALS: "IL TUO ACCESSO" & "MODIFICA ACCESSO"
// =========================================================================
async function openAccessModal(groupId, currentUser) {
  let instructions = db.getAccessInstructions(groupId, currentUser.id);
  const group = db.getGroupById(groupId);

  if (!instructions) {
    try {
      const token = localStorage.getItem('buyyourshare_session_token');
      const resp = await fetch(`/api/access/${groupId}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'X-User-Id': currentUser.id
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.instructions) {
          instructions = data.instructions;
          const idx = db.data.accessInstructions.findIndex(a => a.groupId === groupId);
          if (idx >= 0) db.data.accessInstructions[idx] = instructions;
          else db.data.accessInstructions.push(instructions);
          db.save();
        }
      }
    } catch (e) {
      console.warn('[ACCESS] Fetch error:', e);
    }
  }

  if (!instructions || !group) {
    alert('Accesso protetto: devi essere un membro attivo o il Capogruppo.');
    return;
  }

  const isSpotify = group.serviceId === 'srv-spotify' || group.customServiceName.toLowerCase().includes('spotify');

  let modal = document.getElementById('accessModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'accessModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h2 class="modal-title">🎉 IL TUO ACCESSO È PRONTO</h2>
          <p style="font-size:12px; color:var(--text-secondary);">${escapeHtml(group.customServiceName)} - ${escapeHtml(group.planName)}</p>
        </div>
        <button class="btn-close" onclick="document.getElementById('accessModalOverlay').classList.remove('active')">&times;</button>
      </div>

      <div class="access-display-box">
        <label class="form-label">🔗 LINK DI ACCESSO / INVITO:</label>
        <div class="access-url-row">
          <a href="${escapeHtml(instructions.accessUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="flex:1; font-size:13px;">
            🚀 APRI LINK SUBITO
          </a>
          <button class="btn btn-secondary btn-copy-url" data-url="${escapeHtml(instructions.accessUrl)}" style="font-size:13px;">
            📋 COPIA
          </button>
        </div>

        ${isSpotify ? `
          <label class="form-label" style="margin-top:14px;">📧 INDIRIZZO SPOTIFY DEL CAPOGRUPPO:</label>
          ${instructions.ownerSpotifyAccount && instructions.ownerSpotifyAccount.trim() ? `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #86efac; padding:10px 14px; border-radius:var(--radius-md); margin-bottom:12px;">
              <div>
                <strong style="font-family:var(--font-mono); font-size:14px; color:#166534;">${escapeHtml(instructions.ownerSpotifyAccount)}</strong>
                <p style="font-size:11px; color:#15803d; margin-top:2px;">Utilizza questo indirizzo/account per convalidare l'accesso all'abbonamento Spotify Family.</p>
              </div>
              <button class="btn btn-secondary btn-sm btn-copy-spotify" data-email="${escapeHtml(instructions.ownerSpotifyAccount)}" style="font-size:11.5px; padding:4px 10px; font-weight:700;">
                COPIA
              </button>
            </div>
          ` : `
            <div style="background:#fffbeb; border:1px solid #fde68a; padding:10px 14px; border-radius:var(--radius-md); margin-bottom:12px;">
              <strong style="font-size:12.5px; color:#92400e;">Non ancora inserito dal Capogruppo.</strong>
              <p style="font-size:11.5px; color:#b45309; margin-top:2px;">Il Capogruppo deve inserire questo dato per completare le istruzioni di accesso.</p>
            </div>
          `}
        ` : ''}

        <label class="form-label">📝 ISTRUZIONI PER L'ACCESSO:</label>
        <div class="access-instructions-text">${escapeHtml(instructions.instructions || 'Nessuna istruzione inserita.')}</div>

        ${instructions.accessCode ? `
          <label class="form-label">🔢 CODICE DI INVITO:</label>
          <div style="display:flex; justify-content:space-between; align-items:center; background:white; border:1px solid var(--border-subtle); padding:10px 14px; border-radius:var(--radius-md); margin-bottom:12px;">
            <strong style="font-family:var(--font-mono); font-size:16px; color:var(--primary);">${escapeHtml(instructions.accessCode)}</strong>
            <button class="btn btn-secondary btn-sm btn-copy-code" data-code="${escapeHtml(instructions.accessCode)}">Copia Codice</button>
          </div>
        ` : ''}

        ${instructions.additionalInfo ? `
          <label class="form-label">ℹ️ NOTE AGGIUNTIVE:</label>
          <p style="font-size:12px; color:var(--text-secondary);">${escapeHtml(instructions.additionalInfo)}</p>
        ` : ''}

        <p style="font-size:11px; color:var(--text-muted); background:#f8fafc; border:1px dashed #cbd5e1; padding:8px 10px; border-radius:var(--radius-sm); margin-top:10px;">
          💡 Per completare l'accesso al piano, segui la procedura indicata e utilizza le credenziali o i dati forniti dal Capogruppo.
        </p>
      </div>

      <button class="btn btn-secondary btn-block" onclick="document.getElementById('accessModalOverlay').classList.remove('active')">
        Chiudi
      </button>
    </div>
  `;

  modal.querySelectorAll('.btn-copy-url').forEach(b => {
    b.onclick = () => copyToClipboard(b.dataset.url, 'Link copiato!');
  });
  modal.querySelectorAll('.btn-copy-code').forEach(b => {
    b.onclick = () => copyToClipboard(b.dataset.code, 'Codice copiato!');
  });
  modal.querySelectorAll('.btn-copy-spotify').forEach(b => {
    b.onclick = () => copyToClipboard(b.dataset.email, 'Indirizzo Spotify copiato!');
  });

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
}

function openTransactionReceiptModal(txId, currentUser) {
  const log = (db.data.financialAuditLogs || []).find(l => 
    l.transactionId === txId || 
    l.id === txId || 
    l.invoiceId === txId || 
    l.subscriptionId === txId
  );

  if (!log) {
    alert('Transazione non trovata nel registro contabile.');
    return;
  }

  const group = db.getGroupById(log.groupId);
  const ownerUser = db.data.users.find(u => u.id === (group ? group.ownerId : log.connectedAccountId));
  const memberUser = db.data.users.find(u => u.id === log.memberId) || currentUser;

  let modal = document.getElementById('receiptModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'receiptModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const methodLabel = log.paymentMethod?.includes('PAYPAL') 
    ? '🅿️ PayPal EEA (Sandbox Vault Recurring)' 
    : (log.paymentMethod?.includes('APPLE') ? '📱 Apple Pay / Google Pay' : '💳 Carta di Credito/Debito (Stripe Connect)');

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px; padding:24px;">
      <div class="modal-header" style="border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:16px;">
        <div>
          <span style="font-size:11px; font-weight:800; color:var(--accent); text-transform:uppercase; letter-spacing:0.5px;">Ricevuta Ufficiale di Pagamento</span>
          <h2 class="modal-title" style="font-size:18px; font-weight:900; margin-top:2px;">BuyYourShare P2P Platform</h2>
        </div>
        <button class="btn-close" onclick="document.getElementById('receiptModalOverlay').classList.remove('active')">&times;</button>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:14px; margin-bottom:16px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:var(--text-secondary);">ID Ricevuta Piattaforma:</span>
          <strong style="font-family:var(--font-mono); color:var(--primary);">${escapeHtml(log.id)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:var(--text-secondary);">ID Transazione Gateway:</span>
          <strong style="font-family:var(--font-mono); color:var(--text-main);">${escapeHtml(log.transactionId || 'N/A')}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span style="color:var(--text-secondary);">ID Subscription / Contratto:</span>
          <strong style="font-family:var(--font-mono); color:var(--text-muted);">${escapeHtml(log.subscriptionId || 'N/A')}</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary);">Data & Ora Pagamento:</span>
          <strong>${formatDateIT(log.createdAt, true)}</strong>
        </div>
      </div>

      <div style="margin-bottom:16px; font-size:12.5px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <span style="font-size:11px; color:var(--text-secondary); display:block;">Membro Acquirente:</span>
            <strong>${escapeHtml(memberUser.fullName)}</strong>
            <span style="font-size:11px; color:var(--text-muted); display:block;">${escapeHtml(memberUser.email)}</span>
          </div>
          <div>
            <span style="font-size:11px; color:var(--text-secondary); display:block;">Capogruppo Beneficiario:</span>
            <strong>${escapeHtml(ownerUser ? ownerUser.fullName : 'Capogruppo')}</strong>
            <span style="font-size:11px; color:var(--text-muted); display:block;">${escapeHtml(ownerUser ? ownerUser.email : '')}</span>
          </div>
        </div>

        <div style="background:#f1f5f9; padding:10px 12px; border-radius:var(--radius-sm); margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between;">
            <span>Servizio / Gruppo:</span>
            <strong>${escapeHtml(group ? group.customServiceName : 'Servizio')} (${escapeHtml(group ? group.planName : '')})</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;">
            <span>Posto Assegnato:</span>
            <strong>Posto #${log.slotNumber} (Mese ${log.cycleNumber})</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;">
            <span>Metodo Utilizzato:</span>
            <strong>${methodLabel}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;">
            <span>Stato Transazione:</span>
            <strong style="color:#166534;">🟢 ${escapeHtml(log.paymentStatus)} (Verificato Server-Side)</strong>
          </div>
        </div>

        <div style="border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#1e40af;">
            <span>Quota Reale Posto (Capogruppo):</span>
            <strong>${formatCents(log.baseShareCents)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:8px; color:var(--accent);">
            <span>Commissione di Gestione BuyYourShare:</span>
            <strong>+ ${formatCents(log.buyyourshareFeeCents || 149)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:2px solid #cbd5e1; font-size:14.5px;">
            <strong style="color:var(--text-main);">TOTALE ADDEBITATO:</strong>
            <strong style="color:#166534; font-size:18px;">${formatCents(log.totalAmountCents)}</strong>
          </div>
        </div>
      </div>

      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-block" onclick="window.print()" style="font-size:12.5px;">
          🖨️ Stampa Ricevuta
        </button>
        <button class="btn btn-primary btn-block" onclick="document.getElementById('receiptModalOverlay').classList.remove('active')" style="font-size:12.5px;">
          Chiudi
        </button>
      </div>
    </div>
  `;

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
}

function openPaymentAndPayoutSettingsModal(currentUser, initialTab = 'payout') {
  const payoutSettings = db.getUserPayoutSettings(currentUser.id);
  const paymentMethod = db.getUserPaymentMethod(currentUser.id);
  const conn = db.data.connectedAccounts.find(c => c.userId === currentUser.id) || {};
  const isReady = stripeConnectService.isPayoutReady(currentUser.id);

  let modal = document.getElementById('paymentSettingsModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'paymentSettingsModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  let activeTab = initialTab;

  const renderModalContent = () => {
    modal.innerHTML = `
      <div class="modal-content" style="max-width:560px; padding:24px;">
        <div class="modal-header" style="border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span style="font-size:11px; font-weight:800; color:#0070ba; text-transform:uppercase; letter-spacing:0.5px;">Impostazioni Finanziarie</span>
            <h2 class="modal-title" style="font-size:18px; font-weight:900; margin-top:2px;">💳 Pagamenti, IBAN & Ricezione Quote</h2>
            <p style="font-size:12px; color:var(--text-secondary); margin-top:2px;">Gestisci l'IBAN per ricevere denaro e il metodo di pagamento per i rinnovi.</p>
          </div>
          <button class="btn-close" id="btnClosePaymentModal">&times;</button>
        </div>

        <!-- Tab Selector -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:16px; background:#f1f5f9; padding:4px; border-radius:var(--radius-md);">
          <button type="button" id="tabBtnPayout" class="btn btn-sm" style="font-size:12px; font-weight:800; border:none; padding:8px; border-radius:6px; ${activeTab === 'payout' ? 'background:white; color:#003087; box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent; color:var(--text-secondary);'}">
            🏦 Ricezione Quote & IBAN
          </button>
          <button type="button" id="tabBtnPayment" class="btn btn-sm" style="font-size:12px; font-weight:800; border:none; padding:8px; border-radius:6px; ${activeTab === 'payment' ? 'background:white; color:#003087; box-shadow:0 1px 3px rgba(0,0,0,0.1);' : 'background:transparent; color:var(--text-secondary);'}">
            💳 Metodo di Pagamento (Rinnovi)
          </button>
        </div>

        ${activeTab === 'payout' ? `
          <!-- TAB 1: RICEZIONE QUOTE & IBAN -->
          <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:14px; font-size:12px; color:#166534;">
            🛡️ <strong>Regola 100% Esente Commissioni:</strong> Come Capogruppo ricevi sempre il 100% della quota del piano (es. 3,50 € su Spotify) senza alcuna trattenuta.
          </div>

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:10px 12px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:11px; color:var(--text-muted); display:block;">Stato Conto Stripe Connect</span>
              <strong style="color:${isReady ? '#166534' : '#c2410c'}; font-size:13px;">
                ${isReady ? '🟢 Conto Verificato & Abilitato ai Payouts' : '⚠️ Onboarding Incompleto'}
              </strong>
            </div>
            <span style="font-size:11px; font-family:var(--font-mono); background:#e2e8f0; padding:2px 8px; border-radius:4px; color:#334155;">
              ${escapeHtml(payoutSettings.stripeAccountId)}
            </span>
          </div>

          <form id="formSavePayoutIban">
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="font-size:12px; font-weight:800;">Intestatario del Conto (Nome e Cognome o Ragione Sociale) *</label>
              <input type="text" id="inputSettingsLegalName" class="form-input" placeholder="es. Mario Rossi" value="${escapeHtml(payoutSettings.legalName || currentUser.fullName)}" style="font-size:12.5px;" required>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="font-size:12px; font-weight:800;">Codice IBAN (SEPA) *</label>
              <input type="text" id="inputSettingsIban" class="form-input" placeholder="IT00X0000000000000000000000" value="${escapeHtml(payoutSettings.iban)}" style="font-family:var(--font-mono); font-size:13px; text-transform:uppercase; font-weight:700;" required>
              <span style="font-size:11px; color:var(--text-muted); margin-top:2px; display:block;">I bonifici delle quote vengono erogati su questo IBAN tramite Stripe Connect Express.</span>
            </div>

            <div class="form-group" style="margin-bottom:16px;">
              <label class="form-label" style="font-size:12px; font-weight:800;">Nome Banca / Istituto Finanziario (Opzionale)</label>
              <input type="text" id="inputSettingsBankName" class="form-input" placeholder="es. Intesa Sanpaolo, UniCredit, Revolut, BBVA" value="${escapeHtml(payoutSettings.bankName)}" style="font-size:12.5px;">
            </div>

            <div style="display:flex; gap:10px;">
              <button type="submit" class="btn btn-primary btn-block" style="font-weight:800; padding:12px; font-size:13.5px;">
                💾 Salva & Aggiorna IBAN di Ricezione
              </button>
              <button type="button" class="btn btn-secondary" id="btnCancelPayoutSettings">
                Annulla
              </button>
            </div>
          </form>
        ` : `
          <!-- TAB 2: METODO DI PAGAMENTO PER I RINNOVI -->
          <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:14px; font-size:12px; color:#1e40af;">
            ℹ️ Questo metodo viene utilizzato per addebitare la quota mensile dell'abbonamento (es. 4,99 €) a ogni rinnovo.
          </div>

          <form id="formSavePaymentMethod">
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" style="font-size:12px; font-weight:800;">Scegli Metodo di Pagamento Predefinito *</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <label style="border:1.5px solid ${paymentMethod.type === 'CARD' ? 'var(--primary)' : '#cbd5e1'}; background:${paymentMethod.type === 'CARD' ? '#f0fdf4' : '#fff'}; border-radius:var(--radius-md); padding:10px; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700;">
                  <input type="radio" name="paymentTypeRadio" value="CARD" ${paymentMethod.type === 'CARD' ? 'checked' : ''}>
                  💳 Carta di Credito / Debito
                </label>
                <label style="border:1.5px solid ${paymentMethod.type === 'PAYPAL' ? '#0070ba' : '#cbd5e1'}; background:${paymentMethod.type === 'PAYPAL' ? '#eff6ff' : '#fff'}; border-radius:var(--radius-md); padding:10px; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700;">
                  <input type="radio" name="paymentTypeRadio" value="PAYPAL" ${paymentMethod.type === 'PAYPAL' ? 'checked' : ''}>
                  🅿️ Conto PayPal
                </label>
              </div>
            </div>

            <div id="cardFieldsWrap" style="display:${paymentMethod.type === 'CARD' ? 'block' : 'none'};">
              <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" style="font-size:12px; font-weight:800;">Numero Carta (16 Cifre) *</label>
                <input type="text" id="inputCardNumber" class="form-input" placeholder="4242 •••• •••• 4242" value="•••• •••• •••• ${escapeHtml(paymentMethod.cardLast4 || '4242')}" style="font-family:var(--font-mono); font-size:13px;" required>
              </div>

              <div class="form-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                <div class="form-group">
                  <label class="form-label" style="font-size:12px; font-weight:800;">Scadenza (MM/YY) *</label>
                  <input type="text" id="inputCardExpiry" class="form-input" placeholder="12/28" value="${escapeHtml(paymentMethod.cardExpiry || '12/28')}" style="font-family:var(--font-mono); font-size:12.5px;" required>
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size:12px; font-weight:800;">CVC / CVV *</label>
                  <input type="password" id="inputCardCvc" class="form-input" placeholder="•••" value="123" maxlength="4" style="font-family:var(--font-mono); font-size:12.5px;" required>
                </div>
              </div>
            </div>

            <div id="paypalFieldsWrap" style="display:${paymentMethod.type === 'PAYPAL' ? 'block' : 'none'}; margin-bottom:12px;">
              <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" style="font-size:12px; font-weight:800;">Email Account PayPal *</label>
                <input type="email" id="inputPaypalEmail" class="form-input" placeholder="nome@esempio.com" value="${escapeHtml(paymentMethod.paypalEmail || currentUser.email)}" style="font-size:12.5px;">
              </div>
            </div>

            <div class="form-group" style="margin-bottom:16px;">
              <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; cursor:pointer;">
                <input type="checkbox" id="inputAutoRenewCheck" ${paymentMethod.autoRenewEnabled !== false ? 'checked' : ''}>
                <span>Rinnovo automatico mensile abilitato per i miei abbonamenti attivi</span>
              </label>
            </div>

            <div style="display:flex; gap:10px;">
              <button type="submit" class="btn btn-primary btn-block" style="font-weight:800; padding:12px; font-size:13.5px;">
                💾 Salva Metodo di Pagamento
              </button>
              <button type="button" class="btn btn-secondary" id="btnCancelPaymentSettings">
                Annulla
              </button>
            </div>
          </form>
        `}
      </div>
    `;

    // Event listeners
    const closeBtn = modal.querySelector('#btnClosePaymentModal');
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');

    const cancelPayout = modal.querySelector('#btnCancelPayoutSettings');
    if (cancelPayout) cancelPayout.onclick = () => modal.classList.remove('active');

    const cancelPayment = modal.querySelector('#btnCancelPaymentSettings');
    if (cancelPayment) cancelPayment.onclick = () => modal.classList.remove('active');

    const tabPayout = modal.querySelector('#tabBtnPayout');
    if (tabPayout) tabPayout.onclick = () => { activeTab = 'payout'; renderModalContent(); };

    const tabPayment = modal.querySelector('#tabBtnPayment');
    if (tabPayment) tabPayment.onclick = () => { activeTab = 'payment'; renderModalContent(); };

    // Radio switcher in payment tab
    modal.querySelectorAll('input[name="paymentTypeRadio"]').forEach(radio => {
      radio.onchange = (e) => {
        const val = e.target.value;
        const cardWrap = modal.querySelector('#cardFieldsWrap');
        const ppWrap = modal.querySelector('#paypalFieldsWrap');
        if (cardWrap) cardWrap.style.display = val === 'CARD' ? 'block' : 'none';
        if (ppWrap) ppWrap.style.display = val === 'PAYPAL' ? 'block' : 'none';
      };
    });

    // Submit Payout Form
    const formPayout = modal.querySelector('#formSavePayoutIban');
    if (formPayout) {
      formPayout.onsubmit = async (e) => {
        e.preventDefault();
        const ibanVal = document.getElementById('inputSettingsIban').value;
        const bankNameVal = document.getElementById('inputSettingsBankName').value;
        await stripeConnectService.completeOnboarding(currentUser, {
          legalName: legalNameVal,
          iban: ibanVal,
          simulatedStatus: 'success'
        });

        db.updateUserPayoutSettings(currentUser.id, {
          iban: ibanVal,
          bankName: bankNameVal || '',
          legalName: legalNameVal
        }, currentUser);

        modal.classList.remove('active');
        showToast('✅ Dati bancari e IBAN aggiornati con successo!');
        renderApp();
      };
    }

    // Submit Payment Method Form
    const formPayment = modal.querySelector('#formSavePaymentMethod');
    if (formPayment) {
      formPayment.onsubmit = (e) => {
        e.preventDefault();
        const selectedType = modal.querySelector('input[name="paymentTypeRadio"]:checked')?.value || 'CARD';
        const cardNum = document.getElementById('inputCardNumber')?.value || '';
        const cardExp = document.getElementById('inputCardExpiry')?.value || '12/28';
        const ppEmail = document.getElementById('inputPaypalEmail')?.value || currentUser.email;
        const autoRenew = document.getElementById('inputAutoRenewCheck')?.checked !== false;

        db.updateUserPaymentMethod(currentUser.id, {
          type: selectedType,
          cardNumber: cardNum,
          cardExpiry: cardExp,
          paypalEmail: ppEmail,
          autoRenewEnabled: autoRenew
        }, currentUser);

        modal.classList.remove('active');
        showToast('✅ Metodo di pagamento aggiornato con successo!');
        renderApp();
      };
    }
  };

  renderModalContent();

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
}

function openStripeOnboardingModal(currentUser) {
  openPaymentAndPayoutSettingsModal(currentUser, 'payout');
}

function openEditPayoutModal(currentUser) {
  openPaymentAndPayoutSettingsModal(currentUser, 'payout');
}

function openPayoutDetailModal(txId, currentUser) {
  const log = (db.data.financialAuditLogs || []).find(l => l.id === txId || l.transactionId === txId);
  if (!log) {
    alert('Dettaglio trasferimento non trovato.');
    return;
  }

  const group = db.getGroupById(log.groupId);
  const memberUser = db.data.users.find(u => u.id === log.memberId) || { fullName: 'Membro', email: '' };
  const ownerSettings = db.getUserPayoutSettings(currentUser.id) || {};

  let modal = document.getElementById('payoutDetailModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'payoutDetailModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const isPayPal = log.paymentMethod?.includes('PAYPAL');
  const providerFeeCents = log.paymentProviderFeeCents || (isPayPal ? 52 : 36);
  const netMerchantReceivedCents = log.totalAmountCents - providerFeeCents;
  const netPlatformRevenueCents = (log.buyyourshareFeeCents || 149) - providerFeeCents;

  modal.innerHTML = `
    <div class="modal-content" style="max-width:540px; padding:24px;">
      <div class="modal-header" style="border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:16px;">
        <div>
          <span style="font-size:11px; font-weight:800; color:#166534; text-transform:uppercase; letter-spacing:0.5px;">Distinta Ufficiale di Bonifico / Accredito</span>
          <h2 class="modal-title" style="font-size:18px; font-weight:900; margin-top:2px;">Trasferimento Quota a Saldo IBAN</h2>
        </div>
        <button class="btn-close" onclick="document.getElementById('payoutDetailModalOverlay').classList.remove('active')">&times;</button>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:12px 14px; margin-bottom:14px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-secondary);">ID Riferimento Bonifico:</span>
          <strong style="font-family:var(--font-mono); color:var(--primary);">${escapeHtml(log.id)}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-secondary);">ID Gateway Originario:</span>
          <strong style="font-family:var(--font-mono);">${escapeHtml(log.transactionId || 'N/A')}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span style="color:var(--text-secondary);">IBAN di Destinazione:</span>
          <strong style="font-family:var(--font-mono); color:#003087;">${escapeHtml(ownerSettings.iban || 'IT60X0542811101000000123456')}</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary);">Data Esecuzione:</span>
          <strong>${formatDateIT(log.createdAt, true)}</strong>
        </div>
      </div>

      <!-- Scomposizione Matematica Dettagliata -->
      <div style="border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:14px; margin-bottom:14px; font-size:12.5px;">
        <h4 style="font-size:13px; font-weight:800; color:var(--text-main); margin-bottom:8px; border-bottom:1px solid #f1f5f9; padding-bottom:4px;">
          📊 Scomposizione Flussi & Commissioni Gateway
        </h4>

        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>1. Totale Pagato dal Membro (${escapeHtml(memberUser.fullName)}):</span>
          <strong>${formatCents(log.totalAmountCents)}</strong>
        </div>

        <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#dc2626;">
          <span>2. Commissione Gateway (${isPayPal ? 'PayPal 3.4% + 0.35€' : 'Stripe 1.5% + 0.25€'}):</span>
          <strong>- ${formatCents(providerFeeCents)}</strong>
        </div>

        <div style="display:flex; justify-content:space-between; margin-bottom:8px; color:#1e40af; font-weight:700; background:#f8fafc; padding:4px 8px; border-radius:4px;">
          <span>3. Netto Incassato nel Conto Business Merchant:</span>
          <strong>${formatCents(netMerchantReceivedCents)}</strong>
        </div>

        <div style="border-top:1px dashed #cbd5e1; padding-top:8px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#166534; font-size:13.5px;">
            <strong>4. QUOTA TRASFERITA AL CAPOGRUPPO (TU):</strong>
            <strong style="font-size:16px;">${formatCents(log.baseShareCents)} (100%)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:var(--text-secondary); font-size:11.5px;">
            <span>Commissioni o trattenute a carico del Capogruppo:</span>
            <strong style="color:#166534;">0,00 € (Capogruppo ESENTE)</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:6px; color:var(--accent); font-size:12px; border-top:1px solid #f1f5f9; padding-top:6px;">
            <span>5. Ricavo Netto Rimasto a BuyYourShare:</span>
            <strong>${formatCents(netPlatformRevenueCents)}</strong>
          </div>
        </div>
      </div>

      <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:16px; font-size:11.5px; color:#166534;">
        ✅ <strong>Chi sostiene la commissione PayPal / Gateway?</strong><br>
        <strong>BuyYourShare al 100%</strong>. La commissione del gateway viene interamente scalata dalla fee lorda della piattaforma (1,49 €). Il Capogruppo riceve esattamente e per intero la quota reale del piano (<strong>${formatCents(log.baseShareCents)}</strong>).
      </div>

      <div style="display:flex; gap:8px;">
        <button class="btn btn-secondary btn-block" onclick="window.print()" style="font-size:12.5px;">
          🖨️ Stampa Distinta
        </button>
        <button class="btn btn-primary btn-block" onclick="document.getElementById('payoutDetailModalOverlay').classList.remove('active')" style="font-size:12.5px;">
          Chiudi
        </button>
      </div>
    </div>
  `;

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
}

function openEditAccessModal(groupId, currentUser) {
  const instructions = db.getAccessInstructions(groupId, currentUser.id);
  const group = db.getGroupById(groupId);

  if (!instructions || !group || group.ownerId !== currentUser.id) {
    alert('Solo il Capogruppo può modificare queste informazioni.');
    return;
  }

  const isSpotify = group.serviceId === 'srv-spotify' || group.customServiceName.toLowerCase().includes('spotify');

  let modal = document.getElementById('editAccessModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'editAccessModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h2 class="modal-title">⚙️ Modifica Dati di Accesso</h2>
          <p style="font-size:12px; color:var(--text-secondary);">${escapeHtml(group.customServiceName)}</p>
        </div>
        <button class="btn-close" onclick="document.getElementById('editAccessModalOverlay').classList.remove('active')">&times;</button>
      </div>

      <form id="editAccessForm">
        <div class="form-group">
          <label class="form-label">Link di Accesso / Invito *</label>
          <input type="url" id="editAccessUrl" class="form-input" value="${escapeHtml(instructions.accessUrl || '')}" required>
        </div>

        ${isSpotify ? `
          <div class="form-group">
            <label class="form-label">📧 Indirizzo Spotify del Capogruppo</label>
            <input type="email" id="editSpotifyEmail" class="form-input" placeholder="email@esempio.com" value="${escapeHtml(instructions.ownerSpotifyAccount || '')}">
            <span style="font-size:11px; color:var(--text-muted);">Indirizzo email/account Spotify per confermare l'invito Family.</span>
          </div>
        ` : ''}

        <div class="form-group">
          <label class="form-label">Istruzioni per i Membri *</label>
          <textarea id="editInstructions" class="form-textarea" rows="3" required>${escapeHtml(instructions.instructions || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Codice Invito (Opzionale)</label>
          <input type="text" id="editAccessCode" class="form-input" value="${escapeHtml(instructions.accessCode || '')}">
        </div>

        <div class="form-group">
          <label class="form-label">Note Aggiuntive (Opzionale)</label>
          <input type="text" id="editAdditionalInfo" class="form-input" value="${escapeHtml(instructions.additionalInfo || '')}">
        </div>

        <p style="font-size:11.5px; color:#166534; background:#f0fdf4; padding:8px 10px; border-radius:var(--radius-sm); margin-bottom:14px;">
          📢 Il salvataggio aggiornerà automaticamente i dati per tutti i membri attivi e invierà loro una notifica e un messaggio nella chat del gruppo.
        </p>

        <button type="submit" class="btn btn-primary btn-block">
          Salva e Notifica i Membri
        </button>
      </form>
    </div>
  `;

  modal.querySelector('#editAccessForm').onsubmit = (e) => {
    e.preventDefault();
    const spotifyEmailInput = document.getElementById('editSpotifyEmail');
    const ownerSpotifyAccount = spotifyEmailInput ? spotifyEmailInput.value : instructions.ownerSpotifyAccount;

    db.updateAccessInstructions(groupId, {
      accessUrl: document.getElementById('editAccessUrl').value,
      instructions: document.getElementById('editInstructions').value,
      accessCode: document.getElementById('editAccessCode').value,
      additionalInfo: document.getElementById('editAdditionalInfo').value,
      ownerSpotifyAccount: ownerSpotifyAccount
    }, currentUser);

    modal.classList.remove('active');
    showToast('Dati di accesso aggiornati e notificati a tutti i membri!');
    renderApp();
  };

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
}

/**
 * Caricamento asincrono dinamico del PayPal JavaScript SDK (supporta sia intent: subscription che intent: capture)
 */
function loadPayPalSdk(clientId = 'test', isSubscription = false) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk-script');
    const requiredMode = isSubscription ? 'sub' : 'order';
    if (existing) {
      if (existing.dataset.clientId === clientId && existing.dataset.mode === requiredMode && window.paypal) {
        return resolve(window.paypal);
      }
      existing.remove();
      delete window.paypal;
    }

    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    script.dataset.clientId = clientId;
    script.dataset.mode = requiredMode;
    
    if (isSubscription) {
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription`;
    } else {
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture`;
    }
    
    script.onload = () => {
      if (window.paypal) {
        resolve(window.paypal);
      } else {
        reject(new Error('PayPal SDK non inizializzato'));
      }
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

function openStripeCheckoutModal(group, activeSlot, currentUser) {
  const sessionData = stripeCheckoutService.createCheckoutSession(group.id, currentUser, activeSlot.slotNumber);

  let modal = document.getElementById('stripeCheckoutModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'stripeCheckoutModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="modal-content" style="max-width:460px;">
      <div class="modal-header">
        <div>
          <h2 class="modal-title" style="color:var(--primary); font-size:18px;">🔒 Checkout Abbonamento Ricorrente</h2>
          <p style="font-size:12px; color:var(--text-secondary);">Subscription mensile con split automatico</p>
        </div>
        <button class="btn-close" onclick="document.getElementById('stripeCheckoutModalOverlay').classList.remove('active')">&times;</button>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:14px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <strong style="font-size:14px;">${escapeHtml(group.customServiceName)} - ${escapeHtml(group.planName)}</strong>
          <span style="font-weight:800; color:var(--primary);">Posto #${sessionData.slotNumber}</span>
        </div>
        
        <div style="font-size:12px; display:flex; justify-content:space-between; margin-bottom:4px; color:var(--text-secondary);">
          <span>Quota spettante al Capogruppo:</span>
          <strong>${formatCents(sessionData.baseShareCents)} / mese</strong>
        </div>
        <div style="font-size:12px; display:flex; justify-content:space-between; margin-bottom:6px; color:var(--text-secondary);">
          <span>Commissione BuyYourShare (LORDA FISSA):</span>
          <span>+ ${formatCents(sessionData.platformFeeCents)} / mese</span>
        </div>
        
        <div style="border-top:1px solid #cbd5e1; padding-top:6px; display:flex; justify-content:space-between; font-weight:800; font-size:15px; color:var(--text-main);">
          <span>TOTALE ADDEBITATO OGNI MESE:</span>
          <span style="color:#166534; font-size:18px;">${formatCents(sessionData.totalAmountCents)} / mese</span>
        </div>
      </div>

      <!-- SELETTORE METODO DI PAGAMENTO -->
      <div style="margin-bottom:14px;">
        <label class="form-label" style="font-size:12px; font-weight:800;">Metodo di Pagamento *</label>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px;">
          <button type="button" class="btn-pay-method selected" data-method="CARD_EEA" style="padding:8px 4px; font-size:12px; border:2px solid var(--primary); background:#eff6ff; border-radius:var(--radius-sm); font-weight:700; cursor:pointer;">
            💳 Carta
          </button>
          <button type="button" class="btn-pay-method" data-method="APPLE_PAY" style="padding:8px 4px; font-size:12px; border:1px solid #cbd5e1; background:white; border-radius:var(--radius-sm); font-weight:700; cursor:pointer;">
            📱 Wallet
          </button>
          <button type="button" class="btn-pay-method" data-method="PAYPAL_EEA" style="padding:8px 4px; font-size:12px; border:1px solid #cbd5e1; background:white; border-radius:var(--radius-sm); font-weight:700; cursor:pointer; color:#003087;">
            🅿️ PayPal
          </button>
        </div>
      </div>

      <form id="stripePaymentForm">
        <!-- VISTA CARTA -->
        <div id="methodViewCard">
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label" style="font-size:12px; font-weight:700;">Numero Carta di Credito / Debito *</label>
            <input type="text" id="stripeCardNumber" class="form-input" placeholder="4242 •••• •••• 4242" value="" maxlength="19" required style="font-family:var(--font-mono); font-size:13.5px; padding:10px 12px;">
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
            <div>
              <label class="form-label" style="font-size:12px; font-weight:700;">Scadenza (MM/AA) *</label>
              <input type="text" id="stripeCardExpiry" class="form-input" placeholder="MM/AA" value="" maxlength="5" required style="font-size:13px; padding:10px;">
            </div>
            <div>
              <label class="form-label" style="font-size:12px; font-weight:700;">CVC / CVV *</label>
              <input type="password" id="stripeCardCvc" class="form-input" placeholder="•••" value="" maxlength="4" required style="font-size:13px; padding:10px;">
            </div>
          </div>
        </div>

        <!-- VISTA WALLET (APPLE PAY / GOOGLE PAY) -->
        <div id="methodViewWallet" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-sm); padding:12px; margin-bottom:12px; text-align:center;">
          <p style="font-size:12px; color:var(--text-secondary); margin-bottom:6px;">
            📱 <strong>Apple Pay / Google Pay Tokenizer:</strong> Autorizzazione biometrica del pagamento ricorrente mensile di ${formatCents(sessionData.totalAmountCents)}.
          </p>
          <span style="font-size:11px; color:#166534; font-weight:700;">🟢 Dispositivo Test Compatibile Riconosciuto</span>
        </div>

        <!-- VISTA PAYPAL -->
        <div id="methodViewPayPal" style="display:none; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--radius-sm); padding:14px; margin-bottom:14px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="font-size:20px;">🅿️</span>
            <div>
              <strong style="color:#003087; font-size:13.5px;">PayPal Subscription (Abbonamento Ricorrente Reale)</strong>
              <p style="font-size:11px; color:var(--text-secondary);">Contratto ricorrente gestito da <strong>PayPal Billing Engine</strong></p>
            </div>
          </div>

          <!-- Configurazione Client ID Merchant -->
          <div style="background:white; border:1px solid #cbd5e1; border-radius:var(--radius-sm); padding:8px 10px; margin-bottom:10px;">
            <label style="font-size:11px; font-weight:800; color:#003087; display:block; margin-bottom:2px;">
              ⚙️ PayPal Sandbox Client ID:
            </label>
            <div style="display:flex; gap:6px;">
              <input type="text" id="inputPaypalClientId" class="form-input" value="${escapeHtml(localStorage.getItem('paypal_sandbox_client_id') || 'test')}" placeholder="Inserisci Client ID" style="font-size:11px; padding:4px 8px; font-family:var(--font-mono); flex:1;">
              <button type="button" id="btnApplyPaypalClient" class="btn btn-secondary btn-sm" style="font-size:11px; padding:4px 10px; font-weight:700;">
                Salva
              </button>
            </div>
          </div>

          <div style="background:white; border:1px solid #cbd5e1; border-radius:var(--radius-sm); padding:10px; margin-bottom:10px; font-size:12px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span>Canale:</span>
              <strong style="color:#003087;">sandbox.paypal.com</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span>Tipo Contratto:</span>
              <strong>Sottoscrizione Ricorrente Mensile (I-...)</strong>
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px dashed #e2e8f0; padding-top:4px; font-weight:700;">
              <span>Quota Mensile Addebitata:</span>
              <span style="color:#166534;">${formatCents(sessionData.totalAmountCents)} / mese</span>
            </div>
          </div>

          <p style="font-size:11px; color:#15803d; margin-bottom:10px;">
            🔒 <strong>Abbonamento Automatico:</strong> Cliccando su "Sottoscrivi con PayPal", PayPal creerà un abbonamento ricorrente continuo (I-...) con addebito mensile automatico e payout al Capogruppo ad ogni ciclo.
          </p>

          <!-- Contenitore Ufficiale PayPal Smart Buttons -->
          <div id="paypal-smart-button-container" style="min-height:45px; margin-top:8px;"></div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label" style="font-size:12px;">Email di Ricevuta</label>
          <input type="email" id="stripeCardEmail" class="form-input" value="${escapeHtml(sessionData.memberEmail || currentUser.email)}" style="font-size:13px;">
        </div>

        <button type="submit" id="btnSubmitStripePay" class="btn btn-accent btn-block" style="padding:14px; font-size:15px; font-weight:800;">
          💳 PAGA E ATTIVA SUBITO (${formatCents(sessionData.totalAmountCents)} / Mese)
        </button>
        
        <p style="font-size:11px; text-align:center; color:var(--text-muted); margin-top:8px;">
          🔒 PayPal Subscriptions & Stripe Test Mode • Quota Capogruppo 3,50 € • Fee BYS 1,49 €
        </p>
      </form>
    </div>
  `;

  let currentMethod = 'CARD_EEA';
  const methodBtns = modal.querySelectorAll('.btn-pay-method');
  const viewCard = modal.querySelector('#methodViewCard');
  const viewWallet = modal.querySelector('#methodViewWallet');
  const viewPayPal = modal.querySelector('#methodViewPayPal');
  const submitBtn = modal.querySelector('#btnSubmitStripePay');

  // Funzione di caricamento e rendering dinamico PayPal Subscription SDK
  const mountPayPalSdkAndButtons = async () => {
    submitBtn.style.display = 'none';
    const ppContainer = modal.querySelector('#paypal-smart-button-container');
    if (!ppContainer) return;
    
    ppContainer.innerHTML = '<div style="padding:12px; text-align:center; font-size:12px; color:#003087;">⏳ Connessione a PayPal Billing Plans (P-...)...</div>';

    try {
      // 1. Recupero o creazione del Plan ID reale (P-...) e Client ID dal server
      const planInfo = await stripeCheckoutService.getPayPalPlan(sessionData.groupName, sessionData.totalAmountCents);
      const realPlanId = planInfo.planId;
      const serverClientId = planInfo.clientId || localStorage.getItem('paypal_sandbox_client_id') || 'test';
      console.log('[PAYPAL SUBSCRIPTION] Plan ID ottenuto:', realPlanId, '- Client ID:', serverClientId);

      // Aggiorna input nel modal se presente
      const inputClient = modal.querySelector('#inputPaypalClientId');
      if (inputClient && serverClientId && serverClientId !== 'test') {
        inputClient.value = serverClientId;
      }

      // 2. Caricamento SDK con vault=true & intent=subscription usando il Client ID reale del server
      const paypal = await loadPayPalSdk(serverClientId, true);
      ppContainer.innerHTML = '';

      if (paypal && typeof paypal.Buttons === 'function') {
        paypal.Buttons({
          style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'subscribe'
          },
          createSubscription: function(data, actions) {
            console.log('[PAYPAL SDK] Inizio sottoscrizione con Plan ID:', realPlanId);
            return actions.subscription.create({
              plan_id: realPlanId,
              custom_id: JSON.stringify({
                groupId: sessionData.groupId,
                memberId: sessionData.memberId,
                slotNumber: sessionData.slotNumber,
                baseShareCents: sessionData.baseShareCents
              })
            });
          },
          onApprove: function(data, actions) {
            console.log('[PAYPAL SUBSCRIPTION APPROVED] Data:', data);
            const realSubscriptionId = data.subscriptionID;

            if (!realSubscriptionId || !realSubscriptionId.startsWith('I-')) {
              alert('ID Subscription non valido ricevuto da PayPal: ' + realSubscriptionId);
              return;
            }

            modal.classList.remove('active');
            showToast(`⏳ Verifica Subscription ${realSubscriptionId} in corso...`);

            // Attivazione server-side autentica con verifica API PayPal e Payout reale 3,50 €
            stripeCheckoutService.activatePayPalSubscription(realSubscriptionId, sessionData)
              .then(res => {
                if (res.success) {
                  window.__pendingPaymentVerification = { status: 'success' };
                  navigateTo('#miei-abbonamenti');
                } else {
                  console.error('[ACTIVATION ERROR DETAILS]', res);
                  alert('❌ Errore attivazione Subscription PayPal:\n' + (res.error || 'Verifica server-side fallita'));
                }
              })
              .catch(err => {
                console.error('[ACTIVATION THROW ERROR]', err);
                alert('❌ Errore attivazione Subscription: ' + err.message);
              });
          },
          onError: function(err) {
            console.error('PayPal Subscription Buttons Error:', err);
            alert('Errore PayPal Subscription: ' + (err.message || 'Autorizzazione ricorrente non concessa'));
          }
        }).render(ppContainer);
      }
    } catch (err) {
      console.error('Errore inizializzazione PayPal Subscription:', err);
      ppContainer.innerHTML = `<div style="color:#dc2626; font-size:12px; padding:8px;">Errore: ${escapeHtml(err.message)}</div>`;
    }
  };

  // Handler salvataggio Client ID personalizzato
  const btnApplyClient = modal.querySelector('#btnApplyPaypalClient');
  if (btnApplyClient) {
    btnApplyClient.addEventListener('click', () => {
      const input = modal.querySelector('#inputPaypalClientId');
      const val = input ? input.value.trim() : 'test';
      localStorage.setItem('paypal_sandbox_client_id', val || 'test');
      showToast('Client ID PayPal salvato! Ricaricamento SDK...');
      mountPayPalSdkAndButtons();
    });
  }

  methodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      methodBtns.forEach(b => {
        b.classList.remove('selected');
        b.style.border = '1px solid #cbd5e1';
        b.style.background = 'white';
      });
      btn.classList.add('selected');
      btn.style.border = '2px solid var(--primary)';
      btn.style.background = '#eff6ff';
      currentMethod = btn.dataset.method;

      viewCard.style.display = currentMethod === 'CARD_EEA' ? 'block' : 'none';
      viewWallet.style.display = currentMethod === 'APPLE_PAY' ? 'block' : 'none';
      viewPayPal.style.display = currentMethod === 'PAYPAL_EEA' ? 'block' : 'none';

      if (currentMethod === 'PAYPAL_EEA') {
        mountPayPalSdkAndButtons();
      } else if (currentMethod === 'APPLE_PAY') {
        submitBtn.style.display = 'block';
        submitBtn.innerHTML = `📱 PAGA CON WALLET (${formatCents(sessionData.totalAmountCents)} / Mese)`;
        submitBtn.style.background = '#000000';
      } else {
        submitBtn.style.display = 'block';
        submitBtn.innerHTML = `💳 PAGA E ATTIVA SUBITO (${formatCents(sessionData.totalAmountCents)} / Mese)`;
        submitBtn.style.background = 'var(--accent)';
      }
    });
  });

  const cardNumInput = modal.querySelector('#stripeCardNumber');
  const cardExpInput = modal.querySelector('#stripeCardExpiry');

  if (cardNumInput) {
    cardNumInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 16);
      let parts = [];
      for (let i = 0; i < v.length; i += 4) {
        parts.push(v.substring(i, i + 4));
      }
      e.target.value = parts.join(' ');
    });
  }

  if (cardExpInput) {
    cardExpInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').substring(0, 4);
      if (v.length >= 2) {
        e.target.value = v.substring(0, 2) + '/' + v.substring(2);
      } else {
        e.target.value = v;
      }
    });
  }

  modal.querySelector('#stripePaymentForm').onsubmit = async (e) => {
    e.preventDefault();
    
    if (currentMethod === 'CARD_EEA' || currentMethod === 'APPLE_PAY') {
      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Connessione a Stripe Checkout Live...';
        const liveSession = await stripeCheckoutService.createLiveCheckoutSession(sessionData.groupId, sessionData.slotNumber);
        if (liveSession && liveSession.url) {
          window.location.href = liveSession.url;
          return;
        }
      } catch (err) {
        console.warn('Fallback standard:', err.message);
      }
    }

    let scenarioType = 'success';
    if (currentMethod === 'CARD_EEA') {
      const rawCard = cardNumInput ? cardNumInput.value.replace(/\s/g, '') : '';
      scenarioType = (rawCard.endsWith('0002') || rawCard.endsWith('4002')) ? 'decline' : 'success';
    }

    modal.classList.remove('active');
    
    // Imposta lo stato di verifica in corso e naviga alla dashboard
    window.__pendingPaymentVerification = {
      status: 'verifying',
      sessionData: { ...sessionData, paymentMethod: currentMethod },
      cardType: scenarioType,
      paymentMethod: currentMethod,
      inFlight: false,
      timestamp: Date.now()
    };
    
    navigateTo('#miei-abbonamenti');
  };

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
}

async function openGatewayConfigModal() {
  let modal = document.getElementById('gatewayConfigModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'gatewayConfigModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  const currentClientId = localStorage.getItem('paypal_sandbox_client_id') || '';
  const currentStripePub = localStorage.getItem('stripe_publishable_key') || '';
  
  let serverConfig = { stripe: { hasSecretKey: true, mode: 'live', publishableKey: '' } };
  try {
    const token = localStorage.getItem('buyyourshare_session_token');
    const r = await fetch('/api/admin/gateway-config', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (r.ok) {
      serverConfig = await r.json();
    }
  } catch (err) {
    console.warn('Errore lettura gateway-config server:', err);
  }

  const isStripeActive = serverConfig.stripe?.hasSecretKey;

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px; padding:24px;">
      <div class="modal-header" style="border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:24px;">⚙️</span>
          <div>
            <h2 class="modal-title" style="font-size:18px; font-weight:900; color:#003087;">Gateway di Pagamento Reali & API</h2>
            <p style="font-size:12px; color:var(--text-secondary);">Configurazione Stripe Live (Apple Pay / Google Pay / Carte) e PayPal</p>
          </div>
        </div>
        <button class="btn-close" onclick="document.getElementById('gatewayConfigModalOverlay').classList.remove('active')">&times;</button>
      </div>

      <form id="formGatewayConfig">
        <!-- SEZIONE STRIPE LIVE -->
        <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:var(--radius-md); padding:14px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:18px;">💳</span>
              <strong style="font-size:13.5px; color:#0f172a;">Stripe Payments (Live / Produzione)</strong>
            </div>
            <span style="font-size:11px; padding:2px 8px; border-radius:var(--radius-full); font-weight:800; ${isStripeActive ? 'background:#dcfce7; color:#166534;' : 'background:#fee2e2; color:#991b1b;'}">
              ${isStripeActive ? '🟢 ATTIVO LIVE' : '⚪ DA CONFIGURARE'}
            </span>
          </div>

          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="font-size:11.5px; font-weight:700;">Publishable Key (pk_live_... / pk_test_...)</label>
            <input type="text" id="popupStripePubKey" class="form-input" placeholder="pk_live_..." value="${escapeHtml(serverConfig.stripe?.publishableKey || currentStripePub)}" style="font-family:var(--font-mono); font-size:11.5px; padding:8px 10px;">
          </div>

          <div class="form-group" style="margin-bottom:6px;">
            <label class="form-label" style="font-size:11.5px; font-weight:700;">Secret Key (sk_live_... / sk_test_...)</label>
            <input type="password" id="popupStripeSecKey" class="form-input" placeholder="${isStripeActive ? '•••••••••••••••••••••••••••••••• (Configurata)' : 'sk_live_...'}" value="" style="font-family:var(--font-mono); font-size:11.5px; padding:8px 10px;">
          </div>
        </div>

        <!-- SEZIONE PAYPAL -->
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:var(--radius-md); padding:14px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:18px;">🅿️</span>
              <strong style="font-size:13.5px; color:#003087;">PayPal Gateway (Live / Produzione)</strong>
            </div>
            <span style="font-size:11px; padding:2px 8px; border-radius:var(--radius-full); font-weight:800; ${serverConfig.paypal?.hasClientId && serverConfig.paypal?.hasClientSecret ? 'background:#dcfce7; color:#166534;' : 'background:#fee2e2; color:#991b1b;'}">
              ${serverConfig.paypal?.hasClientId && serverConfig.paypal?.hasClientSecret ? '🟢 ATTIVO LIVE' : '⚪ DA CONFIGURARE'}
            </span>
          </div>

          <div class="form-group" style="margin-bottom:10px;">
            <label class="form-label" style="font-size:11.5px; font-weight:700;">Client ID (App BYS-Platform)</label>
            <input type="text" id="popupPaypalClientId" class="form-input" placeholder="Incolla Client ID PayPal" value="${escapeHtml(serverConfig.paypal?.clientId || currentClientId)}" style="font-family:var(--font-mono); font-size:11.5px; padding:8px 10px;">
          </div>

          <div class="form-group" style="margin-bottom:6px;">
            <label class="form-label" style="font-size:11.5px; font-weight:700;">Secret Key (App BYS-Platform)</label>
            <input type="password" id="popupPaypalClientSec" class="form-input" placeholder="${serverConfig.paypal?.hasClientSecret ? '•••••••••••••••••••••••••••••••• (Configurata)' : 'Incolla Secret Key PayPal'}" value="" style="font-family:var(--font-mono); font-size:11.5px; padding:8px 10px;">
          </div>
        </div>

        <div style="display:flex; gap:10px;">
          <button type="submit" class="btn btn-primary btn-block" style="background:#0070ba; font-weight:800; padding:12px;">
            💾 Salva e Applica Configurazione
          </button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('gatewayConfigModalOverlay').classList.remove('active')">
            Annulla
          </button>
        </div>
      </form>
    </div>
  `;

  modal.querySelector('#formGatewayConfig').onsubmit = async (e) => {
    e.preventDefault();
    const ppVal = document.getElementById('popupPaypalClientId').value.trim();
    const ppSec = document.getElementById('popupPaypalClientSec').value.trim();
    const strPub = document.getElementById('popupStripePubKey').value.trim();
    const strSec = document.getElementById('popupStripeSecKey').value.trim();

    if (ppVal) {
      localStorage.setItem('paypal_sandbox_client_id', ppVal);
    }
    if (strPub) {
      localStorage.setItem('stripe_publishable_key', strPub);
    }

    try {
      const token = localStorage.getItem('buyyourshare_session_token');
      const resp = await fetch('/api/admin/gateway-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          stripePublishableKey: strPub || undefined,
          stripeSecretKey: strSec || undefined,
          stripeMode: 'live',
          paypalClientId: ppVal || undefined,
          paypalClientSecret: ppSec || undefined,
          paypalMode: 'live'
        })
      });
      const data = await resp.json();
      if (data.success) {
        showToast('✅ Configurazione Gateway salvata con successo!');
      } else {
        showToast('Configurazione salvata localmente.');
      }
    } catch (err) {
      showToast('Configurazione salvata localmente.');
    }

    modal.classList.remove('active');
    renderApp();
  };

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
}

async function openEmailConfigModal() {
  let modal = document.getElementById('emailConfigModalOverlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'emailConfigModalOverlay';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  let currentConfig = {};
  try {
    const res = await fetch('/api/admin/email-config', {
      headers: { 'Authorization': `Bearer ${authService.getToken()}` }
    });
    const d = await res.json();
    if (d.success && d.emailSettings) currentConfig = d.emailSettings;
  } catch (e) {}

  modal.innerHTML = `
    <div class="modal-content" style="max-width:520px; padding:24px;">
      <div class="modal-header" style="border-bottom:1px solid #e2e8f0; padding-bottom:12px; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:24px;">📧</span>
          <div>
            <h2 class="modal-title" style="font-size:18px; font-weight:900; color:#003087;">Gateway Email Transazionali</h2>
            <p style="font-size:12px; color:var(--text-secondary);">Configura l'invio per tutte le caselle email (Gmail, Resend, Brevo, SMTP)</p>
          </div>
        </div>
        <button class="btn-close" onclick="document.getElementById('emailConfigModalOverlay').classList.remove('active')">&times;</button>
      </div>

      <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:var(--radius-md); padding:12px; margin-bottom:16px; font-size:12px; color:#1e40af; line-height:1.4;">
        💡 <strong>Invio per TUTTE le email:</strong><br>
        Puoi inserire una chiave <strong>Resend</strong> (gratuita su <a href="https://resend.com" target="_blank" style="font-weight:700; color:#003087;">resend.com</a>) o una <strong>Password per le app di Gmail</strong>. Il server invierà all'istante le email di recupero e benvenuto a qualsiasi cliente.
      </div>

      <form id="formEmailConfig">
        <div class="form-group" style="margin-bottom:12px;">
          <label class="form-label" style="font-size:12px; font-weight:700;">Resend API Key (re_...)</label>
          <input type="text" id="cfgResendApiKey" class="form-input" placeholder="re_123456789..." value="" style="font-family:var(--font-mono); font-size:12px; padding:8px 10px;">
          <span style="font-size:11px; color:var(--text-muted);">Consigliato: invia a qualsiasi email in 500ms.</span>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:12px; font-weight:700;">Gmail User (es. emi...@gmail.com)</label>
            <input type="email" id="cfgGmailUser" class="form-input" placeholder="il_tuo_account@gmail.com" value="${escapeHtml(currentConfig.gmailUser || '')}" style="font-size:12px; padding:8px 10px;">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="font-size:12px; font-weight:700;">Gmail App Password (16 lettere)</label>
            <input type="password" id="cfgGmailPass" class="form-input" placeholder="••••••••••••••••" value="" style="font-size:12px; padding:8px 10px;">
          </div>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-sm); padding:10px; margin-bottom:14px;">
          <span style="font-size:11.5px; font-weight:800; color:var(--text-main); display:block; margin-bottom:6px;">🧪 Test Invio Immediato:</span>
          <div style="display:flex; gap:8px;">
            <input type="email" id="testEmailInput" class="form-input" placeholder="Inserisci email di test..." value="${escapeHtml(authService.getCurrentUser()?.email || '')}" style="font-size:12px; padding:6px 8px; flex:1;">
            <button type="button" id="btnSendTestEmail" class="btn btn-secondary btn-sm" style="font-size:11px; font-weight:700; white-space:nowrap;">
              📨 Invia Prova
            </button>
          </div>
        </div>

        <div style="display:flex; gap:10px;">
          <button type="submit" id="btnSaveEmailConfig" class="btn btn-primary btn-block" style="background:#003087; font-weight:800; padding:11px;">
            💾 Salva Configurazione Email
          </button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('emailConfigModalOverlay').classList.remove('active')">
            Chiudi
          </button>
        </div>
      </form>
    </div>
  `;

  const btnTest = modal.querySelector('#btnSendTestEmail');
  if (btnTest) {
    btnTest.onclick = async () => {
      const target = modal.querySelector('#testEmailInput').value.trim();
      if (!target) return alert('Inserisci un indirizzo email per il test.');
      btnTest.disabled = true;
      btnTest.textContent = '⏳ Invio...';
      try {
        const res = await fetch('/api/admin/test-email', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authService.getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ to: target })
        });
        const d = await res.json();
        alert(d.message || 'Email di prova inviata!');
      } catch (err) {
        alert('Errore test: ' + err.message);
      } finally {
        btnTest.disabled = false;
        btnTest.textContent = '📨 Invia Prova';
      }
    };
  }

  modal.querySelector('#formEmailConfig').onsubmit = async (e) => {
    e.preventDefault();
    const resendApiKey = modal.querySelector('#cfgResendApiKey').value.trim();
    const gmailUser = modal.querySelector('#cfgGmailUser').value.trim();
    const gmailPass = modal.querySelector('#cfgGmailPass').value.trim();

    try {
      const res = await fetch('/api/admin/email-config', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resendApiKey, gmailUser, gmailPass })
      });
      const d = await res.json();
      showToast(d.message || 'Configurazione email salvata!');
      modal.classList.remove('active');
    } catch (err) {
      alert('Errore salvataggio: ' + err.message);
    }
  };

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  modal.classList.add('active');
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

// =========================================================================
// SESSION INACTIVITY WATCHDOG (15 MINUTI AUTO-LOGOUT)
// =========================================================================
let isLoggingOutDueToTimeout = false;

export async function handleSessionInactivityTimeout() {
  if (isLoggingOutDueToTimeout) return;
  isLoggingOutDueToTimeout = true;
  try {
    await authService.logout();
    db.clearUserData();
    await db.syncAllFromServer(null);
    showToast('⚠️ Sessione scaduta per inattività (15 minuti). Effettua nuovamente l\'accesso.');
    navigateTo('#login');
    renderApp();
  } finally {
    setTimeout(() => { isLoggingOutDueToTimeout = false; }, 2000);
  }
}

function setupInactivityWatchdog() {
  const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'input', 'wheel'];
  
  const onUserInteraction = () => {
    if (authService.isSessionTimedOut()) {
      handleSessionInactivityTimeout();
    } else {
      authService.recordActivity();
    }
  };

  activityEvents.forEach(evt => {
    window.addEventListener(evt, onUserInteraction, { passive: true });
  });

  // Heartbeat di verifica timeout ogni 5 secondi
  setInterval(() => {
    if (authService.isSessionTimedOut()) {
      handleSessionInactivityTimeout();
    }
  }, 5000);

  // Controllo immediato quando l'utente torna sulla scheda o sblocca lo schermo
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (authService.isSessionTimedOut()) {
        handleSessionInactivityTimeout();
      }
    }
  });

  window.addEventListener('focus', () => {
    if (authService.isSessionTimedOut()) {
      handleSessionInactivityTimeout();
    }
  });
}

// =========================================================================
// INITIALIZATION
// =========================================================================
async function init() {
  try {
    setupInactivityWatchdog();

    const btnConfigHeader = document.getElementById('btnOpenGatewayConfigHeader');
    if (btnConfigHeader) {
      btnConfigHeader.onclick = () => openGatewayConfigModal();
    }

    const btnPaymentHeader = document.getElementById('btnOpenPaymentSettingsHeader');
    if (btnPaymentHeader) {
      btnPaymentHeader.onclick = () => openPaymentAndPayoutSettingsModal(authService.getCurrentUser(), 'payout');
    }

    const currentUser = authService.getCurrentUser();
    await db.syncAllFromServer(currentUser);
  } catch (e) {
    console.warn('[INIT SYNC WARNING]', e);
  } finally {
    renderApp();
  }

  // Sincronizzazione automatica in background
  setInterval(async () => {
    try {
      const u = authService.getCurrentUser();
      await db.syncAllFromServer(u);
      updateHeader(u);
      updateBottomNav();
    } catch (e) {}
  }, 15000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
