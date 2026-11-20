const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Remove btnBulkStartFresh
const btnRegex = /\s*<button type="button" id="btnBulkStartFresh"[\s\S]*?<\/button>/;

if (btnRegex.test(html)) {
  html = html.replace(btnRegex, '');
  console.log('Successfully removed #btnBulkStartFresh from index.html');
} else {
  console.error('#btnBulkStartFresh NOT found in index.html');
}

// Bump asset version to v=18.32
html = html.replace(/style\.css\?v=18\.\d+/g, 'style.css?v=18.32');
html = html.replace(/app\.js\?v=18\.\d+/g, 'app.js?v=18.32');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Saved index.html with v=18.32');
