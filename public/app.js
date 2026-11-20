// RetentionFlow &middot; The Dental Shaman
// Customer Care Follow-Up & Verifiable Conversion Attribution Engine

const API_BASE = '';

/* ========================================================
   PERSISTENT 30-DAY DEVICE AUTHENTICATION
   ======================================================== */
const AUTH_TOKEN_KEY = 'tds_followup_token';
const AUTH_KEY_STORED = 'tds_operator_key';
const AUTH_EXPIRY_KEY = 'tds_operator_key_exp';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getStoredDeviceAuth() {
  try {
    const exp = localStorage.getItem(AUTH_EXPIRY_KEY);
    const key = localStorage.getItem(AUTH_KEY_STORED);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    // If 30-day window expired, clear device storage
    if (exp && Date.now() > Number(exp)) {
      clearDeviceAuth();
      return { isRemembered: false, isExpired: true };
    }

    // Cookie fallback for cross-domain / iframe storage
    let cookieKey = '';
    const match = document.cookie.match(/(?:^|;\s*)tds_operator_key=([^;]+)/);
    if (match) cookieKey = decodeURIComponent(match[1]);

    const activeKey = key || cookieKey || '';
    const isRemembered = Boolean((activeKey || token) && (!exp || Date.now() < Number(exp)));

    return {
      key: activeKey,
      token: token || '',
      exp: exp ? Number(exp) : null,
      isRemembered
    };
  } catch (e) {
    return { isRemembered: false };
  }
}

function saveDeviceAuth(key, token) {
  try {
    const expiresAt = Date.now() + THIRTY_DAYS_MS;
    if (key) localStorage.setItem(AUTH_KEY_STORED, key);
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_EXPIRY_KEY, String(expiresAt));
    document.documentElement.classList.add('device-authenticated');
    document.documentElement.classList.remove('device-unauthenticated');

    if (key) {
      document.cookie = `tds_operator_key=${encodeURIComponent(key)}; max-age=${30 * 86400}; path=/; SameSite=Lax`;
    }
  } catch (e) {}
}

function clearDeviceAuth() {
  try {
    localStorage.removeItem(AUTH_KEY_STORED);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRY_KEY);
    document.documentElement.classList.remove('device-authenticated');
    document.documentElement.classList.add('device-unauthenticated');
    document.cookie = 'tds_operator_key=; max-age=0; path=/;';
  } catch (e) {}
}

let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || '';
let customersList = [];
let filteredCustomers = [];
let campaignsList = [];
let templatesList = [];
let dispatchesList = [];
let conversionsList = [];
let activeCustomer = null;
let currentFilter = 'all';
let currentPage = 1;
const pageSize = 50;
let previewDebounceTimer = null;
let editorDebounceTimer = null;
let activeTemplateCampaign = 'all';
let activeConversionCampaign = 'all';
let activeDispatchCampaign = 'all';
let currentEditingTemplate = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // Detect if running embedded inside Shopify Admin
  if (window.self !== window.top) {
    document.body.classList.add('is-embedded-shopify');
  }

  const auth = getStoredDeviceAuth();

  // If this device is remembered (stored key or token < 30 days old):
  if (auth.isRemembered) {
    // Hide auth modal immediately - never ask existing user again
    const modal = document.getElementById('authGateModal');
    if (modal) modal.classList.remove('active');
    document.documentElement.classList.add('device-authenticated');

    // 1. If we have a token, verify it
    if (auth.token) {
      authToken = auth.token;
      const isValid = await verifyAuthToken(authToken);
      if (isValid) {
        initDashboard();
        return;
      }
    }

    // 2. If token expired or server cold-started, use stored key to silently re-authenticate
    if (auth.key) {
      const refreshed = await attemptSilentKeyAuth(auth.key);
      if (refreshed) {
        initDashboard();
        return;
      }
    }
  }

  // If new user or 30 days expired, prompt for key
  promptForAuthGate();
});

function promptForAuthGate() {
  document.documentElement.classList.remove('device-authenticated');
  document.documentElement.classList.add('device-unauthenticated');
  const modal = document.getElementById('authGateModal');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  const keyInput = document.getElementById('masterAccessKey');
  if (keyInput) {
    keyInput.value = '';
    keyInput.focus();
  }
}

async function attemptSilentKeyAuth(key) {
  try {
    const res = await fetch('/api/auth/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessKey: key })
    });
    const data = await res.json();
    if (data.success && data.token) {
      authToken = data.token;
      saveDeviceAuth(key, data.token);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/* ========================================================
   AUTHENTICATION & API HELPER
   ======================================================== */
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  options.headers = headers;

  let res = await fetch(url, options);
  if (res.status === 401) {
    // Attempt silent recovery if device has stored key (< 30 days)
    const auth = getStoredDeviceAuth();
    if (auth.isRemembered && auth.key) {
      const refreshed = await attemptSilentKeyAuth(auth.key);
      if (refreshed) {
        headers['Authorization'] = `Bearer ${authToken}`;
        options.headers = headers;
        res = await fetch(url, options);
        if (res.status !== 401) return res;
      }
    }

    // Session genuinely expired and recovery failed
    authToken = '';
    clearDeviceAuth();
    promptForAuthGate();
    showToast('Session expired. Please re-enter your Master Operator Key.', 'error');
    throw new Error('Unauthorized');
  }
  return res;
}

async function verifyAuthToken(token) {
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.success === true;
  } catch (e) {
    return false;
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('masterAccessKey');
  const btn = document.getElementById('btnAuthSubmit');
  const errDiv = document.getElementById('authErrorMsg');
  const rememberCheckbox = document.getElementById('authRememberDevice');
  const shouldRemember = rememberCheckbox ? rememberCheckbox.checked : true;
  const key = input.value.trim();

  if (!key) return;

  btn.disabled = true;
  btn.innerText = 'Verifying Security Token...';
  errDiv.style.display = 'none';

  try {
    const res = await fetch('/api/auth/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessKey: key })
    });
    const data = await res.json();

    if (data.success && data.token) {
      authToken = data.token;
      if (shouldRemember) {
        saveDeviceAuth(key, data.token);
      } else {
        sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }

      const modal = document.getElementById('authGateModal');
      if (modal) modal.classList.remove('active');
      document.documentElement.classList.add('device-authenticated');
      showToast('Master Operator Access Granted (Device Remembered for 30 Days)', 'success');
      initDashboard();
    } else {
      errDiv.innerText = data.error || 'Access Denied: Invalid Master Operator Key';
      errDiv.style.display = 'block';
    }
  } catch (err) {
    errDiv.innerText = 'Network error or server unreachable.';
    errDiv.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerText = 'Sign In to Console';
  }
}

async function lockConsole() {
  if (authToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      });
    } catch (e) {}
  }
  authToken = '';
  clearDeviceAuth();
  promptForAuthGate();
  showToast('Console locked and device authorization cleared.', 'info');
}

/* ========================================================
   DASHBOARD INITIALIZATION & STATS
   ======================================================== */
async function initDashboard() {
  await Promise.all([
    loadCampaigns(),
    loadStats(),
    loadTemplates(),
    loadCustomers(),
    loadConversions(),
    loadDispatches(),
    loadSettings()
  ]);
}

async function loadCampaigns() {
  try {
    const res = await authFetch('/api/campaigns');
    const data = await res.json();
    if (data.success) {
      campaignsList = data.campaigns || [];
      populateComposerCampaignSelect();
    }
  } catch (e) {
    console.error('Failed to load campaigns:', e);
  }
}

async function loadStats() {
  try {
    const res = await authFetch('/api/stats');
    const stats = await res.json();
    updateKpiCards(stats);
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

function updateKpiCards(stats) {
  if (!stats) return;
  const custEl = document.getElementById('kpiTotalCustomers');
  if (custEl) custEl.innerText = (stats.totalCustomers || 0).toLocaleString();
  const dispEl = document.getElementById('kpiTotalDispatched');
  if (dispEl) dispEl.innerText = (stats.totalDispatched || 0).toLocaleString();
  const clickEl = document.getElementById('kpiTotalClicked');
  if (clickEl) clickEl.innerText = (stats.totalClicked || 0).toLocaleString();
  const rateEl = document.getElementById('kpiClickRate');
  if (rateEl) rateEl.innerText = (stats.clickRate || 0).toFixed(1);
  const convEl = document.getElementById('kpiTotalConverted');
  if (convEl) convEl.innerText = (stats.totalConverted || 0).toLocaleString();
  const convRateEl = document.getElementById('kpiConversionRate');
  if (convRateEl) convRateEl.innerText = (stats.conversionRate || 0).toFixed(1);
  const revEl = document.getElementById('kpiTotalRevenue');
  if (revEl) revEl.innerText = `£${Number(stats.totalRevenueGenerated || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const badgeCust = document.getElementById('badgeCustomerCount');
  if (badgeCust) badgeCust.innerText = stats.totalCustomers || 0;
  const badgeTpl = document.getElementById('badgeTemplateCount');
  if (badgeTpl) badgeTpl.innerText = templatesList.length || 20;
  const badgeAna = document.getElementById('badgeAnalyticsCount');
  if (badgeAna) badgeAna.innerText = stats.totalDispatched || 0;

  const anaDisp = document.getElementById('analyticsDispatchesCount');
  if (anaDisp) anaDisp.innerText = stats.totalDispatched || 0;
  const anaConv = document.getElementById('analyticsConversionsCount');
  if (anaConv) anaConv.innerText = stats.totalConverted || 0;
}

/* ========================================================
   TABS SWITCHING (UNIFIED 3 CORE TABS)
   ======================================================== */
function switchTab(tabName, el) {
  // Map legacy tab names to unified analytics
  if (tabName === 'conversions' || tabName === 'dispatches') {
    tabName = 'analytics';
  }

  // Update tab buttons
  document.querySelectorAll('.Polaris-Tab').forEach(tab => tab.classList.remove('active'));
  if (el) {
    el.classList.add('active');
  } else {
    const matching = document.querySelector(`.Polaris-Tab[onclick*="'${tabName}'"]`);
    if (matching) matching.classList.add('active');
  }

  // Update tab content panels
  document.querySelectorAll('.Polaris-TabContent').forEach(panel => panel.classList.remove('active'));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add('active');

  // Refresh data for active tab
  if (tabName === 'customers') renderCustomersTable();
  if (tabName === 'templates') renderTemplateCards();
  if (tabName === 'analytics') loadAnalytics();
  if (tabName === 'settings') loadSettings();
}

/* ========================================================
   UNIFIED ANALYTICS & ACTIVITY LOGIC
   ======================================================== */
let analyticsSubView = 'dispatches'; // 'dispatches' or 'conversions'
let analyticsCampaign = 'all';

async function loadAnalytics() {
  renderAnalyticsDynamicCampaignPills();
  await Promise.all([
    loadStats(),
    loadConversions(),
    loadDispatches(),
    loadActivitySessions()
  ]);
}

function renderAnalyticsDynamicCampaignPills() {
  const container = document.getElementById('analyticsCampaignPills');
  if (!container) return;
  const isAll = analyticsCampaign === 'all';
  let html = `<button type="button" class="Polaris-FilterPill ${isAll ? 'active' : ''}" onclick="setAnalyticsCampaign('all', this)">All Campaigns</button>`;
  html += campaignsList.map(c => {
    const isActive = analyticsCampaign === c.id;
    return `<button type="button" class="Polaris-FilterPill ${isActive ? 'active' : ''}" onclick="setAnalyticsCampaign('${c.id}', this)">${escapeHtml(c.shortName || c.name)}</button>`;
  }).join('');
  container.innerHTML = html;
}

function setAnalyticsCampaign(campaignId, btn) {
  analyticsCampaign = campaignId;
  activeConversionCampaign = campaignId;
  activeDispatchCampaign = campaignId;
  document.querySelectorAll('#analyticsCampaignPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  Promise.all([loadConversions(), loadDispatches()]);
}

function setAnalyticsPeriod(period, btn) {
  setConversionPeriod(period, btn);
}

function setAnalyticsSubView(view, btn) {
  analyticsSubView = view;
  document.querySelectorAll('.analytics-view-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const dispatchesPane = document.getElementById('analyticsDispatchesPane');
  const conversionsPane = document.getElementById('analyticsConversionsPane');
  const sessionsPane = document.getElementById('analyticsSessionsPane');
  const statusFilterWrap = document.getElementById('dispatchStatusFilterWrap');

  if (view === 'sessions') {
    if (sessionsPane) sessionsPane.style.display = 'block';
    if (dispatchesPane) dispatchesPane.style.display = 'none';
    if (conversionsPane) conversionsPane.style.display = 'none';
    if (statusFilterWrap) statusFilterWrap.style.display = 'none';
    loadActivitySessions();
  } else if (view === 'conversions') {
    if (sessionsPane) sessionsPane.style.display = 'none';
    if (dispatchesPane) dispatchesPane.style.display = 'none';
    if (conversionsPane) conversionsPane.style.display = 'block';
    if (statusFilterWrap) statusFilterWrap.style.display = 'none';
    loadConversions();
  } else {
    if (sessionsPane) sessionsPane.style.display = 'none';
    if (dispatchesPane) dispatchesPane.style.display = 'block';
    if (conversionsPane) conversionsPane.style.display = 'none';
    if (statusFilterWrap) statusFilterWrap.style.display = 'flex';
    loadDispatches();
  }
}

/* ========================================================
   CUSTOMERS DIRECTORY
   ======================================================== */
async function loadCustomers() {
  const statusEl = document.getElementById('customerSyncStatus');
  if (statusEl) statusEl.innerText = 'Loading customers...';

  try {
    const res = await authFetch('/api/customers');
    const data = await res.json();
    if (data.success) {
      customersList = data.customers || [];
      if (statusEl) statusEl.innerText = `${customersList.length.toLocaleString()} Customers Synced`;
      updateSpendFilterCounts();
      filterCustomers();
      if (data.stats) updateKpiCards(data.stats);
    } else {
      if (statusEl) statusEl.innerText = data.error || 'Failed to load customers';
    }
  } catch (e) {
    if (statusEl) statusEl.innerText = 'Failed to load customers';
    console.error('loadCustomers error:', e);
  }
}

async function syncCustomers() {
  const btn = document.getElementById('btnSyncCustomers');
  const statusEl = document.getElementById('customerSyncStatus');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #744B6F; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span> Syncing...`;
  }
  if (statusEl) statusEl.innerText = 'Connecting to Shopify Admin API...';

  try {
    const res = await authFetch('/api/customers/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Successfully synchronized ${data.count} customers from Shopify!`, 'success');
      await loadCustomers();
    } else {
      showToast(data.error || 'Customer synchronization failed', 'error');
    }
  } catch (err) {
    showToast('Failed to sync customers from Shopify', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Sync Customers`;
    }
  }
}

function setCustomerFilter(filterType, el) {
  currentFilter = filterType;
  document.querySelectorAll('.Polaris-FilterPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (el) {
    el.classList.add('active');
  } else {
    const targetPill = document.querySelector(`.Polaris-FilterPills .Polaris-FilterPill[onclick*="'${filterType}'"]`);
    if (targetPill) targetPill.classList.add('active');
  }
  currentPage = 1;
  filterCustomers();
}

/* ========================================================
   PROFESSIONAL CUSTOMER SPEND FILTER & SORT ENGINE
   ======================================================== */
let spendFilterMin = null;
let spendFilterMax = null;
let spendFilterLabel = 'Any';
let spendSortOrder = 'none'; // 'none' | 'desc' | 'asc'

function updateSpendFilterCounts() {
  if (!customersList || customersList.length === 0) return;
  const c150 = customersList.filter(c => parseFloat(c.total_spent || 0) >= 150).length;
  const c250 = customersList.filter(c => parseFloat(c.total_spent || 0) >= 250).length;
  const c350 = customersList.filter(c => parseFloat(c.total_spent || 0) >= 350).length;
  const c400 = customersList.filter(c => parseFloat(c.total_spent || 0) >= 400).length;
  const c500 = customersList.filter(c => parseFloat(c.total_spent || 0) >= 500).length;

  const b150 = document.getElementById('badgeSpend150'); if (b150) b150.innerText = c150;
  const b250 = document.getElementById('badgeSpend250'); if (b250) b250.innerText = c250;
  const b350 = document.getElementById('badgeSpend350'); if (b350) b350.innerText = c350;
  const b400 = document.getElementById('badgeSpend400'); if (b400) b400.innerText = c400;
  const b500 = document.getElementById('badgeSpend500'); if (b500) b500.innerText = c500;
}

function setSpendFilter(min, max, label, btnEl) {
  spendFilterMin = (min !== null && min !== undefined && min > 0) ? min : null;
  spendFilterMax = (max !== null && max !== undefined && max > 0) ? max : null;
  spendFilterLabel = label || 'Any';

  document.querySelectorAll('#spendPillsRow .spend-pill').forEach(p => p.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const minInput = document.getElementById('inputSpendMin');
  const maxInput = document.getElementById('inputSpendMax');
  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';

  updateActiveSpendTag();
  currentPage = 1;
  filterCustomers();
  closeSpendPopover();
}

function updateActiveSpendTag() {
  const tagEl = document.getElementById('activeSpendTag');
  const tagText = document.getElementById('activeSpendTagText');
  const customBtnLabel = document.getElementById('customSpendBtnLabel');

  if (spendFilterMin !== null || spendFilterMax !== null) {
    if (tagEl) tagEl.style.display = 'inline-flex';
    let text = '';
    if (spendFilterMin !== null && spendFilterMax !== null) {
      text = `£${spendFilterMin} – £${spendFilterMax}`;
    } else if (spendFilterMin !== null) {
      text = `≥ £${spendFilterMin}`;
    } else if (spendFilterMax !== null) {
      text = `≤ £${spendFilterMax}`;
    }
    if (tagText) tagText.innerText = `Spend: ${text}`;
    if (customBtnLabel) customBtnLabel.innerText = text;
  } else {
    if (tagEl) tagEl.style.display = 'none';
    if (customBtnLabel) customBtnLabel.innerText = 'Custom Range...';
  }
}

function resetSpendFilter() {
  spendFilterMin = null;
  spendFilterMax = null;
  spendFilterLabel = 'Any';

  document.querySelectorAll('#spendPillsRow .spend-pill').forEach(p => p.classList.remove('active'));
  const anyBtn = document.querySelector('#spendPillsRow .spend-pill');
  if (anyBtn) anyBtn.classList.add('active');

  const minInput = document.getElementById('inputSpendMin');
  const maxInput = document.getElementById('inputSpendMax');
  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';

  updateActiveSpendTag();
  currentPage = 1;
  filterCustomers();
  closeSpendPopover();
}

function applyCustomSpend() {
  const minVal = parseFloat(document.getElementById('inputSpendMin')?.value);
  const maxVal = parseFloat(document.getElementById('inputSpendMax')?.value);

  const min = (!isNaN(minVal) && minVal > 0) ? minVal : null;
  const max = (!isNaN(maxVal) && maxVal > 0) ? maxVal : null;

  if (min === null && max === null) {
    showToast('Please enter a minimum or maximum spend amount.', 'error');
    return;
  }

  if (min !== null && max !== null && min > max) {
    showToast('Minimum spend cannot be greater than maximum spend.', 'error');
    return;
  }

  document.querySelectorAll('#spendPillsRow .spend-pill').forEach(p => p.classList.remove('active'));
  const customBtn = document.getElementById('btnCustomSpendPopover');
  if (customBtn) customBtn.classList.add('active');

  let label = '';
  if (min !== null && max !== null) label = `£${min} – £${max}`;
  else if (min !== null) label = `≥ £${min}`;
  else label = `≤ £${max}`;

  spendFilterMin = min;
  spendFilterMax = max;
  spendFilterLabel = label;

  updateActiveSpendTag();
  currentPage = 1;
  filterCustomers();
  closeSpendPopover();
  showToast(`Filtering customers with spend: ${label}`, 'info');
}

function clearCustomSpend() {
  const minInput = document.getElementById('inputSpendMin');
  const maxInput = document.getElementById('inputSpendMax');
  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';
  resetSpendFilter();
}

function toggleSpendPopover(event) {
  if (event) event.stopPropagation();
  const popover = document.getElementById('spendPopover');
  if (!popover) return;
  const isOpen = popover.style.display !== 'none';
  popover.style.display = isOpen ? 'none' : 'block';
}

function closeSpendPopover() {
  const popover = document.getElementById('spendPopover');
  if (popover) popover.style.display = 'none';
}

function toggleSpendSort() {
  if (spendSortOrder === 'none') {
    spendSortOrder = 'desc';
  } else if (spendSortOrder === 'desc') {
    spendSortOrder = 'asc';
  } else {
    spendSortOrder = 'none';
  }
  updateSpendSortUI();
  filterCustomers();
}

function updateSpendSortUI() {
  const label = document.getElementById('spendSortLabel');
  const icon = document.getElementById('thSpendSortIcon');
  if (spendSortOrder === 'desc') {
    if (label) label.innerText = 'High → Low';
    if (icon) { icon.innerHTML = '&darr;'; icon.style.opacity = '1'; icon.style.color = '#008060'; }
  } else if (spendSortOrder === 'asc') {
    if (label) label.innerText = 'Low → High';
    if (icon) { icon.innerHTML = '&uarr;'; icon.style.opacity = '1'; icon.style.color = '#008060'; }
  } else {
    if (label) label.innerText = 'Default';
    if (icon) { icon.innerHTML = '&#8597;'; icon.style.opacity = '0.5'; icon.style.color = 'inherit'; }
  }
}

function filterCustomers() {
  try {
    const query = (document.getElementById('customerSearchInput')?.value || '').toLowerCase().trim();

    filteredCustomers = customersList.filter(c => {
      if (!c) return false;
      const firstName = String(c.first_name || '');
      const lastName = String(c.last_name || '');
      const name = `${firstName} ${lastName}`.toLowerCase();
      const email = String(c.email || '').toLowerCase();

      let tags = '';
      if (Array.isArray(c.tags)) {
        tags = c.tags.join(' ').toLowerCase();
      } else if (typeof c.tags === 'string') {
        tags = c.tags.toLowerCase();
      } else {
        tags = String(c.tags || '').toLowerCase();
      }

      const matchesSearch = !query || name.includes(query) || email.includes(query) || tags.includes(query);
      if (!matchesSearch) return false;

      // Segment filter match
      if (currentFilter === 'selected') {
        if (!selectedCustomerIds.has(String(c.id))) return false;
      } else if (currentFilter === 'never_followed') {
        if (c.lastFollowUpAt || (c.followUpCount && c.followUpCount > 0)) return false;
      } else if (currentFilter === 'repeat_buyers') {
        if ((parseInt(c.orders_count, 10) || 0) < 2) return false;
      } else if (currentFilter === 'converted') {
        if (c.conversionStatus !== 'converted' && !(parseFloat(c.convertedRevenue || 0) > 0)) return false;
      } else if (currentFilter === 'failed') {
        if (c.lastFollowUpStatus !== 'failed' && !c.lastFollowUpError) return false;
      }

      // Customer Spend Filter (Min / Max range or preset) - applied unless user chose 'selected' view
      if (currentFilter !== 'selected') {
        const totalSpent = parseFloat(c.total_spent || 0);
        if (spendFilterMin !== null && totalSpent < spendFilterMin) {
          return false;
        }
        if (spendFilterMax !== null && totalSpent > spendFilterMax) {
          return false;
        }
      }

      return true;
    });

    // Customer Sorting by Spend
    if (spendSortOrder === 'desc') {
      filteredCustomers.sort((a, b) => parseFloat(b.total_spent || 0) - parseFloat(a.total_spent || 0));
    } else if (spendSortOrder === 'asc') {
      filteredCustomers.sort((a, b) => parseFloat(a.total_spent || 0) - parseFloat(b.total_spent || 0));
    }

    renderCustomersTable();
  } catch (err) {
    console.error('filterCustomers error:', err);
  }
}

/* ========================================================
   GRID MULTI-SELECT & POLARIS BULK ACTIONS STATE
   ======================================================== */
const selectedCustomerIds = new Set();
let composerTargetCustomers = [];

function toggleCustomerSelection(id, isChecked) {
  const strId = String(id);
  if (isChecked) {
    selectedCustomerIds.add(strId);
  } else {
    selectedCustomerIds.delete(strId);
  }
  updateBulkActionsBar();
  syncMasterCheckboxState();
}

function toggleSelectAllPage(isChecked) {
  const startIdx = (currentPage - 1) * pageSize;
  const pageSlice = filteredCustomers.slice(startIdx, startIdx + pageSize);
  pageSlice.forEach(c => {
    const strId = String(c.id);
    if (isChecked) selectedCustomerIds.add(strId);
    else selectedCustomerIds.delete(strId);
  });
  renderCustomersTable();
}

function selectAllFilteredCustomers() {
  let newlyAdded = 0;
  filteredCustomers.forEach(c => {
    const strId = String(c.id);
    if (!selectedCustomerIds.has(strId)) {
      selectedCustomerIds.add(strId);
      newlyAdded++;
    }
  });
  renderCustomersTable();
  if (newlyAdded > 0) {
    showToast(`Added ${newlyAdded.toLocaleString()} customers to selection (Total: ${selectedCustomerIds.size.toLocaleString()})`, 'info');
  } else {
    showToast(`All ${filteredCustomers.length.toLocaleString()} customers in this filter are already selected.`, 'info');
  }
}

function viewSelectedCustomersOnly() {
  if (selectedCustomerIds.size === 0) {
    showToast('No customers currently selected.', 'warning');
    return;
  }
  const pill = document.getElementById('pillFilterSelected');
  if (currentFilter === 'selected') {
    const allPill = document.querySelector('.Polaris-FilterPills .Polaris-FilterPill');
    setCustomerFilter('all', allPill);
  } else {
    setCustomerFilter('selected', pill);
  }
}

function clearCustomerSelection() {
  selectedCustomerIds.clear();
  if (currentFilter === 'selected') {
    const allPill = document.querySelector('.Polaris-FilterPills .Polaris-FilterPill');
    setCustomerFilter('all', allPill);
  } else {
    renderCustomersTable();
  }
  showToast('Cleared customer selections.', 'info');
}

function syncMasterCheckboxState() {
  const master = document.getElementById('selectAllCustomersCheckbox');
  if (!master) return;
  const startIdx = (currentPage - 1) * pageSize;
  const pageSlice = filteredCustomers.slice(startIdx, startIdx + pageSize);
  if (pageSlice.length === 0) {
    master.checked = false;
    master.indeterminate = false;
    return;
  }
  const selectedOnPage = pageSlice.filter(c => selectedCustomerIds.has(String(c.id))).length;
  if (selectedOnPage === pageSlice.length) {
    master.checked = true;
    master.indeterminate = false;
  } else if (selectedOnPage > 0) {
    master.checked = false;
    master.indeterminate = true;
  } else {
    master.checked = false;
    master.indeterminate = false;
  }
}

function updateBulkActionsBar() {
  const bar = document.getElementById('bulkActionsBar');
  const countEl = document.getElementById('bulkSelectedCount');
  const actionCountEl = document.getElementById('bulkActionCount');
  const selectAllBtn = document.getElementById('btnSelectAllFiltered');
  const filteredCountEl = document.getElementById('bulkFilteredTotalCount');
  const viewSelectedBtn = document.getElementById('btnViewSelectedOnly');
  const contextBadge = document.getElementById('bulkFilterContextBadge');
  const selectedInViewEl = document.getElementById('bulkSelectedInViewCount');
  const selectedPill = document.getElementById('pillFilterSelected');
  const pillCountEl = document.getElementById('badgePillSelectedCount');

  const totalCount = selectedCustomerIds.size;
  if (countEl) countEl.innerText = totalCount.toLocaleString();
  if (actionCountEl) actionCountEl.innerText = totalCount.toLocaleString();

  // Update "Selected (X)" pill in the filter row
  if (selectedPill && pillCountEl) {
    pillCountEl.innerText = totalCount.toLocaleString();
    if (totalCount > 0) {
      selectedPill.style.display = 'inline-flex';
    } else {
      selectedPill.style.display = 'none';
      if (currentFilter === 'selected') {
        const allPill = document.querySelector('.Polaris-FilterPills .Polaris-FilterPill');
        setCustomerFilter('all', allPill);
      }
    }
  }

  if (totalCount > 0) {
    if (bar) bar.style.display = 'flex';

    // Calculate selection inside the current filtered view
    const selectedInView = filteredCustomers.filter(c => selectedCustomerIds.has(String(c.id))).length;
    const unselectedInView = filteredCustomers.length - selectedInView;

    // Context badge (e.g. "(3 in current filter)")
    if (contextBadge && selectedInViewEl) {
      if (currentFilter !== 'selected' && filteredCustomers.length < customersList.length) {
        selectedInViewEl.innerText = selectedInView.toLocaleString();
        contextBadge.style.display = 'inline-block';
      } else {
        contextBadge.style.display = 'none';
      }
    }

    // Toggle button text between "View Selected" and "Show All"
    if (viewSelectedBtn) {
      if (currentFilter === 'selected') {
        viewSelectedBtn.innerText = 'Show All Customers \u2190';
      } else {
        viewSelectedBtn.innerText = `View Selected (${totalCount.toLocaleString()})`;
      }
    }

    // Button to select all remaining customers in this filtered view
    if (selectAllBtn && filteredCountEl) {
      if (unselectedInView > 0) {
        filteredCountEl.innerText = filteredCustomers.length.toLocaleString();
        selectAllBtn.innerText = `Select all ${filteredCustomers.length.toLocaleString()} matching filter`;
        selectAllBtn.style.display = 'inline-flex';
      } else {
        selectAllBtn.style.display = 'none';
      }
    }
  } else {
    if (bar) bar.style.display = 'none';
    if (contextBadge) contextBadge.style.display = 'none';
  }
}

function openBulkComposer() {
  if (selectedCustomerIds.size === 0) {
    showToast('Please select at least one customer first.', 'warning');
    return;
  }
  const targets = customersList.filter(c => selectedCustomerIds.has(String(c.id)));
  composerTargetCustomers = targets;
  openComposer(targets[0], null, true);
}

function updateComposerRecipientsUI() {
  const count = composerTargetCustomers ? composerTargetCustomers.length : 0;
  const titleEl = document.getElementById('composerModalTitle');
  const badgeEl = document.getElementById('composerCustomerBadge');
  const countBadge = document.getElementById('composerRecipientsBadgeCount');
  const btnToggle = document.getElementById('btnToggleRecipientsList');
  const btnToggleText = document.getElementById('btnToggleRecipientsListText');
  const drawer = document.getElementById('composerRecipientsDrawer');
  const isDrawerOpen = drawer && drawer.style.display !== 'none';
  const dispatchBtn = document.getElementById('btnDispatchCustomerEmail');
  const dispatchBtnText = document.getElementById('btnDispatchCustomerEmailText');

  activeCustomer = count > 0 ? composerTargetCustomers[0] : null;

  if (count === 0) {
    if (titleEl) titleEl.innerText = 'Send Follow-Up';
    if (badgeEl) badgeEl.innerText = 'No recipients selected (Add at least 1)';
    if (countBadge) countBadge.innerText = '0 Selected';
    if (btnToggleText) btnToggleText.innerHTML = `Edit Recipients (0) ${isDrawerOpen ? '&#9652;' : '&#9662;'}`;
    if (dispatchBtnText) dispatchBtnText.innerText = 'Add a Recipient to Send';
    if (dispatchBtn) dispatchBtn.disabled = true;
  } else if (count === 1) {
    const cust = composerTargetCustomers[0];
    const fullName = `${cust.first_name || ''} ${cust.last_name || ''}`.trim() || cust.name || 'Recipient';
    if (titleEl) titleEl.innerText = 'Send Follow-Up';
    if (badgeEl) badgeEl.innerText = `${fullName} (${cust.email || 'No email'})`;
    if (countBadge) countBadge.innerText = '1 Selected';
    if (btnToggleText) btnToggleText.innerHTML = `Edit Recipients (1) ${isDrawerOpen ? '&#9652;' : '&#9662;'}`;
    if (dispatchBtnText) dispatchBtnText.innerText = 'Send Follow-Up \u2192';
    if (dispatchBtn) dispatchBtn.disabled = false;
  } else {
    if (titleEl) titleEl.innerText = `Send to ${count} Customers`;
    if (badgeEl) badgeEl.innerText = `${count} recipients selected`;
    if (countBadge) countBadge.innerText = `${count} Selected`;
    if (btnToggleText) btnToggleText.innerHTML = `Edit Recipients (${count}) ${isDrawerOpen ? '&#9652;' : '&#9662;'}`;
    if (dispatchBtnText) dispatchBtnText.innerText = `Send to ${count} Customers \u2192`;
    if (dispatchBtn) dispatchBtn.disabled = false;
  }

  if (btnToggle) btnToggle.style.display = 'inline-flex';

  renderComposerRecipientChips();
  updateLivePreview();
}

function toggleRecipientsList(forceOpen = null) {
  const drawer = document.getElementById('composerRecipientsDrawer');
  const btnToggleText = document.getElementById('btnToggleRecipientsListText');
  if (!drawer) return;
  const isCurrentlyOpen = drawer.style.display !== 'none';
  const shouldOpen = forceOpen !== null ? Boolean(forceOpen) : !isCurrentlyOpen;
  drawer.style.display = shouldOpen ? 'block' : 'none';
  if (btnToggleText) {
    const count = composerTargetCustomers ? composerTargetCustomers.length : 0;
    btnToggleText.innerHTML = `Edit Recipients (${count}) ${shouldOpen ? '&#9652;' : '&#9662;'}`;
  }
  if (shouldOpen) {
    const input = document.getElementById('composerAddRecipientInput');
    if (input) setTimeout(() => input.focus(), 50);
  }
}

function renderComposerRecipientChips() {
  const box = document.getElementById('composerRecipientsBox');
  if (!box) return;
  if (!composerTargetCustomers || composerTargetCustomers.length === 0) {
    box.innerHTML = `<div style="font-size: 12px; color: var(--p-color-text-subdued); padding: 6px 2px;">No recipients selected. Type a name or email address above to add.</div>`;
    return;
  }
  box.innerHTML = composerTargetCustomers.map(c => {
    const dispName = escapeHtml(c.first_name || c.name || 'Recipient');
    const dispEmail = escapeHtml(c.email || 'No email');
    const customBadge = c.isCustom ? `<span class="recipient-chip-badge">Custom</span>` : '';
    const removeKey = escapeHtml(String(c.id || c.email));
    return `
      <span class="recipient-chip ${c.isCustom ? 'is-custom' : ''}">
        <span><strong>${dispName}</strong> (${dispEmail})</span>
        ${customBadge}
        <span class="recipient-chip-remove" onclick="removeRecipientFromBatch('${removeKey}')" title="Remove recipient">&times;</span>
      </span>
    `;
  }).join('');
}

function removeRecipientFromBatch(idOrEmail) {
  const key = String(idOrEmail).toLowerCase();
  selectedCustomerIds.delete(String(idOrEmail));
  composerTargetCustomers = composerTargetCustomers.filter(c => 
    String(c.id).toLowerCase() !== key && (c.email || '').toLowerCase() !== key
  );
  updateComposerRecipientsUI();
  updateBulkActionsBar();
  syncMasterCheckboxState();
  renderCustomersTable();
}

function composerAddCustomEmail(rawEmail, name = '') {
  if (!rawEmail) return;
  const cleanEmail = rawEmail.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
    showToast(`"${rawEmail}" is not a valid email address.`, 'warning');
    return;
  }

  if (composerTargetCustomers.some(c => (c.email || '').toLowerCase() === cleanEmail)) {
    showToast(`${cleanEmail} is already in the recipient list.`, 'info');
    return;
  }

  const existing = customersList.find(c => (c.email || '').toLowerCase() === cleanEmail);
  if (existing) {
    composerTargetCustomers.push(existing);
    selectedCustomerIds.add(String(existing.id));
  } else {
    const customObj = {
      id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      email: cleanEmail,
      name: name || cleanEmail,
      first_name: name ? name.split(' ')[0] : cleanEmail.split('@')[0],
      isCustom: true,
      orders_count: 0,
      total_spent: '0.00'
    };
    composerTargetCustomers.push(customObj);
  }

  updateComposerRecipientsUI();
  updateBulkActionsBar();
  syncMasterCheckboxState();
  renderCustomersTable();
  showToast(`Added ${cleanEmail} to recipients.`, 'success');
}

function composerAddCustomEmailFromInput() {
  clearTimeout(composerAcDebounce);
  const input = document.getElementById('composerAddRecipientInput');
  const ac = document.getElementById('composerRecipientAutocomplete');
  if (ac) {
    ac.style.display = 'none';
    ac.innerHTML = '';
  }
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const emails = val.split(/[,;\s]+/).filter(Boolean);
  let addedCount = 0;
  emails.forEach(e => {
    if (e.includes('@')) {
      composerAddCustomEmail(e);
      addedCount++;
    }
  });

  if (addedCount === 0 && val) {
    composerAddCustomEmail(val);
  }

  input.value = '';
}

function onComposerRecipientKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    composerAddCustomEmailFromInput();
  } else if (e.key === 'Escape') {
    clearTimeout(composerAcDebounce);
    const ac = document.getElementById('composerRecipientAutocomplete');
    if (ac) {
      ac.style.display = 'none';
      ac.innerHTML = '';
    }
  }
}

let composerAcDebounce = null;
function onComposerRecipientInput(val) {
  clearTimeout(composerAcDebounce);
  const ac = document.getElementById('composerRecipientAutocomplete');
  if (!ac) return;

  const query = (val || '').trim().toLowerCase();
  if (query.length < 2) {
    ac.style.display = 'none';
    ac.innerHTML = '';
    return;
  }

  composerAcDebounce = setTimeout(() => {
    // If input was cleared while timer was pending, abort
    const curVal = (document.getElementById('composerAddRecipientInput')?.value || '').trim();
    if (curVal.length < 2) {
      ac.style.display = 'none';
      ac.innerHTML = '';
      return;
    }

    const matches = customersList.filter(c => {
      const email = (c.email || '').toLowerCase();
      const name = (c.name || `${c.first_name || ''} ${c.last_name || ''}`).toLowerCase();
      const id = String(c.id || '');
      return email.includes(query) || name.includes(query) || id.includes(query);
    }).slice(0, 6);

    let html = '';
    if (matches.length > 0) {
      html += matches.map(m => {
        const name = escapeHtml(m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Customer');
        const email = escapeHtml(m.email || 'No email');
        const spent = m.total_spent ? `£${Number(m.total_spent).toFixed(2)}` : '0 orders';
        return `
          <div class="composer-autocomplete-item" onclick="composerAddCustomerById('${m.id}')">
            <div>
              <span style="font-weight:600;">${name}</span>
              <span style="color:var(--p-color-text-subdued); margin-left:6px; font-size:11.5px;">${email}</span>
            </div>
            <span style="font-size:11px; color:var(--p-color-text-subdued);">${spent}</span>
          </div>
        `;
      }).join('');
    }

    if (query.includes('@')) {
      html += `
        <div class="composer-autocomplete-item" style="color:var(--p-color-brand); font-weight:600;" onclick="composerAddCustomEmail('${escapeHtml(query)}')">
          + Add custom recipient "${escapeHtml(query)}"
        </div>
      `;
    }

    if (!html) {
      html = `<div style="padding:8px 12px; font-size:12px; color:var(--p-color-text-subdued);">No store customers match "${escapeHtml(query)}". Press Enter or "+ Add Email" to add as custom recipient.</div>`;
    }

    ac.innerHTML = html;
    ac.style.display = 'block';
  }, 120);
}

function composerAddCustomerById(id) {
  clearTimeout(composerAcDebounce);
  const found = customersList.find(c => String(c.id) === String(id));
  if (found) {
    if (!composerTargetCustomers.some(c => String(c.id) === String(found.id))) {
      composerTargetCustomers.push(found);
      selectedCustomerIds.add(String(found.id));
      updateComposerRecipientsUI();
      updateBulkActionsBar();
      syncMasterCheckboxState();
      renderCustomersTable();
      showToast(`Added ${found.name || found.email} to recipients.`, 'success');
    } else {
      showToast(`${found.name || found.email} is already in the recipient list.`, 'info');
    }
  }
  const input = document.getElementById('composerAddRecipientInput');
  if (input) input.value = '';
  const ac = document.getElementById('composerRecipientAutocomplete');
  if (ac) {
    ac.style.display = 'none';
    ac.innerHTML = '';
  }
}

function composerClearAllRecipients() {
  if (!composerTargetCustomers || composerTargetCustomers.length === 0) return;
  composerTargetCustomers = [];
  selectedCustomerIds.clear();
  updateComposerRecipientsUI();
  updateBulkActionsBar();
  syncMasterCheckboxState();
  renderCustomersTable();
  showToast('Recipient list cleared.', 'info');
}

function composerSelectAllFilteredCustomers() {
  if (!filteredCustomers || filteredCustomers.length === 0) return;
  filteredCustomers.forEach(c => {
    if (!composerTargetCustomers.some(tc => String(tc.id) === String(c.id))) {
      composerTargetCustomers.push(c);
      selectedCustomerIds.add(String(c.id));
    }
  });
  updateComposerRecipientsUI();
  updateBulkActionsBar();
  syncMasterCheckboxState();
  renderCustomersTable();
  showToast(`Added all ${filteredCustomers.length} matching customers to recipients.`, 'success');
}

function renderCustomersTable() {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;

  if (filteredCustomers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 48px; color: var(--color-text-muted);">
          No customers found matching the selected filter or search query.
        </td>
      </tr>
    `;
    updateBulkActionsBar();
    syncMasterCheckboxState();
    return;
  }

  // Pagination slice
  const startIdx = (currentPage - 1) * pageSize;
  const pageSlice = filteredCustomers.slice(startIdx, startIdx + pageSize);
  const totalPages = Math.ceil(filteredCustomers.length / pageSize);

  let html = pageSlice.map(c => {
    const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Valued Customer';
    const email = c.email ? escapeHtml(String(c.email)) : '<span style="color:var(--color-text-subdued); font-style:italic;">No Email</span>';
    const orders = parseInt(c.orders_count, 10) || 0;
    const spent = `£${parseFloat(c.total_spent || 0).toFixed(2)}`;
    const isSelected = selectedCustomerIds.has(String(c.id));
    
    // Segment badges (Professional Rank Badges)
    const tags = [];
    const spentVal = parseFloat(c.total_spent || 0);

    // Spend Tier Rank Badge
    if (spentVal >= 500) {
      tags.push(`<span class="rank-badge rank-badge-svip">SVIP</span>`);
    } else if (spentVal >= 250) {
      tags.push(`<span class="rank-badge rank-badge-vip_plus">VIP+</span>`);
    } else if (spentVal >= 100) {
      tags.push(`<span class="rank-badge rank-badge-vip">VIP</span>`);
    }

    // Repeat Buyer Rank Badge
    if (orders >= 2) {
      tags.push(`<span class="rank-badge rank-badge-builder">REPEAT (${orders})</span>`);
    }

    // Conversion / Ordered Rank Badge
    if (c.conversionStatus === 'converted') {
      tags.push(`<span class="rank-badge rank-badge-dev">ORDERED</span>`);
    }

    // Delivery Failed Rank Badge
    if (c.lastFollowUpStatus === 'failed') {
      tags.push(`<span class="rank-badge rank-badge-admin">FAILED</span>`);
    }

    const segmentBadges = tags.length > 0 ? tags.join(' ') : `<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>`;

    // Last follow-up status
    let followUpStatus = '';
    if (c.lastFollowUpStatus === 'failed') {
      const errReason = c.lastFollowUpError || 'Delivery Failed';
      followUpStatus = `<span style="font-size:12px; color:#d82c0d; font-weight:600;" title="${escapeHtml(errReason)}">Delivery Failed</span>`;
    } else if (c.lastFollowUpAt) {
      const d = new Date(c.lastFollowUpAt);
      const timeStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      followUpStatus = `<span style="font-size:12px; color:var(--p-color-text); font-weight:500;">${timeStr}</span> <span style="font-size:11.5px; color:var(--p-color-text-subdued);">(${c.followUpCount || 1} sent)</span>`;
    } else {
      followUpStatus = `<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>`;
    }

    const actionBtn = c.lastFollowUpStatus === 'failed'
      ? `<button class="Polaris-Button Polaris-Button--slim" style="color:#d82c0d; border-color:#d82c0d;" onclick="openComposerById('${c.id}')" ${!c.email ? 'disabled' : ''}>Retry &rarr;</button>`
      : `<button class="Polaris-Button Polaris-Button--primary Polaris-Button--slim" onclick="openComposerById('${c.id}')" ${!c.email ? 'disabled' : ''}>Follow Up &rarr;</button>`;

    return `
      <tr class="${isSelected ? 'row-selected' : ''}">
        <td style="text-align: center; width: 44px;">
          <input type="checkbox" class="customer-row-checkbox" data-id="${c.id}" ${isSelected ? 'checked' : ''} onchange="toggleCustomerSelection('${c.id}', this.checked)">
        </td>
        <td>
          <div style="font-weight: 600; color: var(--color-text-title);">${escapeHtml(fullName)}</div>
          <div style="font-size: 11px; color: var(--color-text-muted);">ID: ${c.id}</div>
        </td>
        <td>
          <div style="font-size: 13px; color: var(--p-color-text);">${email}</div>
        </td>
        <td>
          <span style="font-weight: 600;">${orders}</span>
        </td>
        <td>
          <span style="font-weight: 600; color: var(--color-text-title);">${spent}</span>
        </td>
        <td>
          ${segmentBadges}
        </td>
        <td>
          ${followUpStatus}
        </td>
        <td style="text-align: right;">
          ${actionBtn}
        </td>
      </tr>
    `;
  }).join('');

  // Pagination bar row
  if (totalPages > 1) {
    html += `
      <tr>
        <td colspan="8" style="padding: 16px 20px; background: #fafbfc; border-top: 1px solid var(--color-border);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 12px; color: var(--color-text-muted);">
              Showing ${startIdx + 1}&ndash;${Math.min(startIdx + pageSize, filteredCustomers.length)} of ${filteredCustomers.length.toLocaleString()} customers
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="Polaris-Button Polaris-Button--slim" onclick="prevCustomerPage()" ${currentPage === 1 ? 'disabled' : ''}>&larr; Previous</button>
              <span style="font-size: 12.5px; font-weight: 600; align-self: center; padding: 0 4px;">Page ${currentPage} of ${totalPages}</span>
              <button class="Polaris-Button Polaris-Button--slim" onclick="nextCustomerPage()" ${currentPage === totalPages ? 'disabled' : ''}>Next &rarr;</button>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
  updateBulkActionsBar();
  syncMasterCheckboxState();
}

function prevCustomerPage() {
  if (currentPage > 1) {
    currentPage--;
    renderCustomersTable();
  }
}

function nextCustomerPage() {
  const totalPages = Math.ceil(filteredCustomers.length / pageSize);
  if (currentPage < totalPages) {
    currentPage++;
    renderCustomersTable();
  }
}

function openComposerById(customerId) {
  const customer = customersList.find(c => String(c.id) === String(customerId));
  if (customer) {
    openComposer(customer);
  }
}

/* ========================================================
   COMPOSER CAMPAIGN & STAGE PROFESSIONAL NAVIGATOR
   ======================================================== */
let composerActiveCampaign = 'water_flosser';
let composerActiveTemplateId = null;

function renderComposerCampaignTabs() {
  const container = document.getElementById('composerCampTabs');
  if (!container) return;
  if (!campaignsList || campaignsList.length === 0) return;

  container.innerHTML = campaignsList.map(camp => {
    const isActive = camp.id === composerActiveCampaign;
    const iconHtml = camp.iconSvg || getSiloIconSvg(camp.id);
    return `
      <button type="button" class="composer-camp-tab ${isActive ? 'active' : ''}" data-camp="${camp.id}" onclick="selectComposerCampaign('${camp.id}')">
        ${iconHtml}
        <span>${escapeHtml(camp.shortName || camp.name)}</span>
      </button>
    `;
  }).join('');
}

function selectComposerCampaign(campaignId, preselectedTplId = null) {
  composerActiveCampaign = campaignId;

  // Render dynamic campaign tabs
  renderComposerCampaignTabs();

  const campSelect = document.getElementById('composerCampaignSelect');
  if (campSelect) campSelect.value = campaignId;

  // Render the stages for this campaign
  renderComposerStages(campaignId, preselectedTplId);
}

function renderComposerStages(campaignId, preselectedTplId = null) {
  const container = document.getElementById('composerStageStrip');
  const tplSelect = document.getElementById('composerTemplateSelect');
  if (!container) return;

  const siloTemplates = templatesList
    .filter(t => t.campaignId === campaignId)
    .sort((a, b) => (a.stage || 1) - (b.stage || 1));

  if (siloTemplates.length === 0) {
    container.innerHTML = `
      <div style="color:var(--p-color-text-subdued); font-size:12px; padding: 6px; display: flex; align-items: center; gap: 8px;">
        <span>No presets in this campaign yet.</span>
        <button type="button" class="Polaris-Button Polaris-Button--slim" onclick="openNewPresetModal('${campaignId}')">+ Create First Preset</button>
      </div>
    `;
    return;
  }

  // Populate hidden select for backward compatibility
  if (tplSelect) {
    tplSelect.innerHTML = siloTemplates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  }

  // Determine active template
  let activeTpl = siloTemplates.find(t => t.id === preselectedTplId) || siloTemplates[0];
  composerActiveTemplateId = activeTpl.id;
  if (tplSelect) tplSelect.value = activeTpl.id;

  // Render clean Stage buttons + 6th "+ Stage" tab at the end
  const nextStageNum = siloTemplates.length + 1;
  const stageBtnsHtml = siloTemplates.map((t, idx) => {
    const stageNum = t.stage || (idx + 1);
    const timing = t.timing || `Day ${stageNum === 1 ? 1 : stageNum === 2 ? 3 : stageNum === 3 ? 7 : stageNum === 4 ? 14 : 21}`;
    const isActive = t.id === activeTpl.id;
    return `
      <button type="button" class="composer-stage-btn ${isActive ? 'active' : ''}" data-tpl-id="${t.id}" onclick="selectComposerStage('${t.id}')">
        <span>Stage ${stageNum}</span>
        <span class="stage-timing">${escapeHtml(timing)}</span>
      </button>
    `;
  }).join('');

  const addStageTabHtml = `
    <button type="button" class="composer-stage-btn composer-stage-btn--add" onclick="openNewPresetModal('${campaignId}')" title="Add Stage ${nextStageNum}">
      <span>+ Stage</span>
      <span class="stage-timing">Add</span>
    </button>
  `;

  container.innerHTML = stageBtnsHtml + addStageTabHtml;

  updateComposerStageTitle(activeTpl);
  onTemplateChange();
}

function selectComposerStage(templateId) {
  const tpl = templatesList.find(t => t.id === templateId);
  if (!tpl) return;

  composerActiveTemplateId = templateId;
  const tplSelect = document.getElementById('composerTemplateSelect');
  if (tplSelect) tplSelect.value = templateId;

  document.querySelectorAll('#composerStageStrip .composer-stage-btn').forEach(btn => {
    if (btn.getAttribute('data-tpl-id') === templateId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  updateComposerStageTitle(tpl);
  onTemplateChange();
}

function updateComposerStageTitle(tpl) {
  const nameEl = document.getElementById('composerStageActiveName');
  const timingEl = document.getElementById('composerStageActiveTiming');
  if (nameEl) nameEl.innerText = `Stage ${tpl.stage || 1}: ${tpl.name || 'Follow-Up'}`;
  if (timingEl) {
    timingEl.innerText = `(${tpl.timing || 'Day 1'})`;
  }
}

function toggleComposerHtmlView(btn) {
  const wrap = document.getElementById('composerHtmlEditorWrap');
  if (!wrap) return;
  const isHidden = wrap.style.display === 'none';
  if (isHidden) {
    wrap.style.display = 'block';
    if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg> Close Code`;
  } else {
    wrap.style.display = 'none';
    if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit HTML Code`;
  }
}

function toggleComposerDiscount(cb) {
  updateLivePreview();
}

function openComposer(customer, preselectedTemplateId = null, isBulk = false) {
  // Dynamic Recipient Initialization based on current selections
  if (selectedCustomerIds.size > 0 && (isBulk || !customer || selectedCustomerIds.has(String(customer?.id)))) {
    composerTargetCustomers = customersList.filter(c => selectedCustomerIds.has(String(c.id)));
  } else if (customer) {
    composerTargetCustomers = [customer];
  } else if (selectedCustomerIds.size > 0) {
    composerTargetCustomers = customersList.filter(c => selectedCustomerIds.has(String(c.id)));
  } else {
    composerTargetCustomers = [customersList[0] || { first_name: 'Valued', name: 'Valued Customer', email: 'shop@thedentalshaman.com' }];
  }

  activeCustomer = composerTargetCustomers[0];

  // If multiple recipients, show drawer open so user sees all of them
  const drawer = document.getElementById('composerRecipientsDrawer');
  if (drawer) {
    drawer.style.display = composerTargetCustomers.length > 1 ? 'block' : 'none';
  }

  updateComposerRecipientsUI();

  // Reset HTML collapse view
  const htmlWrap = document.getElementById('composerHtmlEditorWrap');
  if (htmlWrap) htmlWrap.style.display = 'none';
  const htmlToggleBtn = document.getElementById('btnToggleComposerHtml');
  if (htmlToggleBtn) htmlToggleBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit HTML Code`;

  // Reset zero discount checkbox
  const noDisc = document.getElementById('composerNoDiscountToggle');
  if (noDisc) {
    noDisc.checked = false;
    document.getElementById('composerDiscountCode').disabled = false;
  }

  // Determine target campaign
  let targetCampaign = campaignsList[0]?.id || 'water_flosser';
  if (preselectedTemplateId) {
    const tpl = templatesList.find(t => t.id === preselectedTemplateId);
    if (tpl && tpl.campaignId) {
      targetCampaign = tpl.campaignId;
    }
  }

  selectComposerCampaign(targetCampaign, preselectedTemplateId);

  // Initialize mobile composer mode to edit
  setComposerMode('edit');
  setPreviewDevice('desktop', document.getElementById('btnPreviewDesktop'));

  // Open modal & lock background scroll
  document.body.classList.add('modal-open');
  document.getElementById('composerModal').classList.add('active');
  setTimeout(() => {
    const subjEl = document.getElementById('composerSubject');
    if (subjEl) {
      autoResizeTextarea(subjEl);
      updateComposerSubjectCount();
    }
  }, 20);
}

function closeComposerModal() {
  document.body.classList.remove('modal-open');
  document.getElementById('composerModal').classList.remove('active');
  activeCustomer = null;
}

/* ========================================================
   IN-LINE PRESET SAVING FROM COMPOSER
   ======================================================== */
async function openSavePresetDialog() {
  const tplSelect = document.getElementById('composerTemplateSelect');
  const tplId = tplSelect ? tplSelect.value : composerActiveTemplateId;
  const currentTpl = templatesList.find(t => t.id === tplId) || templatesList[0];
  const currentSubj = document.getElementById('composerSubject')?.value || '';
  const currentPromo = document.getElementById('composerDiscountCode')?.value || 'TDS-CARE';
  const currentHtml = document.getElementById('composerBody')?.value || '';

  const choice = confirm(`Save customizations to campaign preset?\n\n- Click OK to UPDATE the existing stage preset: "${currentTpl.name}"\n- Click Cancel to create a brand new preset stage instead.`);

  if (choice) {
    try {
      showToast(`Saving changes to preset "${currentTpl.name}"...`, 'info');
      const res = await authFetch(`/api/templates/${currentTpl.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentTpl.name,
          subject: currentSubj,
          discountCode: currentPromo,
          htmlContent: currentHtml
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Preset "${currentTpl.name}" saved permanently!`, 'success');
        await loadTemplates();
        renderComposerStages(composerActiveCampaign, currentTpl.id);
      } else {
        showToast(data.error || 'Failed to save preset', 'error');
      }
    } catch (e) {
      showToast('Error saving preset', 'error');
    }
  } else {
    const newName = prompt('Enter a name for the new preset / stage:');
    if (newName && newName.trim()) {
      try {
        const nextStageNum = (templatesList.filter(t => t.campaignId === composerActiveCampaign).length) + 1;
        const res = await authFetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: composerActiveCampaign,
            stage: nextStageNum,
            stageLabel: `Stage ${nextStageNum}: ${newName.trim()}`,
            name: newName.trim(),
            description: 'Custom clinical follow-up preset.',
            subject: currentSubj,
            discountCode: currentPromo,
            htmlContent: currentHtml
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`New preset "${newName}" created successfully!`, 'success');
          await loadTemplates();
          renderComposerStages(composerActiveCampaign, data.template.id);
        } else {
          showToast(data.error || 'Failed to create preset', 'error');
        }
      } catch (e) {
        showToast('Error creating new preset', 'error');
      }
    }
  }
}

async function dispatchCustomerEmail() {
  const count = composerTargetCustomers ? composerTargetCustomers.length : 0;

  if (count === 0) {
    showToast('Cannot dispatch: Please add at least one recipient.', 'warning');
    toggleRecipientsList(true);
    return;
  }

  const btn = document.getElementById('btnDispatchCustomerEmail');
  const tplSelect = document.getElementById('composerTemplateSelect');
  const tplId = tplSelect ? tplSelect.value : (composerActiveTemplateId || 'water_flosser_1');
  const customSubject = document.getElementById('composerSubject')?.value || '';
  const customDiscountCode = document.getElementById('composerDiscountCode')?.value || 'TDS-CARE';
  const customBody = document.getElementById('composerBody')?.value || '';
  const scheduleFullSequence = document.getElementById('composerScheduleFullSequence')?.checked ?? true;
  const campaignId = composerActiveCampaignId || 'water_flosser';
  const currentCamp = campaignsList.find(c => c.id === campaignId);
  const campaignName = currentCamp ? (currentCamp.shortName || currentCamp.name) : 'Follow-Up Sequence';
  const sessionName = `${campaignName} • ${count} Recipient${count > 1 ? 's' : ''}`;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #ffffff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span> Starting Activity Session...`;

  try {
    const res = await authFetch('/api/followup/batch-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipients: composerTargetCustomers.map(c => ({
          id: c.id,
          email: c.email,
          name: c.name || c.first_name || c.email,
          first_name: c.first_name || c.name || c.email.split('@')[0]
        })),
        customerIds: composerTargetCustomers.filter(c => !c.isCustom).map(c => c.id),
        templateId: tplId,
        campaignId,
        campaignName,
        sessionName,
        customSubject,
        customDiscountCode,
        customBody,
        scheduleFullSequence
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Activity Session started! ${data.sentCount} delivered, ${data.scheduledCount} scheduled.`, 'success');
      closeComposerModal();
      clearCustomerSelection();
      await Promise.all([loadStats(), loadCustomers(), loadDispatches(), loadActivitySessions()]);

      // Automatically switch to Analytics Sessions view so user can track and inspect their session!
      switchTab('analytics');
      setAnalyticsSubView('sessions', document.getElementById('btnViewSessions'));
    } else {
      showToast(data.error || 'Failed to dispatch follow-up.', 'critical');
    }
  } catch (err) {
    showToast('Network error while dispatching follow-up.', 'critical');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> <span id="btnDispatchCustomerEmailText">Send Follow-Up &rarr;</span>`;
  }
}

/* ========================================================
   BATCH DISPATCH PROGRESS OVERLAY HELPERS
   ======================================================== */
function openBatchProgressModal(total) {
  document.getElementById('batchProgressTitle').innerText = `Dispatching Follow-Up Batch (${total} Recipients)`;
  document.getElementById('batchProgressSubtitle').innerText = `Personalizing email and conversion tokens for each customer...`;
  document.getElementById('batchProgressCounter').innerText = `0 of ${total} dispatched`;
  document.getElementById('batchProgressPercent').innerText = `0%`;
  document.getElementById('batchProgressBarFill').style.width = '10%';
  document.getElementById('btnBatchDone').style.display = 'none';
  document.getElementById('batchProgressLog').innerHTML = `
    <div>[System] Initializing personalized sequence templates...</div>
    <div>[System] Connecting to Resend API / SMTP gateway...</div>
    <div>[System] Processing ${total} customer deliveries with throttled queue...</div>
  `;
  document.getElementById('modalBatchProgress').classList.add('active');
}

function logBatchProgress(msg) {
  const logEl = document.getElementById('batchProgressLog');
  if (logEl) {
    logEl.innerHTML += `<div>${escapeHtml(msg)}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function finishBatchProgressModal(data) {
  document.getElementById('batchProgressBarFill').style.width = '100%';
  document.getElementById('batchProgressPercent').innerText = '100%';
  document.getElementById('batchProgressCounter').innerText = `${data.sentCount} of ${data.total} dispatched`;
  
  const logEl = document.getElementById('batchProgressLog');
  const summaryHtml = `
    <div style="color: #4ade80; font-weight: bold; margin-top: 8px;">✓ Batch Completed: ${data.sentCount} sent successfully, ${data.failedCount} failed.</div>
    ${(data.successes || []).slice(0, 8).map(s => `<div>✓ Delivered to ${escapeHtml(s.name)} (${escapeHtml(s.email)})</div>`).join('')}
    ${(data.successes || []).length > 8 ? `<div>... and ${(data.successes || []).length - 8} more recipients</div>` : ''}
    ${(data.failures || []).map(f => `<div style="color: #f87171;">✗ Failed: ${escapeHtml(f.email)} - ${escapeHtml(f.error)}</div>`).join('')}
  `;
  logEl.innerHTML += summaryHtml;
  logEl.scrollTop = logEl.scrollHeight;
  document.getElementById('btnBatchDone').style.display = 'inline-block';
  showToast(`Batch complete: ${data.sentCount} sent!`, 'success');
}

function closeBatchProgressModal() {
  document.getElementById('modalBatchProgress').classList.remove('active');
}

async function onTemplateChange() {
  const tplId = document.getElementById('composerTemplateSelect').value;
  const tpl = templatesList.find(t => t.id === tplId);
  if (!tpl) return;

  // Set default subject and generate promo code
  let subj = tpl.subject || 'A personal note from Dr. Marc Mortiboys (BDS)';
  const firstName = activeCustomer?.first_name || 'there';
  subj = subj.replace(/\{\{first_name\}\}/gi, firstName);
  const composerSubjEl = document.getElementById('composerSubject');
  if (composerSubjEl) {
    composerSubjEl.value = subj;
    autoResizeTextarea(composerSubjEl);
    updateComposerSubjectCount();
  }

  // Campaign Tracking Code (zero discounts platform-wide)
  const codePrefix = (tpl.discountCode && tpl.discountCode !== 'NONE') ? tpl.discountCode : 'TDS-CARE';
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const codeEl = document.getElementById('composerDiscountCode');
  if (codeEl) {
    codeEl.value = `${codePrefix}-${rand}`;
    codeEl.disabled = false;
  }

  // Fetch raw template HTML
  try {
    const res = await authFetch(`/api/templates/${tplId}/raw`);
    const data = await res.json();
    if (data.success) {
      document.getElementById('composerBody').value = data.html || '';
    }
  } catch (e) {
    console.error('Failed to load raw template HTML:', e);
  }

  updateLivePreview();
}

function updateComposerSubjectCount() {
  const subj = document.getElementById('composerSubject')?.value || '';
  const countEl = document.getElementById('composerSubjectCount');
  if (countEl) {
    const len = subj.length;
    countEl.innerText = `${len} chars`;
  }
}

function sanitizePreviewHtml(rawHtml) {
  if (!rawHtml) return '';
  // Gracefully hide broken external images and ensure images never stretch
  return rawHtml.replace(/<img\s+([^>]*?)>/gi, (match, attrs) => {
    if (/onerror=/i.test(attrs)) return match;
    return `<img ${attrs} onerror="this.style.display='none';">`;
  });
}

function generateUniqueCode() {
  const tplId = document.getElementById('composerTemplateSelect')?.value;
  const tpl = templatesList.find(t => t.id === tplId);
  const prefix = (tpl?.discountCode && tpl.discountCode !== 'NONE') ? tpl.discountCode : 'TDS-CARE';
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const codeEl = document.getElementById('composerDiscountCode');
  if (codeEl) codeEl.value = `${prefix}-${rand}`;
  updateLivePreview();
}

function updateLivePreview() {
  clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(async () => {
    const tplId = document.getElementById('composerTemplateSelect').value;
    const customSubject = document.getElementById('composerSubject').value;
    const customDiscountCode = document.getElementById('composerDiscountCode').value;
    const customBody = document.getElementById('composerBody').value;

    try {
      const res = await authFetch(`/api/templates/${tplId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: activeCustomer || { first_name: 'Jane', name: 'Jane Doe', email: 'jane@example.com' },
          customSubject,
          customDiscountCode,
          customBody
        })
      });
      const data = await res.json();
      if (data.success && data.rendered) {
        document.getElementById('composerPreviewFrame').innerHTML = sanitizePreviewHtml(data.rendered.html);
      }
    } catch (e) {
      console.error('Preview render error:', e);
    }
  }, 300);
}

let composerActiveMode = 'edit';

function setComposerMode(mode) {
  composerActiveMode = mode;
  const editBtn = document.getElementById('btnComposerModeEdit');
  const prevBtn = document.getElementById('btnComposerModePreview');
  const modal = document.getElementById('composerModal');
  if (!modal) return;

  if (mode === 'preview') {
    if (editBtn) editBtn.classList.remove('active');
    if (prevBtn) prevBtn.classList.add('active');
    modal.classList.add('mode-preview');
    updateLivePreview();
  } else {
    if (editBtn) editBtn.classList.add('active');
    if (prevBtn) prevBtn.classList.remove('active');
    modal.classList.remove('mode-preview');
  }
}

let currentPreviewDevice = 'desktop';

function setPreviewDevice(device, btn) {
  currentPreviewDevice = device;
  const container = document.getElementById('composerPreviewFrame');
  if (!container) return;
  document.querySelectorAll('.preview-toolbar .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const isPhoneScreen = window.innerWidth <= 767;

  if (device === 'mobile') {
    container.classList.remove('device-desktop');
    container.classList.add('device-mobile');
    if (!isPhoneScreen) {
      container.style.maxWidth = '375px';
      container.style.margin = '0 auto';
      container.style.border = '1px solid #d1d5db';
      container.style.borderRadius = '16px';
      container.style.boxShadow = '0 10px 30px rgba(0,0,0,0.12)';
      container.style.overflow = 'hidden';
    } else {
      container.style.maxWidth = '100%';
      container.style.margin = '0';
      container.style.border = 'none';
      container.style.borderRadius = '8px';
      container.style.boxShadow = 'none';
      container.style.overflow = 'visible';
    }
  } else {
    // Desktop View: Filled edge-to-edge!
    container.classList.remove('device-mobile');
    container.classList.add('device-desktop');
    container.style.maxWidth = '100%';
    container.style.margin = '0';
    container.style.border = 'none';
    container.style.borderRadius = '8px';
    container.style.boxShadow = 'none';
    container.style.overflow = isPhoneScreen ? 'visible' : 'auto';
  }
}

async function sendComposerTest() {
  const testEmail = prompt('Enter your recipient email to receive a live test preview:', 'teamdynabyte@gmail.com');
  if (!testEmail || !testEmail.includes('@')) return;

  const tplId = document.getElementById('composerTemplateSelect').value;
  const customSubject = document.getElementById('composerSubject').value;
  const customDiscountCode = document.getElementById('composerDiscountCode').value;
  const customBody = document.getElementById('composerBody').value;

  showToast(`Transmitting live preview to ${testEmail}...`, 'info');

  try {
    const res = await authFetch('/api/followup/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testEmail,
        templateId: tplId,
        customSubject,
        customDiscountCode,
        customBody
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Test preview delivered to ${testEmail} in ~150ms!`, 'success');
    } else {
      showToast(data.error || 'Failed to dispatch test preview', 'error');
    }
  } catch (err) {
    showToast('Failed to send test preview email', 'error');
  }
}

/* ========================================================
   CONVERSION ATTRIBUTION & PROOF (THE PROOF ENGINE)
   ======================================================== */
let conversionPeriod = 7;
let customStartDate = '';
let customEndDate = '';

function buildPeriodQuery() {
  let q = '';
  if (conversionPeriod === 'custom' && customStartDate && customEndDate) {
    q = `startDate=${encodeURIComponent(customStartDate)}&endDate=${encodeURIComponent(customEndDate)}`;
  } else if (conversionPeriod === 'all') {
    q = 'days=all';
  } else {
    q = `days=${conversionPeriod}`;
  }
  if (activeConversionCampaign && activeConversionCampaign !== 'all') {
    q += `&campaignId=${encodeURIComponent(activeConversionCampaign)}`;
  }
  return q;
}

function setConversionCampaign(campaignId, btn) {
  activeConversionCampaign = campaignId;
  document.querySelectorAll('#conversionCampaignPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadConversions();
}

function setConversionPeriod(period, btn) {
  // If clicking the already selected period (and it's not 'all'), toggle back to 'all'
  if (conversionPeriod === period && period !== 'all') {
    conversionPeriod = 'all';
    document.querySelectorAll('#analyticsPeriodPills .Polaris-FilterPill, #conversionPeriodPills .Polaris-FilterPill').forEach(p => {
      p.classList.remove('active');
      if (p.textContent.trim().toLowerCase().includes('all time')) {
        p.classList.add('active');
      }
    });
  } else {
    conversionPeriod = period;
    document.querySelectorAll('#analyticsPeriodPills .Polaris-FilterPill, #conversionPeriodPills .Polaris-FilterPill').forEach(p => {
      p.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
  }

  const customBox = document.getElementById('customDateRangeBox');
  if (customBox) customBox.style.display = 'none';

  loadConversions();
  loadDispatches();
}

function toggleCustomDateInputs(btn) {
  const customBox = document.getElementById('customDateRangeBox');
  const isCurrentlyOpen = customBox && customBox.style.display === 'flex';

  if (isCurrentlyOpen) {
    customBox.style.display = 'none';
    setConversionPeriod('all');
    return;
  }

  document.querySelectorAll('#analyticsPeriodPills .Polaris-FilterPill, #conversionPeriodPills .Polaris-FilterPill').forEach(p => {
    p.classList.remove('active');
  });
  if (btn) btn.classList.add('active');

  if (customBox) {
    customBox.style.display = 'flex';
  }

  // Pre-fill dates if empty
  const startInput = document.getElementById('filterStartDate');
  const endInput = document.getElementById('filterEndDate');
  if (startInput && !startInput.value) {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    startInput.value = d.toISOString().split('T')[0];
  }
  if (endInput && !endInput.value) {
    endInput.value = new Date().toISOString().split('T')[0];
  }
}

function applyCustomDateFilter() {
  const startVal = document.getElementById('filterStartDate')?.value;
  const endVal = document.getElementById('filterEndDate')?.value;

  if (!startVal || !endVal) {
    showToast('Please select both a Start Date and End Date.', 'error');
    return;
  }
  if (new Date(startVal) > new Date(endVal)) {
    showToast('Start Date cannot be later than End Date.', 'error');
    return;
  }

  conversionPeriod = 'custom';
  customStartDate = startVal;
  customEndDate = endVal;

  loadConversions();
}

async function loadConversions() {
  const tbody = document.getElementById('conversionsTableBody');
  if (!tbody) return;

  const ribbon = document.getElementById('conversionSummaryRibbon');
  if (ribbon) {
    if (conversionPeriod === 'custom') {
      ribbon.innerText = `Audit Period: ${customStartDate} to ${customEndDate}`;
    } else if (conversionPeriod === 'all') {
      ribbon.innerText = 'Audit Period: All Time';
    } else {
      ribbon.innerText = `Audit Period: Last ${conversionPeriod} Days`;
    }
  }

  try {
    const query = buildPeriodQuery();
    const res = await authFetch(`/api/tracking/conversions?${query}`);
    const data = await res.json();
    if (data.success) {
      conversionsList = data.conversions || [];
      const convBadge = document.getElementById('analyticsConversionsCount');
      if (convBadge) convBadge.innerText = conversionsList.length;

      // Update KPIs dynamically
      const periodStats = data.periodStats || {};
      const revEl = document.getElementById('kpiTotalRevenue');
      if (revEl && periodStats.totalRevenue !== undefined) {
        revEl.innerText = `£${Number(periodStats.totalRevenue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      const ordEl = document.getElementById('kpiTotalConverted');
      if (ordEl && periodStats.totalConversions !== undefined) {
        ordEl.innerText = periodStats.totalConversions || 0;
      }
      if (document.getElementById('periodKpiClients')) {
        document.getElementById('periodKpiClients').innerText = periodStats.uniqueEmails || 0;
      }
      if (document.getElementById('periodKpiAov')) {
        document.getElementById('periodKpiAov').innerText = `£${parseFloat(periodStats.avgOrderValue || 0).toFixed(2)}`;
      }
      if (document.getElementById('periodKpiProofRate')) {
        document.getElementById('periodKpiProofRate').innerText = periodStats.proofAccuracy || '100%';
      }

      if (conversionsList.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; padding: 48px; color: var(--color-text-muted);">
              No verified conversions identified in this timeframe. Click "Audit Conversions" to scan Shopify orders.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = conversionsList.map(c => {
        const orderNum = c.orderNumber ? `#${c.orderNumber}` : 'N/A';
        const customerName = c.customerName || 'Customer';
        const customerEmail = c.customerEmail || 'N/A';
        const templateName = c.templateName || 'Follow-Up Email';
        const revenue = `£${parseFloat(c.totalPrice || 0).toFixed(2)}`;
        
        // Items list
        const itemsList = Array.isArray(c.lineItems)
          ? c.lineItems.map(it => `<div style="font-size:12px; font-weight:500;">${it.quantity}x ${escapeHtml(it.title)}</div>`).join('')
          : '<span style="font-size:12px; color:var(--color-text-muted);">Oral care essentials</span>';

        // Timeline formatting
        const sentStr = c.dispatchedAt ? new Date(c.dispatchedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '&mdash;';
        const clickStr = c.clickedAt ? new Date(c.clickedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '&mdash;';
        const orderStr = c.orderCreatedAt ? new Date(c.orderCreatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '&mdash;';

        // Clean Attribution Details
        let attributionMethod = '';
        if (c.proofType === 'PROMO_CODE_MATCH' || (c.proofLevel && c.proofLevel.includes('Promo'))) {
          attributionMethod = 'Tracking code match';
        } else if (c.clickedAt) {
          attributionMethod = 'Follow-up link click';
        } else {
          attributionMethod = 'Campaign sequence window';
        }

        const trackingRefUsed = (c.discountCodesUsed && c.discountCodesUsed.length > 0) ? c.discountCodesUsed.join(', ') : (c.discountCode || 'TDS-CARE');

        const evidenceHtml = `
          <div style="font-size: 12px; font-weight: 500; color: var(--p-color-text);">${attributionMethod}</div>
          <div style="font-size: 11px; color: var(--p-color-text-subdued); margin-top: 2px;">
            Tracking Ref: <code>${escapeHtml(trackingRefUsed)}</code>
          </div>
        `;

        return `
          <tr>
            <td>
              <div style="font-weight: 700; color: var(--color-brand); font-size: 13.5px;">${orderNum}</div>
              <div style="font-size: 11px; color: var(--color-text-muted);">${orderStr}</div>
            </td>
            <td>
              <div style="font-weight: 600; color: var(--color-text-title);">${escapeHtml(customerName)}</div>
              <div style="font-size: 12px; color: var(--p-color-text-subdued);">${escapeHtml(customerEmail)}</div>
            </td>
            <td>
              <div style="font-weight: 600; color: var(--color-brand); font-size: 12.5px;">${escapeHtml(c.campaignName || 'Campaign')}</div>
              <div style="font-size: 11px; color: var(--color-text-muted); font-weight: 500;">${escapeHtml(c.stageLabel || ('Stage ' + (c.stage || 1)))}</div>
            </td>
            <td>
              <span style="font-size: 12.5px; font-weight: 500;">${escapeHtml(templateName)}</span>
            </td>
            <td>
              <div style="font-size: 11.5px; line-height: 1.4;">
                <div><span style="color:var(--color-text-muted);">Sent:</span> ${sentStr}</div>
                <div><span style="color:var(--color-text-muted);">Clicked:</span> ${clickStr}</div>
                <div><span style="color:var(--color-emerald); font-weight: 600;">Ordered:</span> ${orderStr}</div>
              </div>
            </td>
            <td>
              ${itemsList}
            </td>
            <td>
              <span style="font-weight: 700; color: var(--color-emerald); font-size: 14px;">${revenue}</span>
            </td>
            <td>
              ${evidenceHtml}
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    console.error('Failed to load conversions:', e);
  }
}

async function syncConversions() {
  const btn = document.getElementById('btnSyncConversions');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #744B6F; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span> Auditing...`;
  }

  showToast('Auditing Shopify orders against follow-up telemetry...', 'info');

  try {
    const res = await authFetch('/api/tracking/sync-conversions', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Audit complete: ${data.newConversions || 0} new conversions verified!`, 'success');
      await Promise.all([loadStats(), loadConversions(), loadCustomers()]);
    } else {
      showToast(data.error || 'Conversion audit failed', 'error');
    }
  } catch (err) {
    showToast('Failed to audit conversions', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> Audit Conversions`;
    }
  }
}

async function downloadFilteredCsv() {
  try {
    showToast('Generating filtered conversion audit CSV...', 'info');
    const query = buildPeriodQuery();
    const res = await authFetch(`/api/tracking/report/csv?${query}`);
    if (!res.ok) throw new Error('Failed to download report');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    const periodTag = conversionPeriod === 'custom' ? `${customStartDate}_to_${customEndDate}` : `${conversionPeriod}d`;
    a.download = `TheDentalShaman_FollowUp_Report_${periodTag}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    showToast('Filtered CSV audit report downloaded!', 'success');
  } catch (err) {
    showToast('Failed to download report: ' + err.message, 'error');
  }
}

function downloadCsvReport() {
  downloadFilteredCsv();
}

function openExecutiveReport() {
  const query = buildPeriodQuery();
  const url = `/api/tracking/report/html?${query}&token=${encodeURIComponent(authToken)}`;
  window.open(url, '_blank');
}

/* ========================================================
   DISPATCH HISTORY & FAILURE AUDIT
   ======================================================== */
let activeDispatchStatus = 'all';

function setDispatchStatus(status, btn) {
  activeDispatchStatus = status;
  document.querySelectorAll('#dispatchStatusPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDispatchesTable();
}

function setDispatchCampaign(campaignId, btn) {
  activeDispatchCampaign = campaignId;
  document.querySelectorAll('#dispatchCampaignPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadDispatches();
}

let activeAnalyticsSession = 'all';

function onAnalyticsSessionFilterChange(val) {
  activeAnalyticsSession = val;
  renderDispatchesTable();
}

async function loadDispatches() {
  try {
    const q = activeDispatchCampaign && activeDispatchCampaign !== 'all' ? `?campaignId=${encodeURIComponent(activeDispatchCampaign)}` : '';
    const res = await authFetch(`/api/tracking/dispatches${q}`);
    const data = await res.json();
    if (data.success) {
      dispatchesList = data.dispatches || [];
      const dispBadge = document.getElementById('analyticsDispatchesCount');
      if (dispBadge) dispBadge.innerText = dispatchesList.length;
      const anaBadge = document.getElementById('badgeAnalyticsCount');
      if (anaBadge) anaBadge.innerText = dispatchesList.length;

      const failedCount = dispatchesList.filter(d => d.status === 'failed').length;
      const failedBadge = document.getElementById('dispatchFailedCount');
      if (failedBadge) failedBadge.innerText = failedCount;

      const delCount = dispatchesList.filter(d => d.status === 'sent').length;
      const delBadge = document.getElementById('kpiDeliveredCount');
      if (delBadge) delBadge.innerText = delCount;

      const schCount = dispatchesList.filter(d => d.status === 'scheduled').length;
      const schBadge = document.getElementById('dispatchScheduledCount');
      if (schBadge) schBadge.innerText = schCount;

      // Populate session filter dropdown
      const sessionSelect = document.getElementById('analyticsSessionFilter');
      if (sessionSelect) {
        const currentVal = sessionSelect.value;
        const sessions = new Set();
        dispatchesList.forEach(d => {
          if (d.campaignName) sessions.add(d.campaignName);
          else if (d.sessionId) sessions.add(d.sessionId);
        });
        let optHtml = '<option value="all">All Sessions &amp; Sequences</option>';
        sessions.forEach(s => {
          optHtml += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
        });
        sessionSelect.innerHTML = optHtml;
        if (currentVal && Array.from(sessions).includes(currentVal)) {
          sessionSelect.value = currentVal;
        }
      }

      renderDispatchesTable();
    }
  } catch (e) {
    console.error('Failed to load dispatches:', e);
  }
}

function renderDispatchesTable() {
  const tbody = document.getElementById('dispatchesTableBody');
  if (!tbody) return;

  const filteredDispatches = dispatchesList.filter(d => {
    if (activeDispatchStatus === 'sent' && d.status !== 'sent') return false;
    if (activeDispatchStatus === 'scheduled' && d.status !== 'scheduled') return false;
    if (activeDispatchStatus === 'failed' && d.status !== 'failed') return false;
    if (activeAnalyticsSession !== 'all') {
      if (d.sessionId !== activeAnalyticsSession && d.campaignName !== activeAnalyticsSession && d.campaignId !== activeAnalyticsSession) {
        return false;
      }
    }
    return true;
  });

  if (filteredDispatches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 48px; color: var(--color-text-muted);">
          No follow-up dispatches found for this status and session filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredDispatches.map(d => {
    let dateTimingHtml = '';
    if (d.status === 'scheduled') {
      const schDate = d.scheduledFor ? new Date(d.scheduledFor) : null;
      const schStr = schDate ? schDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Pending';
      dateTimingHtml = `
        <div style="font-size: 12px; font-weight: 700; color: #0284c7;">SCHEDULED</div>
        <div style="font-size: 11px; color: var(--p-color-text-subdued);">${schStr}</div>
      `;
    } else {
      const sentDate = d.sentAt ? new Date(d.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Sent';
      dateTimingHtml = `
        <div style="font-size: 12.5px; font-weight: 500;">${sentDate}</div>
        <div style="font-size: 10.5px; font-family: monospace; color: var(--color-text-muted);">${d.id}</div>
      `;
    }

    const promoCode = d.discountCode ? `<code>${escapeHtml(d.discountCode)}</code>` : '<span style="color:var(--p-color-text-subdued);">&mdash;</span>';

    let deliveryBadge = '';
    if (d.status === 'sent') {
      deliveryBadge = `<span class="rank-badge rank-badge-dev" title="Dispatched successfully via mail provider">SENT</span>`;
    } else if (d.status === 'scheduled') {
      deliveryBadge = `<span class="rank-badge rank-badge-scheduled">SCHEDULED</span>`;
    } else if (d.status === 'cancelled') {
      deliveryBadge = `<span class="rank-badge" style="background:#f1f5f9; color:#64748b; border-color:#cbd5e1;">CANCELLED</span>`;
    } else {
      deliveryBadge = `<span class="rank-badge rank-badge-admin">FAILED</span><div style="font-size:11px; color:#bc4141; margin-top:2px;" title="${escapeHtml(d.error || '')}">${escapeHtml(d.error || 'Delivery failed')}</div>`;
    }

    const clickBadge = d.clicked
      ? `<span class="rank-badge rank-badge-vip_plus">${d.clickCount || 1} CLICK${(d.clickCount || 1) > 1 ? 'S' : ''}</span>`
      : `<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>`;

    let conversionBadge = '';
    if (d.conversionStatus === 'converted') {
      conversionBadge = `<span style="font-size:12px; color:#008060; font-weight:600;">£${parseFloat(d.convertedRevenue || 0).toFixed(2)}</span>`;
    } else {
      conversionBadge = `<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>`;
    }

    let actionsHtml = '';
    if (d.status === 'scheduled') {
      actionsHtml = `
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px;" onclick="sendScheduledDispatchNow('${d.id}')" title="Send immediately">⚡ Send Now</button>
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px;" onclick="openRescheduleModal('${d.id}')" title="Reschedule date & time">🕒 Reschedule</button>
          <button type="button" class="Polaris-Button Polaris-Button--slim btn-danger-text" style="font-size: 10.5px; padding: 2px 6px;" onclick="cancelScheduledDispatch('${d.id}')" title="Cancel">✕</button>
        </div>
      `;
    } else if (d.status === 'failed') {
      actionsHtml = `
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim btn-failed-retry" style="font-size: 10.5px; padding: 2px 8px; color: #b91c1c; border-color: #fca5a5; background: #fff5f5; font-weight: 600; display: inline-flex; align-items: center; gap: 3px;" onclick="retryFailedDispatch('${d.id}')" title="Retry Delivery to ${escapeHtml(d.customerEmail)}">
            ⚡ Send Again
          </button>
        </div>
      `;
    } else if (d.status === 'sent') {
      actionsHtml = `
        <div style="display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px;" onclick="retryFailedDispatch('${d.id}')" title="Send again to ${escapeHtml(d.customerEmail)}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            Send Again
          </button>
        </div>
      `;
    } else {
      actionsHtml = `<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>`;
    }

    return `
      <tr>
        <td>
          ${dateTimingHtml}
        </td>
        <td>
          <div style="font-weight: 600; color: var(--color-text-title);">${escapeHtml(d.customerName || 'Customer')}</div>
          <div style="font-size: 12px; color: var(--p-color-text-subdued);">${escapeHtml(d.customerEmail)}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--color-brand); font-size: 12px;">${escapeHtml(d.campaignName || 'Campaign')}</div>
          <div style="font-size: 10.5px; color: var(--color-text-muted); font-weight: 500;">${escapeHtml(d.stageLabel || ('Stage ' + (d.stage || 1)))}</div>
        </td>
        <td>
          <span style="font-size: 12.5px;">${escapeHtml(d.templateName || d.templateId || 'Care Follow-Up')}</span>
        </td>
        <td>
          <div style="font-size: 12.5px; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(d.subject)}">
            ${escapeHtml(d.subject)}
          </div>
        </td>
        <td>
          ${promoCode}
        </td>
        <td>
          ${deliveryBadge}
        </td>
        <td>
          ${clickBadge}
        </td>
        <td>
          ${conversionBadge}
        </td>
        <td style="text-align: right;">
          ${actionsHtml}
        </td>
      </tr>
    `;
  }).join('');
}

/* ========================================================
   CAMPAIGN SEQUENCES & TEMPLATE STUDIO (DYNAMIC CRUD)
   ======================================================== */
function renderCampaignFilterPills() {
  const container = document.getElementById('templateCampaignPills');
  if (!container) return;
  let html = `<button class="Polaris-FilterPill ${activeTemplateCampaign === 'all' ? 'active' : ''}" onclick="setTemplateCampaign('all', this)">All Sequences (${templatesList.length})</button>`;
  campaignsList.forEach(camp => {
    const count = templatesList.filter(t => t.campaignId === camp.id).length;
    html += `<button class="Polaris-FilterPill ${activeTemplateCampaign === camp.id ? 'active' : ''}" onclick="setTemplateCampaign('${camp.id}', this)">${escapeHtml(camp.shortName || camp.name)} (${count})</button>`;
  });
  container.innerHTML = html;
}

function setTemplateCampaign(campaignId, btn) {
  activeTemplateCampaign = campaignId;
  document.querySelectorAll('#templateCampaignPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (campaignId !== 'all') {
    siloCollapseState[campaignId] = false;
  }
  renderTemplateCards();
}

async function loadCampaigns() {
  try {
    const res = await authFetch('/api/campaigns');
    const data = await res.json();
    if (data.success) {
      campaignsList = data.campaigns || [];
      renderCampaignFilterPills();
      renderComposerCampaignTabs();
      populatePresetModalCampaignSelect();
      populateRuleCampaignSelect();
      renderTemplateCards();
    }
  } catch (e) {
    console.error('Failed to load campaigns:', e);
  }
}

async function loadTemplates() {
  try {
    const res = await authFetch('/api/templates');
    const data = await res.json();
    if (data.success) {
      templatesList = data.templates || [];
      const badge = document.getElementById('badgeTemplateCount');
      if (badge) badge.innerText = templatesList.length;
      renderCampaignFilterPills();
      renderTemplateCards();
    }
  } catch (e) {
    console.error('Failed to load templates:', e);
  }
}

function getSiloIconSvg(id) {
  const customCamp = campaignsList.find(c => c.id === id);
  if (customCamp && customCamp.iconSvg) return customCamp.iconSvg;

  switch (id) {
    case 'water_flosser':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#008060" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`;
    case 'bogof_cup':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l-1.5 16a2 2 0 0 1-2 1.8H9.5a2 2 0 0 1-2-1.8L6 3z"/><line x1="6" y1="8" x2="18" y2="8"/></svg>`;
    case 'bogof_spray':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="10" width="10" height="12" rx="2"/><path d="M12 10V6"/><path d="M9 6h6"/><path d="M9 3h3v3"/><line x1="18" y1="5" x2="21" y2="5"/><line x1="18" y1="3" x2="20" y2="2"/><line x1="18" y1="7" x2="20" y2="8"/></svg>`;
    case 'ebook_50':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#744B6F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>`;
    default:
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
  }
}

let siloCollapseState = {};
let allSilosCollapsed = true;

function toggleSiloSection(campaignId) {
  const currentCollapsed = siloCollapseState[campaignId] !== undefined 
    ? Boolean(siloCollapseState[campaignId]) 
    : allSilosCollapsed;
  siloCollapseState[campaignId] = !currentCollapsed;

  const sectionEl = document.getElementById(`silo-${campaignId}`);
  if (sectionEl) {
    if (siloCollapseState[campaignId]) {
      sectionEl.classList.add('collapsed');
    } else {
      sectionEl.classList.remove('collapsed');
    }
  }
}

function toggleAllSilos() {
  allSilosCollapsed = !allSilosCollapsed;
  campaignsList.forEach(c => {
    siloCollapseState[c.id] = allSilosCollapsed;
    const el = document.getElementById(`silo-${c.id}`);
    if (el) {
      if (allSilosCollapsed) el.classList.add('collapsed');
      else el.classList.remove('collapsed');
    }
  });

  const txt = document.getElementById('btnToggleAllSilosText');
  if (txt) txt.innerText = allSilosCollapsed ? 'Expand All' : 'Collapse All';
}

function renderTemplateCards() {
  const container = document.getElementById('templateCardsContainer');
  if (!container) return;

  const campaignsToRender = (activeTemplateCampaign && activeTemplateCampaign !== 'all')
    ? campaignsList.filter(c => c.id === activeTemplateCampaign)
    : campaignsList;

  if (campaignsToRender.length === 0) {
    container.innerHTML = `
      <div class="Polaris-Card" style="padding: 48px; text-align: center; color: var(--p-color-text-subdued);">
        <p style="margin-bottom: 12px;">No campaigns found.</p>
        <button class="Polaris-Button Polaris-Button--primary" onclick="openNewCampaignModal()">+ Create New Campaign</button>
      </div>
    `;
    return;
  }

  container.innerHTML = campaignsToRender.map(camp => {
    const siloTemplates = templatesList.filter(t => t.campaignId === camp.id).sort((a, b) => (a.stage || 1) - (b.stage || 1));
    const isCollapsed = siloCollapseState[camp.id] !== undefined 
      ? Boolean(siloCollapseState[camp.id]) 
      : allSilosCollapsed;

    const sequenceRowsHtml = siloTemplates.length === 0
      ? `<div style="padding: 24px; text-align: center; color: var(--p-color-text-subdued); font-size: 13px;">
          No presets added to this campaign yet. 
          <button class="Polaris-Button Polaris-Button--slim" style="margin-left: 8px;" onclick="openNewPresetModal('${camp.id}')">+ Add First Stage Preset</button>
        </div>`
      : siloTemplates.map(t => {
          const stageNum = t.stage || 1;
          const stageLabel = t.stageLabel || `Stage ${stageNum}`;
          const trackingCode = (t.discountCode && t.discountCode !== 'NONE' && t.discountCode !== '0') ? t.discountCode : 'TDS-CARE';
          const offerBadge = `<span class="sequence-tracking-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px; margin-right:3px;"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>Tracking: <code>${escapeHtml(trackingCode)}</code></span>`;

          return `
            <div class="sequence-row">
              <div class="sequence-col sequence-col-stage">
                <span class="stage-label-badge">
                  ${escapeHtml(stageLabel)}
                </span>
              </div>

              <div class="sequence-col sequence-col-info">
                <div class="sequence-name">${escapeHtml(t.name)}</div>
                <div class="sequence-desc">${escapeHtml(t.description || 'Clinical guidance and follow-up.')}</div>
              </div>

              <div class="sequence-col sequence-col-meta">
                <div class="sequence-subject" title="${escapeHtml(t.subject)}"><strong>Subject:</strong> ${escapeHtml(t.subject)}</div>
                <div class="sequence-offer">${offerBadge}</div>
              </div>

              <div class="sequence-col sequence-col-actions">
                <button class="Polaris-Button Polaris-Button--slim" onclick="openTemplateEditor('${t.id}')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Edit Code
                </button>
                <button class="Polaris-Button Polaris-Button--dark Polaris-Button--slim" onclick="openComposerWithTemplate('${t.id}')">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Send &rarr;
                </button>
                <button class="Polaris-Button Polaris-Button--slim btn-danger-text" onclick="deleteTemplate('${t.id}')" title="Delete preset">
                  &times;
                </button>
              </div>
            </div>
          `;
        }).join('');

    const iconHtml = camp.iconSvg || getSiloIconSvg(camp.id);

    return `
      <div class="silo-section ${isCollapsed ? 'collapsed' : ''}" id="silo-${camp.id}">
        <div class="silo-header" onclick="toggleSiloSection('${camp.id}')">
          <div class="silo-header__left">
            <div class="silo-icon">${iconHtml}</div>
            <div>
              <div class="silo-title">${escapeHtml(camp.name)}</div>
              <div class="silo-subtitle">${siloTemplates.length} follow-up presets in this sequence</div>
            </div>
          </div>
          <div class="silo-header__right" onclick="event.stopPropagation()">
            <button class="Polaris-Button Polaris-Button--slim" onclick="openNewPresetModal('${camp.id}')" title="Add a new stage/preset to this campaign">
              + Add Stage
            </button>
            <button class="Polaris-Button Polaris-Button--slim" onclick="openEditCampaignModal('${camp.id}')" title="Edit campaign details">
              Edit
            </button>
            <button class="Polaris-Button Polaris-Button--slim btn-danger-text" onclick="deleteCampaign('${camp.id}')" title="Delete campaign">
              Delete
            </button>
            <button class="Polaris-Button Polaris-Button--slim" onclick="openComposerWithTemplate('${siloTemplates[0]?.id || ''}')">
              Send Stage 1 &rarr;
            </button>
            <button type="button" class="silo-toggle-chevron-btn" onclick="toggleSiloSection('${camp.id}')" title="Expand / Collapse Sequence">
              <svg class="silo-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        </div>

        <div class="silo-body" id="silo-body-${camp.id}">
          ${sequenceRowsHtml}
        </div>
      </div>
    `;
  }).join('');

  const btnTxt = document.getElementById('btnToggleAllSilosText');
  if (btnTxt) {
    btnTxt.innerText = allSilosCollapsed ? 'Expand All' : 'Collapse All';
  }
}

/* ========================================================
   CAMPAIGN CRUD MODAL HANDLERS
   ======================================================== */
function openNewCampaignModal() {
  document.getElementById('campaignModalTitle').innerText = 'Create New Campaign';
  document.getElementById('campModalId').value = '';
  document.getElementById('campModalName').value = '';
  document.getElementById('campModalShortName').value = '';
  document.getElementById('campModalColor').value = '#008060';
  document.getElementById('campModalIconSelect').value = 'droplet';
  document.getElementById('btnSaveCampaign').innerText = 'Save Campaign';
  document.getElementById('modalNewCampaign').classList.add('active');
}

function openEditCampaignModal(campId) {
  const camp = campaignsList.find(c => c.id === campId);
  if (!camp) return;

  document.getElementById('campaignModalTitle').innerText = `Edit: ${camp.name}`;
  document.getElementById('campModalId').value = camp.id;
  document.getElementById('campModalName').value = camp.name || '';
  document.getElementById('campModalShortName').value = camp.shortName || '';
  document.getElementById('campModalColor').value = camp.color || '#008060';
  document.getElementById('btnSaveCampaign').innerText = 'Update Campaign';
  document.getElementById('modalNewCampaign').classList.add('active');
}

function closeCampaignModal() {
  document.getElementById('modalNewCampaign').classList.remove('active');
}

async function saveCampaignForm(e) {
  e.preventDefault();
  const id = document.getElementById('campModalId').value.trim();
  const name = document.getElementById('campModalName').value.trim();
  const shortName = document.getElementById('campModalShortName').value.trim();
  const color = document.getElementById('campModalColor').value;
  const iconChoice = document.getElementById('campModalIconSelect').value;

  const iconsMap = {
    droplet: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
    cup: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l-1.5 16a2 2 0 0 1-2 1.8H9.5a2 2 0 0 1-2-1.8L6 3z"/><line x1="6" y1="8" x2="18" y2="8"/></svg>',
    spray: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="10" width="10" height="12" rx="2"/><path d="M12 10V6"/><path d="M9 6h6"/><path d="M9 3h3v3"/><line x1="18" y1="5" x2="21" y2="5"/><line x1="18" y1="3" x2="20" y2="2"/><line x1="18" y1="7" x2="20" y2="8"/></svg>',
    book: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>',
    star: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    sparkles: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M3 12h18M6.5 6.5l11 11M6.5 17.5l11-11"/></svg>',
    shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    tag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>'
  };

  const iconSvg = iconsMap[iconChoice] || iconsMap.droplet;

  try {
    const url = id ? `/api/campaigns/${encodeURIComponent(id)}` : '/api/campaigns';
    const method = 'POST';
    const res = await authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, shortName, color, iconSvg })
    });
    const data = await res.json();
    if (data.success) {
      showToast(id ? 'Campaign updated!' : 'New campaign created!', 'success');
      closeCampaignModal();
      await loadCampaigns();
      await loadTemplates();
    } else {
      showToast(data.error || 'Failed to save campaign', 'error');
    }
  } catch (err) {
    showToast('Network error while saving campaign', 'error');
  }
}

async function deleteCampaign(campId) {
  const camp = campaignsList.find(c => c.id === campId);
  if (!camp) return;

  const confirmDelete = confirm(`Are you sure you want to delete campaign "${camp.name}"?\n\nThis will also remove all stage presets inside it.`);
  if (!confirmDelete) return;

  try {
    const res = await authFetch(`/api/campaigns/${encodeURIComponent(campId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Campaign "${camp.name}" deleted.`, 'success');
      await loadCampaigns();
      await loadTemplates();
    } else {
      showToast(data.error || 'Failed to delete campaign', 'error');
    }
  } catch (e) {
    showToast('Network error deleting campaign', 'error');
  }
}

/* ========================================================
   PRESET (STAGE) CRUD MODAL HANDLERS
   ======================================================== */
function populatePresetModalCampaignSelect() {
  const sel = document.getElementById('presetModalCampaignSelect');
  if (!sel) return;
  sel.innerHTML = campaignsList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

function openNewPresetModal(preselectedCampId = null) {
  populatePresetModalCampaignSelect();
  const campId = preselectedCampId || campaignsList[0]?.id || 'water_flosser';
  const sel = document.getElementById('presetModalCampaignSelect');
  if (sel) sel.value = campId;

  const count = templatesList.filter(t => t.campaignId === campId).length;
  const nextStage = count + 1;

  document.getElementById('presetModalStage').value = nextStage;
  document.getElementById('presetModalStageLabel').value = `Stage ${nextStage}: Follow-Up`;
  document.getElementById('presetModalName').value = '';
  document.getElementById('presetModalDesc').value = '';
  document.getElementById('presetModalSubject').value = '';
  document.getElementById('presetModalDiscountCode').value = 'TDS-CARE';
  if (document.getElementById('presetModalDiscountPercent')) {
    document.getElementById('presetModalDiscountPercent').value = 0;
  }

  document.getElementById('modalNewPreset').classList.add('active');
}

function closePresetModal() {
  document.getElementById('modalNewPreset').classList.remove('active');
}

async function savePresetForm(e) {
  e.preventDefault();
  const campaignId = document.getElementById('presetModalCampaignSelect').value;
  const stage = parseInt(document.getElementById('presetModalStage').value, 10) || 1;
  const stageLabel = document.getElementById('presetModalStageLabel').value.trim();
  const name = document.getElementById('presetModalName').value.trim();
  const description = document.getElementById('presetModalDesc').value.trim();
  const subject = document.getElementById('presetModalSubject').value.trim();
  const discountCode = document.getElementById('presetModalDiscountCode')?.value.trim() || 'TDS-CARE';
  const discountPercent = 0;

  try {
    const res = await authFetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId,
        stage,
        stageLabel,
        name,
        description,
        subject,
        discountCode,
        discountPercent
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Preset "${name}" created!`, 'success');
      closePresetModal();
      await loadTemplates();
    } else {
      showToast(data.error || 'Failed to create preset', 'error');
    }
  } catch (err) {
    showToast('Network error while creating preset', 'error');
  }
}

async function deleteTemplate(tplId) {
  const tpl = templatesList.find(t => t.id === tplId);
  if (!tpl) return;

  const ok = confirm(`Delete preset "${tpl.name}"?\n\nThis action cannot be undone.`);
  if (!ok) return;

  try {
    const res = await authFetch(`/api/templates/${encodeURIComponent(tplId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Preset "${tpl.name}" deleted.`, 'success');
      await loadTemplates();
    } else {
      showToast(data.error || 'Failed to delete preset', 'error');
    }
  } catch (err) {
    showToast('Network error deleting preset', 'error');
  }
}

/* ========================================================
   AUTOMATED RULES MODAL HANDLERS
   ======================================================== */
let rulesList = [];

function populateRuleCampaignSelect() {
  const sel = document.getElementById('ruleInputCampaignSelect');
  if (!sel) return;
  sel.innerHTML = campaignsList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

async function openRulesModal() {
  populateRuleCampaignSelect();
  await loadRules();
  document.getElementById('modalRules').classList.add('active');
}

function closeRulesModal() {
  document.getElementById('modalRules').classList.remove('active');
}

function toggleNewRuleForm() {
  const wrap = document.getElementById('newRuleFormWrap');
  if (!wrap) return;
  wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
}

function onRuleTriggerTypeChange() {
  const type = document.getElementById('ruleInputTriggerType').value;
  const valWrap = document.getElementById('ruleInputValueWrap');
  const label = document.getElementById('ruleInputValueLabel');
  const input = document.getElementById('ruleInputValue');

  if (type === 'spend_min') {
    valWrap.style.display = 'block';
    label.innerText = 'Min Amount (£)';
    input.value = 150;
  } else if (type === 'orders_min') {
    valWrap.style.display = 'block';
    label.innerText = 'Min Orders Count';
    input.value = 2;
  } else {
    valWrap.style.display = 'none';
  }
}

async function loadRules() {
  try {
    const res = await authFetch('/api/rules');
    const data = await res.json();
    if (data.success) {
      rulesList = data.rules || [];
      renderRulesList();
    }
  } catch (e) {
    console.error('Failed to load rules:', e);
  }
}

function renderRulesList() {
  const container = document.getElementById('rulesListContainer');
  if (!container) return;

  if (rulesList.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--p-color-text-subdued); font-size: 13px;">
        No automated follow-up rules configured yet.
      </div>
    `;
    return;
  }

  container.innerHTML = rulesList.map(r => {
    const camp = campaignsList.find(c => c.id === r.campaignId);
    const campName = camp?.name || r.campaignId;
    let condStr = '';
    if (r.triggerType === 'spend_min') condStr = `Customer Total Spent &ge; &pound;${r.triggerValue}`;
    else if (r.triggerType === 'orders_min') condStr = `Orders Placed &ge; ${r.triggerValue}`;
    else if (r.triggerType === 'never_followed_up') condStr = 'Never Followed Up';
    else condStr = 'All Store Customers';

    const lastRunStr = r.lastRunAt
      ? new Date(r.lastRunAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : 'Never run';

    return `
      <div class="rule-item-card">
        <div class="rule-item-left">
          <div class="rule-item-title">${escapeHtml(r.name)}</div>
          <div class="rule-item-meta">
            <strong>Condition:</strong> ${condStr} &nbsp;|&nbsp;
            <strong>Target:</strong> ${escapeHtml(campName)} (Stage ${r.stage || 1})
          </div>
          <div style="font-size: 11px; color: var(--p-color-text-subdued);">
            Dispatched so far: <strong>${r.enrolledCount || 0}</strong> emails · Last Run: ${lastRunStr}
          </div>
        </div>
        <div class="rule-item-right">
          <button class="Polaris-Button Polaris-Button--primary Polaris-Button--slim" onclick="runRuleNow('${r.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Run Rule Now
          </button>
          <button class="Polaris-Button Polaris-Button--slim btn-danger-text" onclick="deleteRule('${r.id}')" title="Delete rule">
            &times;
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function submitNewRuleForm(e) {
  e.preventDefault();
  const name = document.getElementById('ruleInputName').value.trim();
  const triggerType = document.getElementById('ruleInputTriggerType').value;
  const triggerValue = document.getElementById('ruleInputValue')?.value || 0;
  const campaignId = document.getElementById('ruleInputCampaignSelect').value;
  const stage = parseInt(document.getElementById('ruleInputStageSelect').value, 10) || 1;

  try {
    const res = await authFetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        triggerType,
        triggerValue,
        campaignId,
        stage,
        active: true
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Rule "${name}" created!`, 'success');
      toggleNewRuleForm();
      document.getElementById('ruleInputName').value = '';
      await loadRules();
    } else {
      showToast(data.error || 'Failed to create rule', 'error');
    }
  } catch (err) {
    showToast('Network error saving rule', 'error');
  }
}

async function deleteRule(id) {
  const rule = rulesList.find(r => r.id === id);
  if (!rule) return;
  const ok = confirm(`Delete rule "${rule.name}"?`);
  if (!ok) return;

  try {
    const res = await authFetch(`/api/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`Rule "${rule.name}" deleted.`, 'success');
      await loadRules();
    }
  } catch (e) {
    showToast('Network error deleting rule', 'error');
  }
}

async function runRuleNow(id) {
  const rule = rulesList.find(r => r.id === id);
  if (!rule) return;

  showToast(`Running automated rule "${rule.name}"...`, 'info');

  try {
    const res = await authFetch(`/api/rules/${encodeURIComponent(id)}/run`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || `Rule executed: ${data.sent} sent!`, 'success');
      await Promise.all([loadRules(), loadStats(), loadCustomers(), loadDispatches()]);
    } else {
      showToast(data.error || 'Failed to execute rule', 'error');
    }
  } catch (err) {
    showToast('Error executing rule', 'error');
  }
}

function openComposerWithTemplate(templateId = null) {
  if (selectedCustomerIds.size > 0) {
    const targets = customersList.filter(c => selectedCustomerIds.has(String(c.id)));
    openComposer(targets[0], templateId, targets.length > 1);
  } else {
    const customer = customersList[0] || {
      id: 'demo_patient',
      first_name: 'Dr. Marc',
      last_name: 'Mortiboys',
      name: 'Dr. Marc Mortiboys',
      email: 'shop@thedentalshaman.com',
      orders_count: 3,
      total_spent: '149.00'
    };
    openComposer(customer, templateId, false);
  }
}

/* ========================================================
   AUTO-RESIZING & MOBILE ERGONOMICS UTILITIES (v18.13)
   ======================================================== */
function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(58, el.scrollHeight + 4) + 'px';
}

function updateSubjectCharCount() {
  const subj = document.getElementById('tplEditorSubject')?.value || '';
  const countEl = document.getElementById('tplEditorSubjectCount');
  if (countEl) {
    const len = subj.length;
    const note = len <= 60 ? 'Ideal length' : 'Longer on mobile';
    countEl.innerText = `${len} / 60 chars • ${note}`;
    countEl.style.color = len > 70 ? '#d97706' : 'var(--p-color-text-subdued)';
  }
}

function toggleTemplateZeroDiscount(checkbox) {
  // Deprecated - zero discounts platform wide
}

/* ========================================================
   IN-BROWSER TEMPLATE STUDIO & CODE EDITOR MODAL
   ======================================================== */
async function openTemplateEditor(templateId) {
  const tpl = templatesList.find(t => t.id === templateId);
  if (!tpl) {
    showToast('Template not found', 'error');
    return;
  }
  currentEditingTemplate = tpl;

  document.getElementById('editorModalTitle').innerText = tpl.name || 'Edit Template';
  document.getElementById('editorStageBadge').className = `stage-pill stage-${tpl.stage || 1}`;
  document.getElementById('editorStageBadge').innerText = (tpl.stageLabel || `Stage ${tpl.stage || 1}`).toUpperCase();
  document.getElementById('editorCampaignBadge').innerText = `${tpl.campaignName || tpl.campaignId} • Stage ${tpl.stage || 1} of 5`;
  const filePathEl = document.getElementById('tplEditorFilePath');
  if (filePathEl) filePathEl.innerText = `templates/${tpl.file || (tpl.id + '.html')}`;

  document.getElementById('tplEditorName').value = tpl.name || '';
  document.getElementById('tplEditorSubject').value = tpl.subject || '';
  document.getElementById('tplEditorPromoCode').value = (tpl.discountCode && tpl.discountCode !== 'NONE') ? tpl.discountCode : 'TDS-CARE';
  if (document.getElementById('tplEditorDiscountPercent')) {
    document.getElementById('tplEditorDiscountPercent').value = 0;
  }
  document.getElementById('tplEditorDescription').value = tpl.description || '';

  // Trigger auto-resizing & counters
  setTimeout(() => {
    autoResizeTextarea(document.getElementById('tplEditorName'));
    autoResizeTextarea(document.getElementById('tplEditorSubject'));
    autoResizeTextarea(document.getElementById('tplEditorDescription'));
    updateSubjectCharCount();
  }, 20);

  // Default mode: clean live preview
  setTemplateEditorMode('preview');

  // Load raw HTML
  try {
    const res = await authFetch(`/api/templates/${tpl.id}/raw`);
    const data = await res.json();
    if (data.success && data.html) {
      document.getElementById('tplEditorHtml').value = data.html;
    } else {
      document.getElementById('tplEditorHtml').value = tpl.htmlContent || '';
    }
  } catch (e) {
    document.getElementById('tplEditorHtml').value = tpl.htmlContent || '';
  }

  updateEditorLivePreview();
  document.getElementById('templateEditorModal').classList.add('active');
}

function setTemplateEditorMode(mode) {
  const panes = ['preview', 'settings', 'code'];
  panes.forEach(p => {
    const paneEl = document.getElementById(`tplPane${p.charAt(0).toUpperCase() + p.slice(1)}`);
    const btnEl = document.getElementById(`btnTplMode${p.charAt(0).toUpperCase() + p.slice(1)}`);
    if (paneEl) {
      if (p === mode) {
        paneEl.style.display = 'block';
        paneEl.classList.add('active');
      } else {
        paneEl.style.display = 'none';
        paneEl.classList.remove('active');
      }
    }
    if (btnEl) btnEl.classList.toggle('active', p === mode);
  });

  if (mode === 'preview') {
    updateEditorLivePreview();
  } else if (mode === 'settings') {
    setTimeout(() => {
      autoResizeTextarea(document.getElementById('tplEditorName'));
      autoResizeTextarea(document.getElementById('tplEditorSubject'));
      autoResizeTextarea(document.getElementById('tplEditorDescription'));
      updateSubjectCharCount();
    }, 20);
  }
}

function copyEditorHtml() {
  const code = document.getElementById('tplEditorHtml')?.value || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(() => {
      showToast('HTML code copied to clipboard', 'info');
    }).catch(() => {
      showToast('HTML code copied', 'info');
    });
  } else {
    showToast('HTML code copied', 'info');
  }
}

function insertTagIntoSubject(tag) {
  const subjInput = document.getElementById('tplEditorSubject');
  if (subjInput) {
    subjInput.value = (subjInput.value + ' ' + tag).trim();
    autoResizeTextarea(subjInput);
    updateSubjectCharCount();
    subjInput.focus();
    updateEditorLivePreview();
    showToast(`Added ${tag} to Subject Line`, 'info');
  }
}

function closeTemplateEditor() {
  document.getElementById('templateEditorModal').classList.remove('active');
  currentEditingTemplate = null;
}

function updateEditorLivePreview() {
  clearTimeout(editorDebounceTimer);
  editorDebounceTimer = setTimeout(async () => {
    if (!currentEditingTemplate) return;
    const tplId = currentEditingTemplate.id;
    const customSubject = document.getElementById('tplEditorSubject').value;
    const customDiscountCode = document.getElementById('tplEditorPromoCode').value;
    const customBody = document.getElementById('tplEditorHtml').value;

    try {
      const res = await authFetch(`/api/templates/${tplId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: { first_name: 'Patient', name: 'Valued Client', email: 'shop@thedentalshaman.com' },
          customSubject,
          customDiscountCode,
          customBody
        })
      });
      const data = await res.json();
      if (data.success && data.rendered) {
        document.getElementById('tplEditorPreviewFrame').innerHTML = sanitizePreviewHtml(data.rendered.html);
      }
    } catch (e) {
      console.error('Editor preview render error:', e);
    }
  }, 300);
}

function setEditorPreviewDevice(device, btn) {
  const container = document.getElementById('tplEditorPreviewFrame');
  document.querySelectorAll('#templateEditorModal .preview-toolbar .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (device === 'mobile') {
    container.classList.remove('device-desktop');
    container.classList.add('device-mobile');
    container.style.maxWidth = '375px';
    container.style.margin = '0 auto';
    container.style.border = '1px solid #d1d5db';
    container.style.borderRadius = '12px';
  } else {
    container.classList.remove('device-mobile');
    container.classList.add('device-desktop');
    container.style.maxWidth = '100%';
    container.style.margin = '0';
    container.style.border = '1px solid var(--p-color-border)';
    container.style.borderRadius = '8px';
  }
}

async function saveTemplateEdits() {
  if (!currentEditingTemplate) return;
  const btn = document.getElementById('btnSaveTemplateEdits');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #ffffff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span> Saving to Disk...`;

  const name = document.getElementById('tplEditorName').value.trim();
  const subject = document.getElementById('tplEditorSubject').value.trim();
  const discountCode = document.getElementById('tplEditorPromoCode')?.value.trim() || 'TDS-CARE';
  const discountPercent = 0;
  const description = document.getElementById('tplEditorDescription').value.trim();
  const htmlContent = document.getElementById('tplEditorHtml').value;

  try {
    const res = await authFetch(`/api/templates/${currentEditingTemplate.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        subject,
        discountCode,
        discountPercent,
        description,
        htmlContent
      })
    });
    const data = await res.json();
    if (data.success && data.template) {
      showToast('Template and HTML code saved successfully.', 'success');
      // Update in local array
      const idx = templatesList.findIndex(t => t.id === currentEditingTemplate.id);
      if (idx !== -1) {
        templatesList[idx] = data.template;
      }
      renderTemplateCards();
      closeTemplateEditor();
    } else {
      showToast(data.error || 'Failed to save template', 'error');
    }
  } catch (err) {
    showToast('Network error while saving template: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Changes`;
  }
}

async function sendEditorTestEmail() {
  if (!currentEditingTemplate) return;
  const testEmail = prompt('Enter your recipient email to receive a live test preview:', 'teamdynabyte@gmail.com');
  if (!testEmail || !testEmail.includes('@')) return;

  const customSubject = document.getElementById('tplEditorSubject').value;
  const customDiscountCode = document.getElementById('tplEditorPromoCode').value;
  const customBody = document.getElementById('tplEditorHtml').value;

  showToast(`Transmitting live preview to ${testEmail}...`, 'info');

  try {
    const res = await authFetch('/api/followup/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testEmail,
        templateId: currentEditingTemplate.id,
        customSubject,
        customDiscountCode,
        customBody
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Test preview delivered to ${testEmail} in ~150ms!`, 'success');
    } else {
      showToast(data.error || 'Failed to dispatch test preview', 'error');
    }
  } catch (err) {
    showToast('Failed to send test preview email', 'error');
  }
}

/* ========================================================
   SETTINGS & INTEGRATION
   ======================================================== */
async function loadSettings() {
  try {
    const res = await authFetch('/api/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      const s = data.settings;
      if (document.getElementById('settingSenderName')) document.getElementById('settingSenderName').value = s.senderName || '';
      if (document.getElementById('settingSenderEmail')) document.getElementById('settingSenderEmail').value = s.senderEmail || '';
      if (document.getElementById('settingReplyTo')) document.getElementById('settingReplyTo').value = s.replyTo || '';
      if (document.getElementById('settingResendApiKey')) document.getElementById('settingResendApiKey').value = s.resendApiKey || '';
      if (document.getElementById('settingDefaultPromo')) document.getElementById('settingDefaultPromo').value = s.defaultDiscountCode || 'TDS-CARE';
      if (document.getElementById('settingEmailProvider')) document.getElementById('settingEmailProvider').value = s.emailProvider || 'google_workspace';
      if (document.getElementById('settingSmtpPass') && s.smtpPass) document.getElementById('settingSmtpPass').value = s.smtpPass;
      toggleProviderSettingsFields();
    }

    // Render Device Security info in Settings
    const auth = getStoredDeviceAuth();
    const deviceStatusEl = document.getElementById('deviceAuthStatusText');
    if (deviceStatusEl) {
      if (auth.isRemembered && auth.exp) {
        const daysLeft = Math.max(1, Math.round((auth.exp - Date.now()) / (24 * 60 * 60 * 1000)));
        const expDateStr = new Date(auth.exp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        deviceStatusEl.innerHTML = `<span style="color: #166534; font-weight: 600;">&check; Authorized &bull; 30-Day Device Trust Active</span><br><span style="font-size: 11.5px; color: var(--p-color-text-subdued);">${daysLeft} days remaining on this device (valid until ${expDateStr}).</span>`;
      } else {
        deviceStatusEl.innerText = 'Session-only access (device not remembered).';
      }
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function toggleProviderSettingsFields() {
  const provider = document.getElementById('settingEmailProvider')?.value || 'google_workspace';
  const gmailField = document.getElementById('fieldGoogleAppPass');
  const resendField = document.getElementById('fieldResendKey');
  const gmailCard = document.getElementById('gmailConnectedCard');

  if (provider === 'google_workspace') {
    if (gmailField) gmailField.style.display = 'block';
    if (resendField) resendField.style.display = 'none';
    if (gmailCard) gmailCard.style.display = 'flex';
  } else {
    if (gmailField) gmailField.style.display = 'none';
    if (resendField) resendField.style.display = 'block';
    if (gmailCard) gmailCard.style.display = 'none';
  }
}

async function testGoogleWorkspaceConnection() {
  showToast('Testing Google Workspace Gmail connection (smtp.gmail.com:465)...', 'info');
  try {
    const pass = (document.getElementById('settingSmtpPass')?.value || '').trim();
    const res = await authFetch('/api/settings/verify-gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ smtpPass: pass })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Google Workspace Gmail connection verified successfully!', 'success');
    } else if (data.isFirewallBlocked) {
      showToast('Cloud host blocks raw SMTP ports. System will use HTTPS gateway from shop@thedentalshaman.com.', 'warning');
    } else {
      showToast('Google Workspace connection failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Failed to test connection: ' + e.message, 'error');
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = {
    senderName: document.getElementById('settingSenderName').value.trim(),
    senderEmail: document.getElementById('settingSenderEmail').value.trim(),
    replyTo: document.getElementById('settingReplyTo').value.trim(),
    emailProvider: document.getElementById('settingEmailProvider').value,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    smtpUser: document.getElementById('settingSenderEmail').value.trim(),
    smtpPass: document.getElementById('settingSmtpPass').value.trim().replace(/\s+/g, ''),
    resendApiKey: document.getElementById('settingResendApiKey').value.trim(),
    defaultDiscountCode: document.getElementById('settingDefaultPromo')?.value.trim() || 'TDS-CARE'
  };

  try {
    const res = await authFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Settings successfully updated and saved!', 'success');
    } else {
      showToast(data.error || 'Failed to save settings', 'error');
    }
  } catch (err) {
    showToast('Failed to save settings', 'error');
  }
}

async function sendDiagnosticTestEmail() {
  const input = document.getElementById('diagnosticTestEmail');
  const recipient = input.value.trim();
  if (!recipient || !recipient.includes('@')) {
    showToast('Please enter a valid diagnostic test email address.', 'error');
    return;
  }

  showToast(`Transmitting diagnostic test follow-up to ${recipient}...`, 'info');

  try {
    const res = await authFetch('/api/followup/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testEmail: recipient,
        templateId: 'post_purchase_care'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Diagnostic email successfully sent to ${recipient} via ${data.usedProtocol || 'Google Workspace Gmail'}!`, 'success');
      await Promise.all([loadStats(), loadDispatches()]);
    } else {
      showToast(data.error || 'Diagnostic email failed', 'error');
    }
  } catch (err) {
    showToast('Failed to transmit diagnostic test email', 'error');
  }
}

/* ========================================================
   TOAST NOTIFICATION ENGINE
   ======================================================== */
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  let iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  if (type === 'success') {
    iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }

  toast.innerHTML = `<span style="display:inline-flex; align-items:center; margin-right:8px;">${iconSvg}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('visible'), 10);

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 4000);
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

// Close popovers on click outside
document.addEventListener('click', (e) => {
  const popover = document.getElementById('spendPopover');
  const btn = document.getElementById('btnCustomSpendPopover');
  if (popover && popover.style.display !== 'none') {
    if (!popover.contains(e.target) && (!btn || !btn.contains(e.target))) {
      popover.style.display = 'none';
    }
  }
});

/* ========================================================
   START FRESH SEQUENCE & MULTI-STAGE AUTOMATION SYSTEM
   ======================================================== */

const DEFAULT_STARTER_CLINICAL_HTML = `<!-- THE DENTAL SHAMAN • CLINICAL CARE SEQUENCE -->
<div style="font-family:Georgia, 'Times New Roman', serif; max-width:600px; margin:0 auto; background-color:#faf8f5; border:1px solid #e8e3ec; border-radius:8px; overflow:hidden; color:#2d2d2d;">
  <!-- HEADER -->
  <div style="background-color:#0d0820; padding:28px 24px 22px 24px; text-align:center;">
    <a href="{{shop_url}}" target="_blank" style="text-decoration:none; display:inline-block; margin-bottom:14px;">
      <img src="https://thedentalshaman.com/assets/tds_logo_header.png" alt="The Dental Shaman" style="height:46px; width:auto; display:block; margin:0 auto; border:0;">
    </a>
    <p style="color:#2D8B7A; font-size:11px; letter-spacing:2px; text-transform:uppercase; margin:0 0 8px 0; font-family:Arial,sans-serif; font-weight:bold;">
      The Dental Shaman · Clinical Care Series
    </p>
    <h1 style="color:#ffffff; font-size:24px; font-weight:normal; margin:0; line-height:1.3; font-style:italic;">
      Personal Clinical Follow-Up &amp; Care
    </h1>
  </div>

  <!-- CONTENT -->
  <div style="padding:32px 28px 24px 28px; background:#ffffff;">
    <p style="font-size:16px; line-height:1.6; margin:0 0 16px 0;">
      Dear {{first_name}},
    </p>
    <div style="font-size:15px; line-height:1.65; color:#444444; margin:0 0 20px 0;">
      I wanted to follow up with you personally to share essential clinical observations and best practices. Biological dentistry prioritizes supporting your natural oral microbiome and long-term periodontal health.
    </div>

    <!-- CLINICAL POINTS -->
    <div style="background-color:#fbf7fa; border-left:4px solid #744B6F; padding:18px 20px; margin:22px 0; border-radius:0 6px 6px 0;">
      <h3 style="color:#744B6F; font-size:14px; margin:0 0 10px 0; font-family:Arial,sans-serif; text-transform:uppercase; letter-spacing:0.5px;">
        Clinical Protocol Recommendations:
      </h3>
      <ul style="margin:0; padding-left:18px; font-family:Arial,sans-serif; font-size:13.5px; color:#4a4a4a; line-height:1.6;">
        <li style="margin-bottom:8px;"><strong style="color:#0d0820;">Consistent Routine:</strong> Perform your home care protocol each evening to disrupt bacterial biofilm development.</li>
        <li style="margin-bottom:8px;"><strong style="color:#0d0820;">Gentle Motion:</strong> Avoid aggressive pressure along the gumline to protect delicate periodontal attachments.</li>
        <li style="margin-bottom:8px;"><strong style="color:#0d0820;">Hydration:</strong> Maintain healthy hydration with pure water to optimize salivary immune factors.</li>
      </ul>
    </div>

    <!-- CTA -->
    <div style="text-align:center; margin:32px 0 24px 0;">
      <a href="{{shop_url}}" target="_blank" style="background-color:#744B6F; color:#ffffff; font-family:Arial,sans-serif; font-size:14.5px; font-weight:bold; text-decoration:none; padding:14px 32px; border-radius:6px; display:inline-block; letter-spacing:0.5px; box-shadow:0 4px 14px rgba(116,75,111,0.25);">
        Visit Our Biological Care Store &rarr;
      </a>
    </div>

    <p style="font-size:14px; line-height:1.6; color:#666666; margin:28px 0 0 0; border-top:1px solid #f0ecf2; padding-top:20px;">
      Warmest holistic wishes,<br>
      <strong style="color:#0d0820;">Dr. Marc Mortiboys (BDS)</strong><br>
      <span style="font-size:12.5px; color:#888888;">Founder &amp; Biological Dental Surgeon &middot; The Dental Shaman</span>
    </p>
  </div>

  <!-- FOOTER -->
  <div style="background-color:#faf8f5; padding:20px 24px; text-align:center; font-family:Arial,sans-serif; font-size:11.5px; color:#888888; border-top:1px solid #e8e3ec;">
    <p style="margin:0 0 6px 0;">The Dental Shaman &middot; Surrey, United Kingdom &middot; shop.thedentalshaman.com</p>
    <p style="margin:0;">Ref: {{tracking_code}} &middot; You are receiving this personal communication as a valued client of The Dental Shaman.</p>
  </div>
</div>`;

let freshRecipients = [];
let freshStages = [];
let activeFreshStageIndex = 0;
let activeFreshPreviewDevice = 'desktop';
let freshPresetsList = [];

function generateRandomTrackingCode(prefix = 'CARE', stageNum = 1) {
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TDS-${prefix}-${rand}-S${stageNum}`;
}

function openFreshSequenceComposer() {
  // If customers are selected on the table, pre-populate them
  freshRecipients = [];
  if (selectedCustomerIds && selectedCustomerIds.size > 0) {
    selectedCustomerIds.forEach(id => {
      const c = customersList.find(cust => String(cust.id) === String(id));
      if (c && c.email) {
        freshRecipients.push({
          id: c.id,
          email: c.email.toLowerCase(),
          name: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
          first_name: c.first_name || (c.name ? c.name.split(' ')[0] : 'there'),
          isShopifyCustomer: true
        });
      }
    });
  }

  // Initialize with 1 default clean starter stage
  freshStages = [
    {
      stage: 1,
      label: 'Stage 1 (Instant)',
      delayDays: 0,
      scheduledFor: null,
      subject: 'A personal clinical note from Dr. Marc Mortiboys (BDS)',
      trackingCode: generateRandomTrackingCode('FRESH', 1),
      htmlContent: DEFAULT_STARTER_CLINICAL_HTML
    }
  ];
  activeFreshStageIndex = 0;

  renderFreshRecipientsChips();
  renderFreshStageStrip();
  loadFreshStageToEditor(0);
  loadFreshPresets();
  setFreshComposerMode('edit');

  const countBadge = document.getElementById('freshSelectedCustomerCount');
  if (countBadge) countBadge.textContent = selectedCustomerIds ? selectedCustomerIds.size : 0;

  const modal = document.getElementById('freshSequenceModal');
  if (modal) modal.classList.add('active');
}

function setFreshComposerMode(mode) {
  const modal = document.getElementById('freshSequenceModal');
  const btnEdit = document.getElementById('btnFreshModeEdit');
  const btnPrev = document.getElementById('btnFreshModePreview');
  if (!modal) return;

  if (mode === 'preview') {
    if (btnEdit) btnEdit.classList.remove('active');
    if (btnPrev) btnPrev.classList.add('active');
    modal.classList.add('mode-preview');
    updateFreshPreview();
  } else {
    if (btnEdit) btnEdit.classList.add('active');
    if (btnPrev) btnPrev.classList.remove('active');
    modal.classList.remove('mode-preview');
  }
}

function closeFreshSequenceModal() {
  const modal = document.getElementById('freshSequenceModal');
  if (modal) modal.classList.remove('active');
}

function freshAddSelectedCustomers() {
  if (!selectedCustomerIds || selectedCustomerIds.size === 0) {
    showToast('No customers currently selected in the table.', 'warning');
    return;
  }
  let added = 0;
  selectedCustomerIds.forEach(id => {
    const c = customersList.find(cust => String(cust.id) === String(id));
    if (c && c.email) {
      const existing = freshRecipients.find(r => r.email.toLowerCase() === c.email.toLowerCase());
      if (!existing) {
        freshRecipients.push({
          id: c.id,
          email: c.email.toLowerCase(),
          name: c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email,
          first_name: c.first_name || (c.name ? c.name.split(' ')[0] : 'there'),
          isShopifyCustomer: true
        });
        added++;
      }
    }
  });
  renderFreshRecipientsChips();
  updateFreshPreview();
  showToast(`Added ${added} selected customer(s).`, 'success');
}

function freshProcessPastedEmails() {
  const input = document.getElementById('freshRecipientsInput');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) {
    showToast('Please type or paste at least one email address.', 'warning');
    return;
  }

  // Split by comma, semicolon, space, or newline
  const tokens = raw.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
  let added = 0;
  let matched = 0;

  tokens.forEach(token => {
    const email = token.toLowerCase();
    if (!email.includes('@') || email.length < 5) return;

    // Check duplicate
    if (freshRecipients.some(r => r.email === email)) return;

    // Match against synced Shopify customers
    const found = customersList.find(c => (c.email || '').toLowerCase() === email);
    if (found) {
      freshRecipients.push({
        id: found.id,
        email: found.email.toLowerCase(),
        name: found.name || `${found.first_name || ''} ${found.last_name || ''}`.trim() || found.email,
        first_name: found.first_name || (found.name ? found.name.split(' ')[0] : 'there'),
        isShopifyCustomer: true
      });
      matched++;
    } else {
      // Clean up human name from email local-part: dr.marc.mortiboys -> Marc
      const localPart = email.split('@')[0];
      const cleanName = localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const firstName = cleanName.split(' ')[0] || 'there';
      freshRecipients.push({
        id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        email: email,
        name: cleanName,
        first_name: firstName,
        isShopifyCustomer: false
      });
    }
    added++;
  });

  input.value = '';
  renderFreshRecipientsChips();
  updateFreshPreview();

  if (added > 0) {
    showToast(`Added ${added} recipient(s) (${matched} matched with Shopify store records).`, 'success');
  } else {
    showToast('No valid new email addresses detected.', 'warning');
  }
}

function renderFreshRecipientsChips() {
  const box = document.getElementById('freshRecipientsChips');
  const countBadge = document.getElementById('freshRecipientsBadgeCount');
  const launchBtn = document.getElementById('btnLaunchFreshSequenceText');
  const prevRecipientBadge = document.getElementById('freshPreviewRecipientBadge');

  if (countBadge) countBadge.textContent = `${freshRecipients.length} Recipient${freshRecipients.length === 1 ? '' : 's'}`;
  if (launchBtn) launchBtn.textContent = `Launch Sequence (${freshRecipients.length} Recipient${freshRecipients.length === 1 ? '' : 's'})`;

  if (!box) return;

  if (freshRecipients.length === 0) {
    box.style.display = 'none';
    box.innerHTML = '';
    if (prevRecipientBadge) prevRecipientBadge.textContent = 'Previewing as: Valued Customer';
    return;
  }

  box.style.display = 'flex';
  box.innerHTML = freshRecipients.map((r, idx) => {
    const verifiedBadge = r.isShopifyCustomer 
      ? `<span style="color:#16a34a; font-weight:700; margin-right:2px;" title="Verified Shopify Customer">✓</span>` 
      : '';
    return `
      <div class="composer-recipient-chip" title="${escapeHtml(r.name)} &lt;${escapeHtml(r.email)}&gt;">
        <span class="chip-label">
          ${verifiedBadge}<strong>${escapeHtml(r.first_name)}</strong> (${escapeHtml(r.email)})
        </span>
        <button type="button" class="chip-remove-btn" onclick="freshRemoveRecipient(${idx})" title="Remove recipient">&times;</button>
      </div>
    `;
  }).join('');

  if (prevRecipientBadge) {
    const first = freshRecipients[0];
    prevRecipientBadge.textContent = `Previewing for: ${first.first_name} (${first.email})`;
  }
}

function freshRemoveRecipient(index) {
  if (index >= 0 && index < freshRecipients.length) {
    freshRecipients.splice(index, 1);
    renderFreshRecipientsChips();
    updateFreshPreview();
  }
}

function freshClearRecipients() {
  freshRecipients = [];
  renderFreshRecipientsChips();
  updateFreshPreview();
}

function renderFreshStageStrip() {
  const strip = document.getElementById('freshStageStrip');
  const deleteBtn = document.getElementById('btnDeleteFreshStage');
  if (deleteBtn) {
    deleteBtn.style.display = freshStages.length > 1 ? 'inline-block' : 'none';
  }
  if (!strip) return;

  strip.innerHTML = freshStages.map((s, idx) => {
    const isActive = idx === activeFreshStageIndex;
    let timingLabel = 'Instant';
    if (s.delayDays > 0) {
      timingLabel = `+${s.delayDays}d`;
    } else if (s.scheduledFor) {
      timingLabel = 'Custom';
    }
    return `
      <button type="button" class="fresh-stage-pill ${isActive ? 'active' : ''}" onclick="selectFreshStage(${idx})">
        <span>Stage ${s.stage}</span>
        <span class="fresh-stage-timing-badge">${timingLabel}</span>
      </button>
    `;
  }).join('');
}

function saveCurrentFreshStageFromEditor() {
  if (!freshStages[activeFreshStageIndex]) return;
  const s = freshStages[activeFreshStageIndex];
  const subjInput = document.getElementById('freshSubjectInput');
  const codeInput = document.getElementById('freshTrackingCodeInput');
  const htmlInput = document.getElementById('freshHtmlInput');
  const delaySelect = document.getElementById('freshStageDelaySelect');
  const customDateInput = document.getElementById('freshStageCustomDateTime');

  if (subjInput) s.subject = subjInput.value;
  if (codeInput) s.trackingCode = codeInput.value.trim().toUpperCase();
  if (htmlInput) s.htmlContent = htmlInput.value;
  if (delaySelect) {
    const val = delaySelect.value;
    if (val === 'custom') {
      s.delayDays = 0;
      s.scheduledFor = customDateInput ? customDateInput.value : null;
    } else {
      s.delayDays = Number(val) || 0;
      s.scheduledFor = null;
    }
  }
}

function loadFreshStageToEditor(index) {
  if (index < 0 || index >= freshStages.length) return;
  activeFreshStageIndex = index;
  const s = freshStages[index];

  const subjInput = document.getElementById('freshSubjectInput');
  const codeInput = document.getElementById('freshTrackingCodeInput');
  const htmlInput = document.getElementById('freshHtmlInput');
  const delaySelect = document.getElementById('freshStageDelaySelect');
  const customDateInput = document.getElementById('freshStageCustomDateTime');
  const timingSummary = document.getElementById('freshStageTimingSummary');

  if (subjInput) subjInput.value = s.subject || '';
  if (codeInput) codeInput.value = s.trackingCode || generateRandomTrackingCode('FRESH', s.stage);
  if (htmlInput) htmlInput.value = s.htmlContent || DEFAULT_STARTER_CLINICAL_HTML;

  if (delaySelect) {
    if (s.scheduledFor) {
      delaySelect.value = 'custom';
      if (customDateInput) {
        customDateInput.style.display = 'inline-block';
        customDateInput.value = s.scheduledFor.substring(0, 16);
      }
      if (timingSummary) timingSummary.textContent = `Scheduled: ${new Date(s.scheduledFor).toLocaleString('en-GB')}`;
    } else {
      delaySelect.value = String(s.delayDays || 0);
      if (customDateInput) customDateInput.style.display = 'none';
      if (timingSummary) {
        timingSummary.textContent = s.delayDays === 0 ? 'Instant (Upon Launch)' : `After ${s.delayDays} Days`;
      }
    }
  }

  updateFreshSubjectCount();
  updateFreshPreview();
  renderFreshStageStrip();
}

function selectFreshStage(index) {
  saveCurrentFreshStageFromEditor();
  loadFreshStageToEditor(index);
}

function addFreshStage() {
  saveCurrentFreshStageFromEditor();
  const nextNum = freshStages.length + 1;
  const defaultDelay = nextNum === 2 ? 3 : (nextNum === 3 ? 7 : (nextNum === 4 ? 14 : 21));

  freshStages.push({
    stage: nextNum,
    label: `Stage ${nextNum}`,
    delayDays: defaultDelay,
    scheduledFor: null,
    subject: `Clinical Care Sequence (Part ${nextNum}): Progress & Routine`,
    trackingCode: generateRandomTrackingCode('FRESH', nextNum),
    htmlContent: DEFAULT_STARTER_CLINICAL_HTML
  });

  selectFreshStage(freshStages.length - 1);
  showToast(`Added Stage ${nextNum} (scheduled after ${defaultDelay} days).`, 'info');
}

function deleteCurrentFreshStage() {
  if (freshStages.length <= 1) return;
  freshStages.splice(activeFreshStageIndex, 1);
  // Re-index
  freshStages.forEach((s, i) => {
    s.stage = i + 1;
  });
  activeFreshStageIndex = Math.max(0, activeFreshStageIndex - 1);
  renderFreshStageStrip();
  loadFreshStageToEditor(activeFreshStageIndex);
  showToast('Stage deleted.', 'info');
}

function onFreshStageDelayChange(val) {
  const customDateInput = document.getElementById('freshStageCustomDateTime');
  const timingSummary = document.getElementById('freshStageTimingSummary');
  const s = freshStages[activeFreshStageIndex];

  if (val === 'custom') {
    if (customDateInput) {
      customDateInput.style.display = 'inline-block';
      if (!customDateInput.value) {
        const tomorrow = new Date(Date.now() + 86400000);
        customDateInput.value = tomorrow.toISOString().substring(0, 16);
      }
      if (s) {
        s.scheduledFor = new Date(customDateInput.value).toISOString();
        s.delayDays = 0;
      }
    }
    if (timingSummary) timingSummary.textContent = 'Custom Scheduled Time';
  } else {
    if (customDateInput) customDateInput.style.display = 'none';
    const days = Number(val) || 0;
    if (s) {
      s.delayDays = days;
      s.scheduledFor = null;
    }
    if (timingSummary) {
      timingSummary.textContent = days === 0 ? 'Instant (Upon Launch)' : `After ${days} Day${days === 1 ? '' : 's'}`;
    }
  }
  renderFreshStageStrip();
}

function onFreshStageCustomDateChange(val) {
  const s = freshStages[activeFreshStageIndex];
  if (s && val) {
    s.scheduledFor = new Date(val).toISOString();
    s.delayDays = 0;
    const timingSummary = document.getElementById('freshStageTimingSummary');
    if (timingSummary) timingSummary.textContent = `Scheduled: ${new Date(val).toLocaleString('en-GB')}`;
    renderFreshStageStrip();
  }
}

function updateFreshSubjectCount() {
  const input = document.getElementById('freshSubjectInput');
  const countEl = document.getElementById('freshSubjectCount');
  if (input && countEl) {
    countEl.textContent = `${input.value.length} chars`;
  }
}

function insertTagIntoFreshSubject(tag) {
  const input = document.getElementById('freshSubjectInput');
  if (!input) return;
  input.value += (input.value.endsWith(' ') || input.value.length === 0 ? '' : ' ') + tag;
  input.focus();
  updateFreshSubjectCount();
  updateFreshPreview();
}

function generateFreshTrackingCode() {
  const input = document.getElementById('freshTrackingCodeInput');
  if (input) {
    const code = generateRandomTrackingCode('FRESH', activeFreshStageIndex + 1);
    input.value = code;
    if (freshStages[activeFreshStageIndex]) {
      freshStages[activeFreshStageIndex].trackingCode = code;
    }
    updateFreshPreview();
  }
}

function resetFreshStageDummyContent() {
  const htmlInput = document.getElementById('freshHtmlInput');
  if (htmlInput) {
    htmlInput.value = DEFAULT_STARTER_CLINICAL_HTML;
    if (freshStages[activeFreshStageIndex]) {
      freshStages[activeFreshStageIndex].htmlContent = DEFAULT_STARTER_CLINICAL_HTML;
    }
    updateFreshPreview();
    showToast('Starter clinical dummy template restored.', 'info');
  }
}

function setFreshPreviewDevice(device, btn) {
  activeFreshPreviewDevice = device;
  const frame = document.getElementById('freshPreviewFrame');
  document.querySelectorAll('#btnFreshPreviewDesktop, #btnFreshPreviewMobile').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (frame) {
    frame.className = `preview-frame device-${device}`;
  }
}

function updateFreshPreview() {
  const frame = document.getElementById('freshPreviewFrame');
  if (!frame) return;

  const htmlInput = document.getElementById('freshHtmlInput');
  const subjInput = document.getElementById('freshSubjectInput');
  const codeInput = document.getElementById('freshTrackingCodeInput');

  const rawHtml = htmlInput ? htmlInput.value : DEFAULT_STARTER_CLINICAL_HTML;
  const rawSubj = subjInput ? subjInput.value : 'Clinical Follow-Up';
  const trackingCode = codeInput ? codeInput.value : 'TDS-CARE';

  const firstRecip = freshRecipients.length > 0 ? freshRecipients[0] : null;
  const firstName = firstRecip ? firstRecip.first_name : 'there';
  const fullName = firstRecip ? firstRecip.name : 'Valued Client';
  const shopUrl = 'https://shop.thedentalshaman.com';

  let renderedSubject = rawSubj
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{customer_name\}\}/gi, fullName)
    .replace(/\{\{tracking_code\}\}/gi, trackingCode)
    .replace(/\{\{discount_code\}\}/gi, trackingCode)
    .replace(/\{\{shop_url\}\}/gi, shopUrl);

  let renderedBody = rawHtml
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{customer_name\}\}/gi, fullName)
    .replace(/\{\{tracking_code\}\}/gi, trackingCode)
    .replace(/\{\{discount_code\}\}/gi, trackingCode)
    .replace(/\{\{shop_url\}\}/gi, shopUrl);

  frame.innerHTML = `
    <div style="background:#f1f5f9; padding:8px 12px; font-size:12px; border-bottom:1px solid #e2e8f0; font-family:var(--p-font-family);">
      <strong>Subject:</strong> ${escapeHtml(renderedSubject)}
    </div>
    <div style="background:#ffffff; overflow:auto;">
      ${renderedBody}
    </div>
  `;
}

// Preset Management
async function loadFreshPresets() {
  const select = document.getElementById('freshPresetSelect');
  if (!select) return;
  try {
    const res = await authFetch('/api/fresh-presets');
    const data = await res.json();
    if (data.success && Array.isArray(data.presets)) {
      freshPresetsList = data.presets;
      let optHtml = '<option value="">-- Load Saved Preset --</option>';
      freshPresetsList.forEach(p => {
        optHtml += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${(p.stages || []).length} stages)</option>`;
      });
      select.innerHTML = optHtml;
    }
  } catch (e) {
    console.error('Failed to load fresh presets:', e);
  }
}

function onFreshPresetSelectChange(presetId) {
  if (!presetId) return;
  const p = freshPresetsList.find(preset => preset.id === presetId);
  if (!p || !Array.isArray(p.stages) || p.stages.length === 0) return;

  freshStages = JSON.parse(JSON.stringify(p.stages));
  activeFreshStageIndex = 0;
  renderFreshStageStrip();
  loadFreshStageToEditor(0);
  showToast(`Loaded preset "${p.name}".`, 'success');
}

function openSaveFreshPresetPrompt() {
  saveCurrentFreshStageFromEditor();
  const input = document.getElementById('saveFreshPresetName');
  if (input) input.value = `Custom Sequence (${freshStages.length} Stages)`;
  const modal = document.getElementById('modalSaveFreshPreset');
  if (modal) modal.classList.add('active');
}

function closeSaveFreshPresetModal() {
  const modal = document.getElementById('modalSaveFreshPreset');
  if (modal) modal.classList.remove('active');
}

async function submitSaveFreshPreset(e) {
  e.preventDefault();
  saveCurrentFreshStageFromEditor();
  const nameInput = document.getElementById('saveFreshPresetName');
  const name = nameInput ? nameInput.value.trim() : 'Custom Sequence';
  if (!name) return;

  try {
    const res = await authFetch('/api/fresh-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        stages: freshStages
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Preset "${name}" saved successfully!`, 'success');
      closeSaveFreshPresetModal();
      loadFreshPresets();
    } else {
      showToast(data.error || 'Failed to save preset.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

// Send Test Email for active fresh stage
async function sendFreshTestEmail() {
  saveCurrentFreshStageFromEditor();
  const email = prompt('Enter your email address to receive a live test preview of this stage:');
  if (!email || !email.includes('@')) return;

  const s = freshStages[activeFreshStageIndex] || freshStages[0];
  try {
    showToast('Sending test email...', 'info');
    const res = await authFetch('/api/followup/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        testEmail: email.trim(),
        templateId: 'fresh_sequence',
        customSubject: s.subject,
        customDiscountCode: s.trackingCode,
        customBody: s.htmlContent
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Test email successfully delivered to ${email}!`, 'success');
    } else {
      showToast(data.error || 'Failed to deliver test email.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

// Launch Multi-Stage Fresh Sequence
async function launchFreshSequence() {
  saveCurrentFreshStageFromEditor();

  if (freshRecipients.length === 0) {
    showToast('Please add at least one recipient email address.', 'critical');
    return;
  }
  if (freshStages.length === 0) {
    showToast('Please configure at least one stage.', 'critical');
    return;
  }

  const confirmMsg = `Launch sequence to ${freshRecipients.length} recipient(s) across ${freshStages.length} stage(s)?\n\nStage 1 will send immediately. Subsequent delayed stages will be scheduled automatically.`;
  if (!confirm(confirmMsg)) return;

  const launchBtn = document.getElementById('btnLaunchFreshSequence');
  if (launchBtn) launchBtn.disabled = true;

  try {
    showToast('Dispatching sequence...', 'info');
    const sessionId = `fresh_seq_${Date.now()}`;
    const res = await authFetch('/api/fresh-sequence/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        sequenceName: `Fresh Sequence (${freshStages.length} Stages)`,
        recipients: freshRecipients,
        stages: freshStages
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Sequence Successfully Launched!\n\n${data.message}`);
      closeFreshSequenceModal();
      loadDispatches();
    } else {
      alert(`Error launching sequence: ${data.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`Dispatch failed: ${err.message}`);
  } finally {
    if (launchBtn) launchBtn.disabled = false;
  }
}

// Reschedule Scheduled Dispatches
function openRescheduleModal(dispatchId) {
  const d = dispatchesList.find(disp => disp.id === dispatchId);
  if (!d) return;

  const modal = document.getElementById('modalRescheduleDispatch');
  const idInput = document.getElementById('rescheduleDispatchId');
  const recipInput = document.getElementById('rescheduleRecipientEmail');
  const subjInput = document.getElementById('rescheduleSubject');
  const dateInput = document.getElementById('rescheduleDateTime');

  if (idInput) idInput.value = d.id;
  if (recipInput) recipInput.value = `${d.customerName || 'Customer'} (${d.customerEmail})`;
  if (subjInput) subjInput.value = `${d.stageLabel || ('Stage ' + d.stage)}: ${d.subject || ''}`;
  
  if (dateInput) {
    const curDate = d.scheduledFor ? new Date(d.scheduledFor) : new Date(Date.now() + 86400000);
    dateInput.value = curDate.toISOString().substring(0, 16);
  }

  if (modal) modal.classList.add('active');
}

function closeRescheduleModal() {
  const modal = document.getElementById('modalRescheduleDispatch');
  if (modal) modal.classList.remove('active');
}

async function submitRescheduleDispatch(e) {
  e.preventDefault();
  const idInput = document.getElementById('rescheduleDispatchId');
  const dateInput = document.getElementById('rescheduleDateTime');
  if (!idInput || !dateInput || !dateInput.value) return;

  try {
    showToast('Updating scheduled time...', 'info');
    const res = await authFetch(`/api/dispatches/${encodeURIComponent(idInput.value)}/reschedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledFor: new Date(dateInput.value).toISOString() })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Scheduled time updated successfully!', 'success');
      closeRescheduleModal();
      loadDispatches();
    } else {
      showToast(data.error || 'Failed to reschedule.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

async function sendScheduledDispatchNow(dispatchId) {
  if (!confirm('Send this scheduled follow-up email immediately right now?')) return;
  try {
    showToast('Sending scheduled email now...', 'info');
    const res = await authFetch(`/api/dispatches/${encodeURIComponent(dispatchId)}/send-now`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Email delivered successfully!', 'success');
      loadDispatches();
    } else {
      showToast(data.error || 'Failed to send.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

async function cancelScheduledDispatch(dispatchId) {
  if (!confirm('Are you sure you want to cancel this scheduled follow-up email?')) return;
  try {
    const res = await authFetch(`/api/dispatches/${encodeURIComponent(dispatchId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Scheduled email cancelled.', 'info');
      loadDispatches();
      if (activeInspectedSessionId) {
        openSessionInspector(activeInspectedSessionId);
      }
    } else {
      showToast(data.error || 'Failed to cancel.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

/* ========================================================
   ACTIVITY SESSIONS ("SEASONS") & CUSTOMER PROGRESSION TRACKER
   ======================================================== */
let activitySessionsList = [];
let activeInspectedSessionId = null;

async function loadActivitySessions() {
  try {
    const res = await authFetch('/api/activity-sessions');
    const data = await res.json();
    if (data.success) {
      activitySessionsList = data.sessions || [];
      const badge = document.getElementById('analyticsSessionsCount');
      if (badge) badge.innerText = activitySessionsList.length;

      renderActivitySessions(activitySessionsList);
      renderActiveSessionsChips(activitySessionsList);
    }
  } catch (err) {
    console.error('Failed to load activity sessions:', err);
  }
}

function renderActivitySessions(sessions) {
  const container = document.getElementById('sessionsListContainer');
  if (!container) return;

  if (!sessions || sessions.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 48px; color: var(--p-color-text-subdued); grid-column: 1 / -1; background: #fafbfc; border: 1px dashed var(--p-color-border); border-radius: 8px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 8px; color: #94a3b8;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <div style="font-weight: 600; font-size: 13.5px; color: var(--p-color-text);">No Activity Sessions Active</div>
        <p style="font-size: 12px; margin-top: 4px;">Launch a follow-up sequence using the green Follow Up button or Start Fresh Sequence to start tracking here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sessions.map(s => {
    const isCompleted = s.status === 'completed';
    const statusBadge = isCompleted
      ? `<span class="rank-badge" style="background:#f1f5f9; color:#64748b; border-color:#cbd5e1;">COMPLETED</span>`
      : `<span class="rank-badge rank-badge-dev">ACTIVE</span>`;

    const startedDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Recently';

    return `
      <div class="session-card" onclick="openSessionInspector('${s.id}')">
        <div class="session-card-header">
          <div>
            <div class="session-card-title">${escapeHtml(s.name || 'Follow-Up Sequence')}</div>
            <div class="session-card-subtitle">${escapeHtml(s.campaignName || 'Campaign')} &bull; ${s.recipientCount || (s.recipients || []).length} Recipient${(s.recipientCount || (s.recipients || []).length) > 1 ? 's' : ''}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${statusBadge}
            <button type="button" class="Polaris-Button Polaris-Button--slim btn-danger-text" style="font-size: 11px; padding: 2px 6px;" onclick="deleteActivitySession('${s.id}', event)" title="Delete session and cancel all pending scheduled emails">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        <div class="session-card-metrics">
          <span class="session-metric-chip" style="color: #16a34a;">✉️ ${s.sentCount || 0} Sent</span>
          <span class="session-metric-chip" style="color: #0284c7;">🕒 ${s.scheduledCount || 0} Scheduled</span>
          ${s.failedCount > 0 ? `<span class="session-metric-chip" style="color: #dc2626;">⚠️ ${s.failedCount} Failed</span>` : ''}
          ${s.convertedCount > 0 ? `<span class="session-metric-chip" style="color: #008060;">💰 ${s.convertedCount} Converted</span>` : ''}
        </div>

        <div class="session-card-footer">
          <span>Started: ${startedDate}</span>
          <span style="font-weight: 600; color: #008060; display: flex; align-items: center; gap: 4px;">
            Track Activity &rarr;
          </span>
        </div>
      </div>
    `;
  }).join('');
}

function renderActiveSessionsChips(sessions) {
  const container = document.getElementById('activeSessionsChips');
  if (!container) return;

  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<span style="font-size: 11.5px; color: var(--p-color-text-subdued);">None yet</span>';
    return;
  }

  container.innerHTML = sessions.slice(0, 4).map(s => `
    <div style="display: inline-flex; align-items: center; gap: 4px;">
      <button type="button" class="Polaris-FilterPill" style="font-size: 11px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px;" onclick="openSessionInspector('${s.id}')">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: ${s.status === 'completed' ? '#94a3b8' : (s.failedCount > 0 ? '#dc2626' : '#16a34a')};"></span>
        ${escapeHtml(s.name || 'Sequence')} (${s.sentCount || 0} sent${s.failedCount > 0 ? `, <span style="color:#dc2626; font-weight:bold;">${s.failedCount} failed</span>` : ''}, ${s.scheduledCount || 0} sch)
      </button>
      ${s.failedCount > 0 ? `
        <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 6px; color: #b91c1c; border-color: #fca5a5; background: #fff5f5; font-weight: bold;" onclick="retrySessionFailed('${s.id}', event)" title="Send again to ${s.failedCount} failed recipient(s)">
          ⚡ Send Failed (${s.failedCount})
        </button>
      ` : ''}
    </div>
  `).join('');
}

async function openSessionInspector(sessionId) {
  activeInspectedSessionId = sessionId;
  const modal = document.getElementById('sessionInspectorModal');
  if (modal) modal.classList.add('active');

  const titleEl = document.getElementById('inspectorSessionTitle');
  const badgeEl = document.getElementById('inspectorSessionStatusBadge');
  const subEl = document.getElementById('inspectorSessionSubtitle');
  const ribbonEl = document.getElementById('inspectorMetricsRibbon');
  const listEl = document.getElementById('inspectorCustomersList');

  if (titleEl) titleEl.innerText = 'Loading Activity Session...';
  if (listEl) listEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--p-color-text-subdued);">Loading customer stage breakdown...</div>';

  try {
    const res = await authFetch(`/api/activity-sessions/${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    if (!data.success || !data.session) {
      showToast('Session not found.', 'critical');
      closeSessionInspector();
      return;
    }

    const s = data.session;
    const dispatches = s.dispatches || [];
    const isCompleted = s.status === 'completed';

    if (titleEl) titleEl.innerText = s.name || 'Activity Session';
    if (badgeEl) {
      badgeEl.className = isCompleted ? 'rank-badge' : 'rank-badge rank-badge-dev';
      badgeEl.innerText = isCompleted ? 'COMPLETED' : 'ACTIVE';
    }
    const startedDate = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    if (subEl) {
      subEl.innerText = `${s.campaignName || 'Campaign'} • Started ${startedDate} • ${(s.recipients || []).length} Recipient${(s.recipients || []).length > 1 ? 's' : ''}`;
    }

    const sentCount = dispatches.filter(d => d.status === 'sent').length;
    const schCount = dispatches.filter(d => d.status === 'scheduled').length;
    const failCount = dispatches.filter(d => d.status === 'failed').length;
    const convCount = dispatches.filter(d => d.conversionStatus === 'converted').length;

    if (ribbonEl) {
      ribbonEl.innerHTML = `
        <span style="font-size:12px; font-weight:600; color:#0f172a;">Recipients: ${(s.recipients || []).length}</span>
        <span style="font-size:12px; font-weight:600; color:#16a34a;">&bull; Sent: ${sentCount}</span>
        <span style="font-size:12px; font-weight:600; color:#0284c7;">&bull; Scheduled: ${schCount}</span>
        ${failCount > 0 ? `<span style="font-size:12px; font-weight:600; color:#dc2626;">&bull; Failed: ${failCount}</span>` : ''}
        ${convCount > 0 ? `<span style="font-size:12px; font-weight:600; color:#008060;">&bull; Converted: ${convCount}</span>` : ''}
      `;

      const btnRetryFailed = document.getElementById('btnInspectorRetryFailed');
      if (btnRetryFailed) {
        if (failCount > 0) {
          btnRetryFailed.style.display = 'inline-flex';
          btnRetryFailed.innerText = `⚡ Send Again to Failed (${failCount})`;
        } else {
          btnRetryFailed.style.display = 'none';
        }
      }
    }

    // Group dispatches by recipient
    const recipientEmails = new Set();
    (s.recipients || []).forEach(r => {
      const em = (typeof r === 'string' ? r : r.email || '').toLowerCase().trim();
      if (em) recipientEmails.add(em);
    });
    dispatches.forEach(d => {
      if (d.customerEmail) recipientEmails.add(d.customerEmail.toLowerCase().trim());
    });

    if (recipientEmails.size === 0) {
      listEl.innerHTML = '<div style="text-align:center; padding:30px; color:var(--p-color-text-subdued);">No recipients in this session.</div>';
      return;
    }

    let custHtml = '';
    recipientEmails.forEach(email => {
      const custDispatches = dispatches.filter(d => (d.customerEmail || '').toLowerCase().trim() === email)
        .sort((a, b) => (Number(a.stage) || 1) - (Number(b.stage) || 1));

      const firstDisp = custDispatches[0];
      const custName = firstDisp?.customerName || email;

      custHtml += `
        <div class="session-customer-card">
          <div class="session-customer-header">
            <div>
              <strong style="font-size: 13.5px; color: var(--p-color-text);">${escapeHtml(custName)}</strong>
              <span style="font-size: 12px; color: var(--p-color-text-subdued); margin-left: 6px;">(${escapeHtml(email)})</span>
            </div>
            <div style="font-size: 11.5px; color: var(--p-color-text-subdued);">
              ${custDispatches.length} Stage${custDispatches.length > 1 ? 's' : ''} Configured
            </div>
          </div>

          <div class="stage-progression-list">
            ${custDispatches.map(d => {
              const stageNum = d.stage || 1;
              const isSent = d.status === 'sent';
              const isSch = d.status === 'scheduled';
              const isFail = d.status === 'failed';
              const isCanc = d.status === 'cancelled';

              let rowClass = 'stage-progression-row';
              if (isSent) rowClass += ' stage-sent';
              else if (isSch) rowClass += ' stage-scheduled';
              else if (isFail) rowClass += ' stage-failed';

              let timingHtml = '';
              if (isSent) {
                const sDate = d.sentAt ? new Date(d.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sent';
                timingHtml = `<span style="color:#16a34a; font-weight:600; font-size:11.5px;" title="Dispatched to mail provider">✓ Sent (${sDate})</span>`;
              } else if (isSch) {
                const schDate = d.scheduledFor ? new Date(d.scheduledFor).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Pending';
                timingHtml = `<span style="color:#0284c7; font-weight:600; font-size:11.5px;">🕒 Scheduled for ${schDate}</span>`;
              } else if (isFail) {
                stageActions = `
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 11px; padding: 2px 8px; color: #b91c1c; border-color: #fca5a5; background: #fff5f5; font-weight: 600;" onclick="retryFailedDispatch('${d.id}')" title="Send again to ${escapeHtml(d.customerEmail)}">
                      ⚡ Send Again
                    </button>
                  </div>
                `;
              } else if (isSent) {
                stageActions = `
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <button type="button" class="Polaris-Button Polaris-Button--slim" style="font-size: 10.5px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;" onclick="retryFailedDispatch('${d.id}')" title="Send again to ${escapeHtml(d.customerEmail)}">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                      Send Again
                    </button>
                  </div>
                `;
              }

              return `
                <div class="${rowClass}">
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1;">
                    <span style="font-weight: 700; font-size: 11.5px; background: #e2e8f0; color: #1e293b; padding: 1px 6px; border-radius: 4px;">
                      Stage ${stageNum}
                    </span>
                    <span style="font-size: 12px; font-weight: 500; color: var(--p-color-text); max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(d.subject || '')}">
                      ${escapeHtml(d.subject || 'Care Follow-Up')}
                    </span>
                    <span style="font-size: 10.5px; font-family: monospace; color: #64748b; background: #f1f5f9; padding: 1px 4px; border-radius: 3px;">
                      ${escapeHtml(d.discountCode || 'TDS-TRACK')}
                    </span>
                    ${timingHtml}
                  </div>
                  ${stageActions}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = custHtml;
  } catch (err) {
    showToast('Failed to load session details: ' + err.message, 'critical');
  }
}

function closeSessionInspector() {
  const modal = document.getElementById('sessionInspectorModal');
  if (modal) modal.classList.remove('active');
  activeInspectedSessionId = null;
}

async function deleteActivitySession(sessionId, event) {
  if (event) event.stopPropagation();
  if (!confirm('Are you sure you want to delete this activity session? This will pause, cancel and remove all pending scheduled emails for this session.')) {
    return;
  }

  try {
    showToast('Deleting activity session and pausing scheduled dispatches...', 'info');
    const res = await authFetch(`/api/activity-sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Activity session deleted.', 'success');
      if (activeInspectedSessionId === sessionId) {
        closeSessionInspector();
      }
      await Promise.all([
        loadActivitySessions(),
        loadDispatches(),
        loadStats()
      ]);
    } else {
      showToast(data.error || 'Failed to delete activity session.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

async function deleteCurrentInspectedSession() {
  if (activeInspectedSessionId) {
    await deleteActivitySession(activeInspectedSessionId);
  }
}

async function retryFailedDispatch(dispatchId) {
  try {
    showToast('Retrying failed email delivery...', 'info');
    const res = await authFetch(`/api/dispatches/${encodeURIComponent(dispatchId)}/retry`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Email delivered successfully!', 'success');
      loadDispatches();
      if (activeInspectedSessionId) {
        openSessionInspector(activeInspectedSessionId);
      }
    } else {
      showToast(data.error || 'Retry attempt failed.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}


async function retrySessionFailed(sessionId, evt) {
  if (evt) evt.stopPropagation();
  try {
    showToast('Sending again to all failed recipients in this session...', 'info');
    const res = await authFetch(`/api/activity-sessions/${encodeURIComponent(sessionId)}/retry-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceAll: false })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Batch retry completed successfully!', 'success');
      loadDispatches();
      loadActivitySessions();
      if (activeInspectedSessionId === sessionId) {
        openSessionInspector(sessionId);
      }
    } else {
      showToast(data.error || 'Failed to retry session recipients.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}

async function resendWholeSession(sessionId) {
  if (!confirm('Send this sequence stage again to all recipients in this session?')) return;
  try {
    showToast('Re-sending email sequence to all recipients...', 'info');
    const res = await authFetch(`/api/activity-sessions/${encodeURIComponent(sessionId)}/retry-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceAll: true })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Batch re-send completed successfully!', 'success');
      loadDispatches();
      loadActivitySessions();
      if (activeInspectedSessionId === sessionId) {
        openSessionInspector(sessionId);
      }
    } else {
      showToast(data.error || 'Failed to re-send session.', 'critical');
    }
  } catch (err) {
    showToast(err.message, 'critical');
  }
}
