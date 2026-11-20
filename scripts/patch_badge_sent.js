const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'public', 'app.js');
const htmlPath = path.join(__dirname, '..', 'public', 'index.html');

let app = fs.readFileSync(appPath, 'utf8');

// Replace DELIVERED with SENT badge
app = app.replace(
  /deliveryBadge = `<span class="rank-badge rank-badge-dev">DELIVERED<\/span>`;/g,
  'deliveryBadge = `<span class="rank-badge rank-badge-dev" title="Dispatched successfully via mail provider">SENT</span>`;'
);

app = app.replace(
  /timingHtml = `<span style="color:#16a34a; font-weight:600; font-size:11\.5px;">✓ Delivered \(\$\{sDate\}\)<\/span>`;/g,
  'timingHtml = `<span style="color:#16a34a; font-weight:600; font-size:11.5px;" title="Dispatched to mail provider">✓ Sent (${sDate})</span>`;'
);

fs.writeFileSync(appPath, app, 'utf8');

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/style\.css\?v=18\.\d+/g, 'style.css?v=18.31');
html = html.replace(/app\.js\?v=18\.\d+/g, 'app.js?v=18.31');
fs.writeFileSync(htmlPath, html, 'utf8');

console.log('Updated badge to SENT and bumped to v=18.31');
