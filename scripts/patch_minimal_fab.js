const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const htmlPath = path.join(projectDir, 'public', 'index.html');
const cssPath = path.join(projectDir, 'public', 'style.css');

// 1. Update public/index.html
let html = fs.readFileSync(htmlPath, 'utf8');

// Update asset versions to v=18.29
html = html.replace(/style\.css\?v=18\.\d+/g, 'style.css?v=18.29');
html = html.replace(/app\.js\?v=18\.\d+/g, 'app.js?v=18.29');

// Replace stickyStartFreshBtn with minimal plus icon (no text)
const oldStickyBtnRegex = /<!-- STICKY ALIGNED DASHBOARD ACTION: START FRESH[\s\S]*?<button[^>]*id="stickyStartFreshBtn"[\s\S]*?<\/button>/;
const newStickyBtn = `<!-- MINIMAL MONOCHROME STICKY FAB (PURE PLUS ICON, ZERO COLOR) -->
  <button type="button" id="stickyStartFreshBtn" class="sticky-start-fresh-btn" onclick="openFreshSequenceComposer()" title="Start Fresh Sequence" aria-label="Start Fresh Sequence">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  </button>`;

if (oldStickyBtnRegex.test(html)) {
  html = html.replace(oldStickyBtnRegex, newStickyBtn);
  console.log('Successfully replaced stickyStartFreshBtn in index.html');
} else {
  console.warn('Could not find oldStickyBtnRegex match, trying fallback pattern');
  const fallbackRegex = /<button[^>]*id="stickyStartFreshBtn"[\s\S]*?<\/button>/;
  html = html.replace(fallbackRegex, newStickyBtn);
  console.log('Replaced with fallback pattern');
}

fs.writeFileSync(htmlPath, html, 'utf8');

// 2. Update public/style.css
let css = fs.readFileSync(cssPath, 'utf8');

const oldCssRegex = /\/\* ========================================================\s*STICKY START FRESH DASHBOARD ACTION[\s\S]*?\.btn-bar-start-fresh\s*\{[\s\S]*?\}\s*\}/;

const newCss = `/* ========================================================
   MINIMAL MONOCHROME STICKY FAB (ZERO COLOR, PLUS ICON ONLY)
   ======================================================== */
.sticky-start-fresh-btn {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 990;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #111827; /* sleek neutral obsidian / zero color */
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  outline: none;
  transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 0;
  margin: 0;
  text-decoration: none;
  backdrop-filter: blur(8px);
}

.sticky-start-fresh-btn:hover {
  background: #000000;
  transform: translateY(-2px) scale(1.06);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.16);
  color: #ffffff;
}

.sticky-start-fresh-btn:active {
  transform: translateY(0) scale(0.96);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22);
}

.sticky-start-fresh-btn svg {
  display: block;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.sticky-start-fresh-btn:hover svg {
  transform: rotate(90deg);
}

/* Hide sticky button when any modal is open to avoid obstruction */
body.modal-open .sticky-start-fresh-btn {
  display: none !important;
}

/* Mobile responsive sticky positioning (iOS & Android) */
@media (max-width: 767px) {
  .sticky-start-fresh-btn {
    bottom: max(18px, env(safe-area-inset-bottom));
    right: 18px;
    width: 44px;
    height: 44px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  }
  .sticky-start-fresh-btn svg {
    width: 18px;
    height: 18px;
  }
  .btn-bar-start-fresh {
    display: none !important;
  }
}`;

if (oldCssRegex.test(css)) {
  css = css.replace(oldCssRegex, newCss);
  console.log('Successfully replaced sticky CSS in style.css');
} else {
  console.warn('Could not find oldCssRegex match in style.css');
}

fs.writeFileSync(cssPath, css, 'utf8');
console.log('Done patching minimal FAB!');
