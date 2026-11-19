const fs = require('fs');
const path = require('path');

// 1. Update public/index.html
let html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

// Update Settings Title & Subtitle
html = html.replace(
  '<div class="Polaris-Card__Title">Settings</div>',
  '<div class="Polaris-Card__Title">Settings &amp; Delivery Configuration</div>'
);
html = html.replace(
  'Email sender identity, API keys, and store integration.',
  'Email sender identity, Google Workspace SMTP credentials, and clinical tracking codes.'
);

// Update grid row in settings
html = html.replace(
  '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">',
  '<div class="settings-form-row">'
);

// Add action button to Settings card header
const oldHeaderCard = `<div class="Polaris-Card__Header">
          <div>
            <div class="Polaris-Card__Title">Settings &amp; Delivery Configuration</div>
            <p class="Polaris-Card__Subtitle">
              Email sender identity, Google Workspace SMTP credentials, and clinical tracking codes.
            </p>
          </div>
        </div>`;

const newHeaderCard = `<div class="Polaris-Card__Header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
          <div>
            <div class="Polaris-Card__Title">Settings &amp; Delivery Configuration</div>
            <p class="Polaris-Card__Subtitle">
              Email sender identity, Google Workspace SMTP credentials, and clinical tracking codes.
            </p>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
            <span class="Polaris-Badge Polaris-Badge--success" style="font-size: 11px; padding: 3px 8px; display: inline-flex; align-items: center; gap: 6px;">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: #16a34a; display: inline-block;"></span>
              Google Workspace SMTP Active
            </span>
            <button type="button" class="Polaris-Button Polaris-Button--primary Polaris-Button--slim" onclick="document.getElementById('settingsForm').requestSubmit()">Save Settings</button>
          </div>
        </div>`;

if (html.includes(oldHeaderCard)) {
  html = html.replace(oldHeaderCard, newHeaderCard);
} else {
  const oldHeaderCardCRLF = oldHeaderCard.replace(/\n/g, '\r\n');
  const newHeaderCardCRLF = newHeaderCard.replace(/\n/g, '\r\n');
  if (html.includes(oldHeaderCardCRLF)) {
    html = html.replace(oldHeaderCardCRLF, newHeaderCardCRLF);
  }
}

// Update asset version to v=18.25
html = html.replace(/style\.css\?v=[0-9.]+/g, 'style.css?v=18.25');
html = html.replace(/app\.js\?v=[0-9.]+/g, 'app.js?v=18.25');

fs.writeFileSync(path.join(__dirname, '../public/index.html'), html, 'utf8');
console.log('[Patch] public/index.html updated successfully.');

// 2. Update public/style.css
let css = fs.readFileSync(path.join(__dirname, '../public/style.css'), 'utf8');

// Ensure Settings tab grid layout matches exact width and styling of all tabs
const settingsCssPatch = `
/* Balanced Full-Width Settings Grid Layout */
.settings-grid-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  align-items: start;
  width: 100%;
  box-sizing: border-box;
}

.settings-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 900px) {
  .settings-grid-layout {
    grid-template-columns: 1fr !important;
    gap: 20px !important;
  }
  .settings-form-row {
    grid-template-columns: 1fr !important;
    gap: 12px !important;
  }
}
`;

if (!css.includes('.settings-form-row')) {
  css += '\n' + settingsCssPatch;
  fs.writeFileSync(path.join(__dirname, '../public/style.css'), css, 'utf8');
  console.log('[Patch] public/style.css updated with settings-form-row.');
}

console.log('[Patch] All patches completed.');
