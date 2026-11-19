const fs = require('fs');
const path = require('path');

// 1. Update public/index.html
let html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

// Replace the Date Range & Campaign controls section with clean, responsive markup
const oldControls = `        <!-- Unified Controls: Date Range & Dynamic Campaign Sequence Filter -->
        <div class="Polaris-TableControls" style="flex-direction: column; align-items: stretch; gap: 10px;">
          <!-- Date Period Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-size: 12px; font-weight: 600; color: var(--p-color-text);">Date Range:</span>
              <div class="Polaris-FilterPills" id="analyticsPeriodPills">
                <button type="button" class="Polaris-FilterPill active" onclick="setAnalyticsPeriod(7, this)">Last 7 Days</button>
                <button type="button" class="Polaris-FilterPill" onclick="setAnalyticsPeriod(30, this)">Last 30 Days</button>
                <button type="button" class="Polaris-FilterPill" onclick="setAnalyticsPeriod(90, this)">Last 90 Days</button>
                <button type="button" class="Polaris-FilterPill" onclick="setAnalyticsPeriod('all', this)">All Time</button>
                <button type="button" class="Polaris-FilterPill" onclick="toggleCustomDateInputs(this)">Custom Range</button>
              </div>
            </div>
            <div id="conversionSummaryRibbon" style="font-size: 11.5px; color: var(--p-color-text-subdued); font-weight: 500;">
              Audit Period: Last 7 Days
            </div>
          </div>

          <!-- Custom Date Range Form (collapsible) -->
          <div id="customDateRangeBox" style="display: none; align-items: center; gap: 10px; background: #ffffff; padding: 8px 12px; border-radius: var(--p-radius-sm); border: 1px solid var(--p-color-border); flex-wrap: wrap;">
            <span style="font-size: 12px; font-weight: 600; color: var(--p-color-text-subdued);">Custom Range:</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <label for="filterStartDate" style="font-size: 11.5px; color: var(--p-color-text-subdued);">From</label>
              <input type="date" id="filterStartDate" class="form-input" style="width: auto; padding: 4px 8px; font-size: 12px;">
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <label for="filterEndDate" style="font-size: 11.5px; color: var(--p-color-text-subdued);">To</label>
              <input type="date" id="filterEndDate" class="form-input" style="width: auto; padding: 4px 8px; font-size: 12px;">
            </div>
            <button type="button" class="Polaris-Button Polaris-Button--dark Polaris-Button--slim" onclick="applyCustomDateFilter()">
              Apply Range
            </button>
          </div>

          <!-- Single Dynamic Campaign Filter Row (Populated dynamically from campaignsList) -->
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 8px; border-top: 1px dashed var(--p-color-border);">
            <span style="font-size: 12px; font-weight: 600; color: var(--p-color-text);">Campaign:</span>
            <div class="Polaris-FilterPills" id="analyticsCampaignPills">
              <!-- Dynamically populated by JS renderAnalyticsDynamicCampaignPills() -->
            </div>
          </div>
        </div>`;

const newControls = `        <!-- Unified Controls: Responsive Date Range & Dynamic Campaign Sequence Filter -->
        <div class="Polaris-TableControls analytics-controls-box">
          <!-- Date Period Row -->
          <div class="analytics-filter-row">
            <div class="analytics-filter-row__header">
              <span class="analytics-filter-label">Date Range</span>
              <span id="conversionSummaryRibbon" class="analytics-filter-period-tag">Audit Period: Last 7 Days</span>
            </div>
            <div class="Polaris-FilterPills analytics-pills-scroll" id="analyticsPeriodPills">
              <button type="button" class="Polaris-FilterPill active" onclick="setAnalyticsPeriod(7, this)">Last 7 Days</button>
              <button type="button" class="Polaris-FilterPill" onclick="setAnalyticsPeriod(30, this)">Last 30 Days</button>
              <button type="button" class="Polaris-FilterPill" onclick="setAnalyticsPeriod(90, this)">Last 90 Days</button>
              <button type="button" class="Polaris-FilterPill" onclick="setAnalyticsPeriod('all', this)">All Time</button>
              <button type="button" class="Polaris-FilterPill" onclick="toggleCustomDateInputs(this)">Custom Range</button>
            </div>
          </div>

          <!-- Custom Date Range Form (collapsible) -->
          <div id="customDateRangeBox" class="analytics-custom-date-box" style="display: none;">
            <span style="font-size: 12px; font-weight: 600; color: var(--p-color-text-subdued);">Custom Range:</span>
            <div class="analytics-date-input-group">
              <label for="filterStartDate" style="font-size: 11.5px; color: var(--p-color-text-subdued);">From</label>
              <input type="date" id="filterStartDate" class="form-input" style="width: auto; padding: 4px 8px; font-size: 12px;">
            </div>
            <div class="analytics-date-input-group">
              <label for="filterEndDate" style="font-size: 11.5px; color: var(--p-color-text-subdued);">To</label>
              <input type="date" id="filterEndDate" class="form-input" style="width: auto; padding: 4px 8px; font-size: 12px;">
            </div>
            <button type="button" class="Polaris-Button Polaris-Button--dark Polaris-Button--slim" onclick="applyCustomDateFilter()">
              Apply Range
            </button>
          </div>

          <!-- Single Dynamic Campaign Filter Row -->
          <div class="analytics-filter-row" style="padding-top: 10px; border-top: 1px dashed var(--p-color-border);">
            <div class="analytics-filter-row__header">
              <span class="analytics-filter-label">Campaign Sequence</span>
            </div>
            <div class="Polaris-FilterPills analytics-pills-scroll" id="analyticsCampaignPills">
              <!-- Dynamically populated by JS renderAnalyticsDynamicCampaignPills() -->
            </div>
          </div>
        </div>`;

if (html.includes(oldControls)) {
  html = html.replace(oldControls, newControls);
} else {
  const oldCRLF = oldControls.replace(/\n/g, '\r\n');
  const newCRLF = newControls.replace(/\n/g, '\r\n');
  if (html.includes(oldCRLF)) {
    html = html.replace(oldCRLF, newCRLF);
  }
}

// Bump asset version to v=18.28
html = html.replace(/style\.css\?v=[0-9.]+/g, 'style.css?v=18.28');
html = html.replace(/app\.js\?v=[0-9.]+/g, 'app.js?v=18.28');

fs.writeFileSync(path.join(__dirname, '../public/index.html'), html, 'utf8');
console.log('[Patch] public/index.html updated successfully.');

// 2. Update public/style.css
let css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

const analyticsFilterCss = `
/* ========================================================
   RESPONSIVE ANALYTICS CONTROLS & DATE RANGE CHIPS
   ======================================================== */
.analytics-controls-box {
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 12px !important;
  padding: 14px 18px !important;
}

.analytics-filter-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.analytics-filter-row__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.analytics-filter-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--p-color-text);
  letter-spacing: 0.2px;
}

.analytics-filter-period-tag {
  font-size: 11px;
  color: var(--p-color-text-subdued);
  font-weight: 500;
}

.analytics-pills-scroll {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  width: 100%;
}

.analytics-custom-date-box {
  align-items: center;
  gap: 10px;
  background: #ffffff;
  padding: 8px 12px;
  border-radius: var(--p-radius-sm);
  border: 1px solid var(--p-color-border);
  flex-wrap: wrap;
}

.analytics-date-input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 767px) {
  .analytics-controls-box {
    padding: 10px 12px !important;
    gap: 10px !important;
  }
  .analytics-pills-scroll {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    padding-bottom: 4px !important;
    width: 100% !important;
  }
  .analytics-pills-scroll::-webkit-scrollbar {
    display: none !important;
  }
  .analytics-pills-scroll .Polaris-FilterPill {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    font-size: 11.5px !important;
    padding: 6px 12px !important;
  }
}
`;

if (!css.includes('.analytics-controls-box')) {
  css += '\n' + analyticsFilterCss;
  fs.writeFileSync(path.join(__dirname, '../public/style.css'), css, 'utf8');
  console.log('[Patch] public/style.css updated with analytics filter styles.');
}

// 3. Update public/app.js
let js = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

// Replace setConversionPeriod & toggleCustomDateInputs with flawless toggle and deselect logic
const oldFuncs = `function setConversionPeriod(period, btn) {
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
}`;

const newFuncs = `function setConversionPeriod(period, btn) {
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
}`;

if (js.includes(oldFuncs)) {
  js = js.replace(oldFuncs, newFuncs);
} else {
  const oldFuncsCRLF = oldFuncs.replace(/\n/g, '\r\n');
  const newFuncsCRLF = newFuncs.replace(/\n/g, '\r\n');
  if (js.includes(oldFuncsCRLF)) {
    js = js.replace(oldFuncsCRLF, newFuncsCRLF);
  }
}

// Update applyCustomDateFilter to ensure active state highlights Custom Range pill correctly
js = js.replace(
  `  conversionPeriod = 'custom';
  customStartDate = startVal;
  customEndDate = endVal;

  loadConversions();`,
  `  conversionPeriod = 'custom';
  customStartDate = startVal;
  customEndDate = endVal;

  document.querySelectorAll('#analyticsPeriodPills .Polaris-FilterPill, #conversionPeriodPills .Polaris-FilterPill').forEach(p => {
    p.classList.remove('active');
    if (p.textContent.trim().toLowerCase().includes('custom')) {
      p.classList.add('active');
    }
  });

  loadConversions();
  loadDispatches();`
);

fs.writeFileSync(path.join(__dirname, '../public/app.js'), js, 'utf8');
console.log('[Patch] public/app.js updated successfully with flawless period pill toggling.');
