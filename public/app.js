// RetentionFlow &middot; The Dental Shaman
// Customer Care Follow-Up & Verifiable Conversion Attribution Engine

const API_BASE = '';
let authToken = localStorage.getItem('tds_followup_token') || '';
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
  if (authToken) {
    const isValid = await verifyAuthToken(authToken);
    if (isValid) {
      const modal = document.getElementById('authGateModal');
      if (modal) modal.classList.remove('active');
      initDashboard();
      return;
    }
  }

  // Detect if running embedded inside Shopify Admin
  if (window.self !== window.top) {
    document.body.classList.add('is-embedded-shopify');
  }

  // Show Master Operator Security Gate
  const modal = document.getElementById('authGateModal');
  if (modal) modal.classList.add('active');
  const keyInput = document.getElementById('masterAccessKey');
  if (keyInput) keyInput.focus();
});

/* ========================================================
   AUTHENTICATION & API HELPER
   ======================================================== */
async function authFetch(url, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 401) {
    // Session expired or invalid
    authToken = '';
    localStorage.removeItem('tds_followup_token');
    document.getElementById('authGateModal').classList.add('active');
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
      localStorage.setItem('tds_followup_token', data.token);
      document.getElementById('authGateModal').classList.remove('active');
      showToast('Master Operator Access Granted', 'success');
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
  localStorage.removeItem('tds_followup_token');
  const modal = document.getElementById('authGateModal');
  if (modal) modal.classList.add('active');
  const keyInput = document.getElementById('masterAccessKey');
  if (keyInput) {
    keyInput.value = '';
    keyInput.focus();
  }
  showToast('Console locked. Master Operator Key required.', 'info');
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
  document.getElementById('kpiTotalCustomers').innerText = (stats.totalCustomers || 0).toLocaleString();
  document.getElementById('kpiTotalDispatched').innerText = (stats.totalDispatched || 0).toLocaleString();
  document.getElementById('kpiTotalClicked').innerText = (stats.totalClicked || 0).toLocaleString();
  document.getElementById('kpiClickRate').innerText = (stats.clickRate || 0).toFixed(1);
  document.getElementById('kpiTotalConverted').innerText = (stats.totalConverted || 0).toLocaleString();
  document.getElementById('kpiConversionRate').innerText = (stats.conversionRate || 0).toFixed(1);
  document.getElementById('kpiTotalRevenue').innerText = `£${Number(stats.totalRevenueGenerated || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  document.getElementById('badgeCustomerCount').innerText = stats.totalCustomers || 0;
  document.getElementById('badgeConversionCount').innerText = stats.totalConverted || 0;
  document.getElementById('badgeDispatchCount').innerText = stats.totalDispatched || 0;
}

/* ========================================================
   TABS SWITCHING
   ======================================================== */
function switchTab(tabName, el) {
  // Update tab buttons
  document.querySelectorAll('.Polaris-Tab').forEach(tab => tab.classList.remove('active'));
  if (el) el.classList.add('active');

  // Update tab content panels
  document.querySelectorAll('.Polaris-TabContent').forEach(panel => panel.classList.remove('active'));
  const target = document.getElementById(`tab-${tabName}`);
  if (target) target.classList.add('active');

  // Refresh data for active tab
  if (tabName === 'customers') renderCustomersTable();
  if (tabName === 'conversions') loadConversions();
  if (tabName === 'dispatches') loadDispatches();
  if (tabName === 'templates') renderTemplateCards();
  if (tabName === 'settings') loadSettings();
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
  if (el) el.classList.add('active');
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
      if (currentFilter === 'never_followed') {
        if (c.lastFollowUpAt || (c.followUpCount && c.followUpCount > 0)) return false;
      } else if (currentFilter === 'repeat_buyers') {
        if ((parseInt(c.orders_count, 10) || 0) < 2) return false;
      } else if (currentFilter === 'converted') {
        if (c.conversionStatus !== 'converted' && !(parseFloat(c.convertedRevenue || 0) > 0)) return false;
      } else if (currentFilter === 'failed') {
        if (c.lastFollowUpStatus !== 'failed' && !c.lastFollowUpError) return false;
      }

      // Customer Spend Filter (Min / Max range or preset)
      const totalSpent = parseFloat(c.total_spent || 0);
      if (spendFilterMin !== null && totalSpent < spendFilterMin) {
        return false;
      }
      if (spendFilterMax !== null && totalSpent > spendFilterMax) {
        return false;
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

function renderCustomersTable() {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;

  if (filteredCustomers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 48px; color: var(--color-text-muted);">
          No customers found matching the selected filter or search query.
        </td>
      </tr>
    `;
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
    
    // Segment tags (clean, understated)
    const tags = [];
    if (orders >= 2) tags.push(`<span class="Polaris-Tag">Repeat (${orders})</span>`);
    if (parseFloat(c.total_spent || 0) >= 100) tags.push(`<span class="Polaris-Tag">VIP</span>`);
    if (c.conversionStatus === 'converted') tags.push(`<span class="Polaris-Tag">Ordered</span>`);
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
      <tr>
        <td>
          <div style="font-weight: 600; color: var(--color-text-title);">${escapeHtml(fullName)}</div>
          <div style="font-size: 11px; color: var(--color-text-muted);">ID: ${c.id}</div>
        </td>
        <td>
          <div style="font-family: monospace; font-size: 12.5px;">${email}</div>
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
        <td colspan="7" style="padding: 16px 20px; background: #fafbfc; border-top: 1px solid var(--color-border);">
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

function selectComposerCampaign(campaignId, preselectedTplId = null) {
  composerActiveCampaign = campaignId;

  // Update campaign tab active state
  document.querySelectorAll('#composerCampTabs .composer-camp-tab').forEach(tab => {
    if (tab.getAttribute('data-camp') === campaignId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  const campSelect = document.getElementById('composerCampaignSelect');
  if (campSelect) campSelect.value = campaignId;

  // Render the 5 stages for this campaign
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
    container.innerHTML = '<div style="color:var(--p-color-text-subdued); font-size:12px; grid-column: span 5; text-align:center;">No stages available for this campaign.</div>';
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

  // Render clean 5 Stage buttons
  container.innerHTML = siloTemplates.map((t, idx) => {
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
  if (nameEl) nameEl.innerText = `Stage ${tpl.stage || 1}: ${tpl.name || 'Follow-Up Sequence'}`;
  if (timingEl) {
    const hasDiscount = tpl.discountCode && tpl.discountCode !== 'NONE' && tpl.discountPercent > 0;
    const discountText = hasDiscount ? `· Offer: ${tpl.discountCode} (${tpl.discountPercent}% off)` : '· Guidance Only (No Discount)';
    timingEl.innerText = `${tpl.timing || 'Day 1'} ${discountText}`;
  }
}

function toggleComposerHtmlView(btn) {
  const wrap = document.getElementById('composerHtmlEditorWrap');
  if (!wrap) return;
  const isHidden = wrap.style.display === 'none';
  if (isHidden) {
    wrap.style.display = 'block';
    if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg> Collapse HTML`;
  } else {
    wrap.style.display = 'none';
    if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit HTML Code`;
  }
}

function toggleComposerDiscount(cb) {
  const codeInput = document.getElementById('composerDiscountCode');
  const helpText = document.getElementById('composerDiscountHelpText');
  if (cb.checked) {
    codeInput.value = 'NONE';
    codeInput.disabled = true;
    helpText.innerText = 'Zero discount selected. Store public prices remain 100% untouched.';
  } else {
    codeInput.disabled = false;
    const tplId = composerActiveTemplateId || document.getElementById('composerTemplateSelect')?.value;
    const tpl = templatesList.find(t => t.id === tplId);
    const prefix = tpl?.discountCode || 'HOLISTIC10';
    codeInput.value = `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    helpText.innerText = 'Safe: Custom code applies at checkout. If Zero Discount is checked, store public pricing is untouched.';
  }
  updateLivePreview();
}

function openComposer(customer, preselectedTemplateId = null) {
  activeCustomer = customer || { first_name: 'Valued', name: 'Valued Customer', email: 'shop@thedentalshaman.com' };
  const fullName = `${activeCustomer.first_name || ''} ${activeCustomer.last_name || ''}`.trim() || activeCustomer.name || 'Valued Customer';
  document.getElementById('composerCustomerBadge').innerText = `Target: ${fullName} (${activeCustomer.email || 'No email'}) · ${activeCustomer.orders_count || 0} orders · £${activeCustomer.total_spent || '0.00'}`;

  // Reset HTML collapse view
  const htmlWrap = document.getElementById('composerHtmlEditorWrap');
  if (htmlWrap) htmlWrap.style.display = 'none';
  const toggleBtn = document.getElementById('btnToggleComposerHtml');
  if (toggleBtn) toggleBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit HTML Code`;

  // Reset zero discount checkbox
  const noDisc = document.getElementById('composerNoDiscountToggle');
  if (noDisc) {
    noDisc.checked = false;
    document.getElementById('composerDiscountCode').disabled = false;
  }

  // Determine target campaign
  let targetCampaign = 'water_flosser';
  if (preselectedTemplateId) {
    const tpl = templatesList.find(t => t.id === preselectedTemplateId);
    if (tpl && tpl.campaignId) {
      targetCampaign = tpl.campaignId;
    }
  }

  selectComposerCampaign(targetCampaign, preselectedTemplateId);

  // Open modal
  document.getElementById('composerModal').classList.add('active');
}

function closeComposerModal() {
  document.getElementById('composerModal').classList.remove('active');
  activeCustomer = null;
}

async function onTemplateChange() {
  const tplId = document.getElementById('composerTemplateSelect').value;
  const tpl = templatesList.find(t => t.id === tplId);
  if (!tpl) return;

  // Set default subject and generate promo code
  let subj = tpl.subject || 'A personal note from Dr. Marc Mortiboys (BDS)';
  const firstName = activeCustomer?.first_name || 'there';
  subj = subj.replace(/\{\{first_name\}\}/gi, firstName);
  document.getElementById('composerSubject').value = subj;

  // Default promo code
  const noDisc = document.getElementById('composerNoDiscountToggle')?.checked;
  if (noDisc || tpl.discountCode === 'NONE' || tpl.discountPercent === 0) {
    document.getElementById('composerDiscountCode').value = 'NONE';
    if (document.getElementById('composerNoDiscountToggle')) {
      document.getElementById('composerNoDiscountToggle').checked = true;
    }
    document.getElementById('composerDiscountCode').disabled = true;
  } else {
    const codePrefix = tpl.discountCode || 'HOLISTIC10';
    document.getElementById('composerDiscountCode').value = `${codePrefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    document.getElementById('composerDiscountCode').disabled = false;
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

function generateUniqueCode() {
  const tplId = document.getElementById('composerTemplateSelect').value;
  const tpl = templatesList.find(t => t.id === tplId);
  const prefix = tpl?.discountCode || 'HOLISTIC10';
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  document.getElementById('composerDiscountCode').value = `${prefix}-${rand}`;
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
        document.getElementById('composerPreviewFrame').innerHTML = data.rendered.html;
      }
    } catch (e) {
      console.error('Preview render error:', e);
    }
  }, 300);
}

function setPreviewDevice(device, btn) {
  const container = document.getElementById('composerPreviewFrame');
  document.querySelectorAll('.preview-toolbar .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (device === 'mobile') {
    container.style.maxWidth = '375px';
    container.style.margin = '0 auto';
    container.style.border = '1px solid #d1d5db';
    container.style.borderRadius = '12px';
    container.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
  } else {
    container.style.maxWidth = '100%';
    container.style.margin = '0';
    container.style.border = 'none';
    container.style.boxShadow = 'none';
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

async function dispatchCustomerEmail() {
  if (!activeCustomer || !activeCustomer.email) {
    showToast('Cannot dispatch: Customer has no valid email address.', 'error');
    return;
  }

  const btn = document.getElementById('btnDispatchCustomerEmail');
  const tplId = document.getElementById('composerTemplateSelect').value;
  const customSubject = document.getElementById('composerSubject').value;
  const customDiscountCode = document.getElementById('composerDiscountCode').value;
  const customBody = document.getElementById('composerBody').value;

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #ffffff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span> Delivering via Resend...`;

  try {
    const res = await authFetch('/api/followup/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: activeCustomer.id,
        customerEmail: activeCustomer.email,
        templateId: tplId,
        customSubject,
        customDiscountCode,
        customBody
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Official clinical follow-up sent to ${activeCustomer.email}.`, 'success');
      closeComposerModal();
      // Reload stats and tables
      await Promise.all([loadStats(), loadCustomers(), loadDispatches()]);
    } else {
      showToast(data.error || 'Dispatch failed', 'error');
    }
  } catch (err) {
    showToast('Network error while dispatching follow-up', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Official Follow-Up`;
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
  conversionPeriod = period;
  document.querySelectorAll('#conversionPeriodPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const customBox = document.getElementById('customDateRangeBox');
  if (customBox) customBox.style.display = 'none';

  loadConversions();
}

function toggleCustomDateInputs(btn) {
  document.querySelectorAll('#conversionPeriodPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const customBox = document.getElementById('customDateRangeBox');
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
      document.getElementById('badgeConversionCount').innerText = conversionsList.length;

      // Update Period Mini KPIs
      const periodStats = data.periodStats || {};
      if (document.getElementById('periodKpiRevenue')) {
        document.getElementById('periodKpiRevenue').innerText = `£${Number(periodStats.totalRevenue || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      if (document.getElementById('periodKpiOrders')) {
        document.getElementById('periodKpiOrders').innerText = periodStats.totalConversions || 0;
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
          attributionMethod = 'Discount code applied';
        } else if (c.clickedAt) {
          attributionMethod = 'Follow-up link click';
        } else {
          attributionMethod = 'Campaign window';
        }

        const promoCodeUsed = (c.discountCodesUsed && c.discountCodesUsed.length > 0) ? c.discountCodesUsed.join(', ') : 'None';

        const evidenceHtml = `
          <div style="font-size: 12px; font-weight: 500; color: var(--p-color-text);">${attributionMethod}</div>
          <div style="font-size: 11px; color: var(--p-color-text-subdued); margin-top: 2px;">
            Discount: <code>${escapeHtml(promoCodeUsed)}</code>
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
              <div style="font-family: monospace; font-size: 11.5px; color: var(--color-text-muted);">${escapeHtml(customerEmail)}</div>
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

async function loadDispatches() {
  try {
    const q = activeDispatchCampaign && activeDispatchCampaign !== 'all' ? `?campaignId=${encodeURIComponent(activeDispatchCampaign)}` : '';
    const res = await authFetch(`/api/tracking/dispatches${q}`);
    const data = await res.json();
    if (data.success) {
      dispatchesList = data.dispatches || [];
      document.getElementById('badgeDispatchCount').innerText = dispatchesList.length;

      const failedCount = dispatchesList.filter(d => d.status === 'failed').length;
      const failedBadge = document.getElementById('dispatchFailedCount');
      if (failedBadge) failedBadge.innerText = failedCount;

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
    if (activeDispatchStatus === 'failed' && d.status !== 'failed') return false;
    return true;
  });

  if (filteredDispatches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 48px; color: var(--color-text-muted);">
          No follow-up dispatches found for this status and campaign filter.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredDispatches.map(d => {
    const sentDate = new Date(d.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const promoCode = d.discountCode ? `<code>${escapeHtml(d.discountCode)}</code>` : '<span style="color:var(--p-color-text-subdued);">&mdash;</span>';

    const deliveryBadge = d.status === 'sent'
      ? `<span style="font-size:12px; color:#008060; font-weight:500;">Delivered</span>`
      : `<span style="font-size:12px; color:#d82c0d; font-weight:600;">Failed</span><div style="font-size:11px; color:#d82c0d; margin-top:2px;" title="${escapeHtml(d.error || '')}">${escapeHtml(d.error || 'Delivery failed')}</div>`;

    const clickBadge = d.clicked
      ? `<span style="font-size:12px; color:var(--p-color-text); font-weight:500;">${d.clickCount || 1} click${(d.clickCount || 1) > 1 ? 's' : ''}</span>`
      : `<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>`;

    let conversionBadge = '';
    if (d.conversionStatus === 'converted') {
      conversionBadge = `<span style="font-size:12px; color:#008060; font-weight:600;">£${parseFloat(d.convertedRevenue || 0).toFixed(2)}</span>`;
    } else {
      conversionBadge = `<span style="font-size:12px; color:var(--p-color-text-subdued);">&mdash;</span>`;
    }

    return `
      <tr>
        <td>
          <div style="font-size: 12.5px; font-weight: 500;">${sentDate}</div>
          <div style="font-size: 10.5px; font-family: monospace; color: var(--color-text-muted);">${d.id}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--color-text-title);">${escapeHtml(d.customerName || 'Customer')}</div>
          <div style="font-family: monospace; font-size: 11.5px; color: var(--color-text-muted);">${escapeHtml(d.customerEmail)}</div>
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
      </tr>
    `;
  }).join('');
}

/* ========================================================
   CAMPAIGN SEQUENCES & TEMPLATE STUDIO
   ======================================================== */
function setTemplateCampaign(campaignId, btn) {
  activeTemplateCampaign = campaignId;
  document.querySelectorAll('#templateCampaignPills .Polaris-FilterPill').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTemplateCards();
}

async function loadTemplates() {
  try {
    const res = await authFetch('/api/templates');
    const data = await res.json();
    if (data.success) {
      templatesList = data.templates || [];
      const badge = document.getElementById('badgeTemplateCount');
      if (badge) badge.innerText = templatesList.length;
      renderTemplateCards();
    }
  } catch (e) {
    console.error('Failed to load templates:', e);
  }
}

function getSiloIconSvg(id) {
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
let allSilosCollapsed = false;

function toggleSiloSection(campaignId) {
  const isCollapsed = Boolean(siloCollapseState[campaignId]);
  siloCollapseState[campaignId] = !isCollapsed;

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
        No templates found for this campaign category.
      </div>
    `;
    return;
  }

  container.innerHTML = campaignsToRender.map(camp => {
    const siloTemplates = templatesList.filter(t => t.campaignId === camp.id).sort((a, b) => (a.stage || 1) - (b.stage || 1));
    const isCollapsed = Boolean(siloCollapseState[camp.id]);

    const sequenceRowsHtml = siloTemplates.map(t => {
      const stageNum = t.stage || 1;
      const stageLabel = t.stageLabel || `Stage ${stageNum}`;
      const hasDiscount = t.discountCode && t.discountCode !== 'NONE' && t.discountCode !== '0' && (t.discountPercent > 0);
      const offerBadge = hasDiscount
        ? `<span class="sequence-offer-badge">Discount: <strong>${escapeHtml(t.discountCode)}</strong> (${t.discountPercent}% off)</span>`
        : `<span class="sequence-offer-none">No discount included</span>`;

      return `
        <div class="sequence-row">
          <div class="sequence-col sequence-col-stage">
            <span class="stage-pill stage-${stageNum}">
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
              Edit Code &amp; Settings
            </button>
            <button class="Polaris-Button Polaris-Button--dark Polaris-Button--slim" onclick="openComposerWithTemplate('${t.id}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Send &rarr;
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
              <div class="silo-subtitle">${siloTemplates.length} clinical follow-up stages in this sequence</div>
            </div>
          </div>
          <div class="silo-header__right" onclick="event.stopPropagation()">
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
}

function openComposerWithTemplate(templateId = null) {
  const customer = customersList[0] || {
    id: 'demo_patient',
    first_name: 'Dr. Marc',
    last_name: 'Mortiboys',
    name: 'Dr. Marc Mortiboys',
    email: 'shop@thedentalshaman.com',
    orders_count: 3,
    total_spent: '149.00'
  };
  openComposer(customer, templateId);
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

  document.getElementById('editorModalTitle').innerText = `Edit: ${tpl.name}`;
  document.getElementById('editorStageBadge').className = `stage-pill stage-${tpl.stage || 1}`;
  document.getElementById('editorStageBadge').innerText = tpl.stageLabel || `Stage ${tpl.stage || 1}`;
  document.getElementById('editorCampaignBadge').innerText = `Campaign: ${tpl.campaignName || tpl.campaignId} · File: templates/${tpl.file || (tpl.id + '.html')}`;

  document.getElementById('tplEditorName').value = tpl.name || '';
  document.getElementById('tplEditorSubject').value = tpl.subject || '';
  document.getElementById('tplEditorPromoCode').value = (tpl.discountCode && tpl.discountCode !== 'NONE') ? tpl.discountCode : '';
  document.getElementById('tplEditorDiscountPercent').value = tpl.discountPercent !== undefined ? tpl.discountPercent : 10;
  document.getElementById('tplEditorDescription').value = tpl.description || '';

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
        document.getElementById('tplEditorPreviewFrame').innerHTML = data.rendered.html;
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
    container.style.maxWidth = '375px';
    container.style.margin = '0 auto';
    container.style.border = '1px solid #d1d5db';
    container.style.borderRadius = '12px';
  } else {
    container.style.maxWidth = '100%';
    container.style.margin = '0';
    container.style.border = '1px solid var(--color-border)';
    container.style.borderRadius = 'var(--radius-sm)';
  }
}

async function saveTemplateEdits() {
  if (!currentEditingTemplate) return;
  const btn = document.getElementById('btnSaveTemplateEdits');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="display:inline-block; width:12px; height:12px; border:2px solid #ffffff; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></span> Saving to Disk...`;

  const name = document.getElementById('tplEditorName').value.trim();
  const subject = document.getElementById('tplEditorSubject').value.trim();
  const discountCode = document.getElementById('tplEditorPromoCode').value.trim();
  const discountPercent = parseFloat(document.getElementById('tplEditorDiscountPercent').value) || 0;
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
      if (document.getElementById('settingDefaultPromo')) document.getElementById('settingDefaultPromo').value = s.defaultDiscountCode || 'HOLISTIC10';
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const settings = {
    senderName: document.getElementById('settingSenderName').value.trim(),
    senderEmail: document.getElementById('settingSenderEmail').value.trim(),
    replyTo: document.getElementById('settingReplyTo').value.trim(),
    resendApiKey: document.getElementById('settingResendApiKey').value.trim(),
    defaultDiscountCode: document.getElementById('settingDefaultPromo').value.trim()
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
      showToast(`Diagnostic email successfully received by ${recipient} via Resend!`, 'success');
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
