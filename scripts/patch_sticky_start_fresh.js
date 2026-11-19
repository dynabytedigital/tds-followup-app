const fs = require('fs');
const path = require('path');

// 1. Update public/index.html
let html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

// Upgrade Customers Card Header button to primary green
html = html.replace(
  '<button type="button" class="Polaris-Button Polaris-Button--slim" onclick="openFreshSequenceComposer()" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">',
  '<button type="button" class="Polaris-Button Polaris-Button--primary Polaris-Button--slim" onclick="openFreshSequenceComposer()" style="font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;">'
);

// Add Start Fresh button in the spend-filter bar next to sort spend
const oldSortGroup = `<div class="spend-sort-group">
              <span style="font-size: 12px; color: var(--p-color-text-subdued); font-weight: 500;">Sort Spend:</span>
              <button type="button" class="spend-sort-btn" id="btnSortSpend" onclick="toggleSpendSort()" title="Toggle sort by total spent">
                <span id="spendSortLabel">Default</span>
                <svg id="spendSortSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
              </button>
            </div>`;

const newSortGroup = `<div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end;">
              <div class="spend-sort-group">
                <span style="font-size: 12px; color: var(--p-color-text-subdued); font-weight: 500;">Sort Spend:</span>
                <button type="button" class="spend-sort-btn" id="btnSortSpend" onclick="toggleSpendSort()" title="Toggle sort by total spent">
                  <span id="spendSortLabel">Default</span>
                  <svg id="spendSortSvg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
                </button>
              </div>
              <button type="button" class="Polaris-Button Polaris-Button--slim btn-bar-start-fresh" onclick="openFreshSequenceComposer()" style="background: #ffffff; border-color: var(--p-color-border-dark); font-weight: 600; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 2px 10px; font-size: 12px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Start Fresh
              </button>
            </div>`;

if (html.includes(oldSortGroup)) {
  html = html.replace(oldSortGroup, newSortGroup);
} else {
  const oldSortGroupCRLF = oldSortGroup.replace(/\n/g, '\r\n');
  const newSortGroupCRLF = newSortGroup.replace(/\n/g, '\r\n');
  if (html.includes(oldSortGroupCRLF)) {
    html = html.replace(oldSortGroupCRLF, newSortGroupCRLF);
  }
}

// Add the Sticky Start Fresh Button right before closing body
const stickyFabHtml = `
  <!-- STICKY ALIGNED DASHBOARD ACTION: START FRESH (ALWAYS VISIBLE & CLICKABLE) -->
  <button type="button" id="stickyStartFreshBtn" class="sticky-start-fresh-btn" onclick="openFreshSequenceComposer()" aria-label="Start Fresh Sequence">
    <span class="sticky-start-fresh-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </span>
    <span class="sticky-start-fresh-label">Start Fresh</span>
  </button>
`;

if (!html.includes('id="stickyStartFreshBtn"')) {
  html = html.replace('<!-- Toast Notification Container -->', stickyFabHtml + '\n  <!-- Toast Notification Container -->');
}

// Bump version to v=18.27
html = html.replace(/style\.css\?v=[0-9.]+/g, 'style.css?v=18.27');
html = html.replace(/app\.js\?v=[0-9.]+/g, 'app.js?v=18.27');

fs.writeFileSync(path.join(__dirname, '../public/index.html'), html, 'utf8');
console.log('[Patch] public/index.html updated successfully with sticky Start Fresh button.');

// 2. Update public/style.css
let css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

const stickyCss = `
/* ========================================================
   STICKY START FRESH DASHBOARD ACTION (ALWAYS VISIBLE & CLICKABLE)
   ======================================================== */
.sticky-start-fresh-btn {
  position: fixed;
  bottom: 26px;
  right: 28px;
  z-index: 990;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px 11px 16px;
  background: #008060;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 32px;
  font-size: 13.5px;
  font-weight: 600;
  font-family: inherit;
  letter-spacing: 0.2px;
  box-shadow: 0 4px 16px rgba(0, 128, 96, 0.45), 0 1px 3px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  outline: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-decoration: none;
  white-space: nowrap;
  backdrop-filter: blur(8px);
}

.sticky-start-fresh-btn:hover {
  background: #006e52;
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(0, 128, 96, 0.55), 0 2px 6px rgba(0, 0, 0, 0.18);
  color: #ffffff;
}

.sticky-start-fresh-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 128, 96, 0.35);
}

.sticky-start-fresh-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
}

/* Hide sticky button when any modal is open to avoid obstruction */
body.modal-open .sticky-start-fresh-btn {
  display: none !important;
}

/* Mobile responsive sticky positioning (iOS & Android) */
@media (max-width: 767px) {
  .sticky-start-fresh-btn {
    bottom: max(16px, env(safe-area-inset-bottom));
    right: 16px;
    padding: 10px 16px 10px 14px;
    font-size: 13px;
    box-shadow: 0 4px 14px rgba(0, 128, 96, 0.45), 0 1px 3px rgba(0,0,0,0.2);
  }
  .btn-bar-start-fresh {
    display: none !important; /* On mobile, the sticky floating button is optimal and unclutters filter row */
  }
}
`;

if (!css.includes('.sticky-start-fresh-btn')) {
  css += '\n' + stickyCss;
  fs.writeFileSync(path.join(__dirname, '../public/style.css'), css, 'utf8');
  console.log('[Patch] public/style.css updated with sticky-start-fresh-btn styling.');
}

console.log('[Patch] Completed.');
