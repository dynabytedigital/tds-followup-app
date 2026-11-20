const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Target the button inside Polaris-Card__Header
const targetRegex = /\s*<button type="button" class="Polaris-Button Polaris-Button--primary Polaris-Button--slim" onclick="openFreshSequenceComposer\(\)" style="[^"]*">\s*<svg[\s\S]*?<\/svg>\s*Start Fresh Sequence\s*<\/button>/;

if (targetRegex.test(html)) {
  html = html.replace(targetRegex, '');
  console.log('Successfully removed header Start Fresh Sequence button from index.html');
} else {
  console.error('Target button NOT found in index.html');
}

// Bump asset version to v=18.34
html = html.replace(/style\.css\?v=18\.\d+/g, 'style.css?v=18.34');
html = html.replace(/app\.js\?v=18\.\d+/g, 'app.js?v=18.34');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Saved index.html with v=18.34');
