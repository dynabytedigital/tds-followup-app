const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const htmlPath = path.join(projectDir, 'public', 'index.html');
const appJsPath = path.join(projectDir, 'public', 'app.js');

// 1. Update public/index.html
let html = fs.readFileSync(htmlPath, 'utf8');

html = html.replace('🚀 Launch Sequence (0 Recipients)', 'Launch Sequence (0 Recipients)');

// Bump asset version to v=18.33
html = html.replace(/style\.css\?v=18\.\d+/g, 'style.css?v=18.33');
html = html.replace(/app\.js\?v=18\.\d+/g, 'app.js?v=18.33');

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Updated index.html to remove rocket emoji from Launch Sequence button');

// 2. Update public/app.js
let appJs = fs.readFileSync(appJsPath, 'utf8');

appJs = appJs.replace(
  '`🚀 Launch Sequence (${freshRecipients.length} Recipient${freshRecipients.length === 1 ? \'\' : \'s\'})`',
  '`Launch Sequence (${freshRecipients.length} Recipient${freshRecipients.length === 1 ? \'\' : \'s\'})`'
);

// Also clean up alert emoji if present
appJs = appJs.replace('alert(`🎉 Sequence Successfully Launched!', 'alert(`Sequence Successfully Launched!');

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('Updated app.js to remove rocket emoji from Launch Sequence button');
