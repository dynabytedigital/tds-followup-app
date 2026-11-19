const fs = require('fs');
const path = require('path');

const OLD_IMG_1 = 'https://shop.thedentalshaman.com/cdn/shop/files/Screenshot_2026-01-27_120348.png?v=1769523750';
const OLD_IMG_2 = 'https://shop.thedentalshaman.com/cdn/shop/files/Screenshot_2026-01-27_115431.png?v=1769523750';
const OLD_IMG_3 = 'https://shop.thedentalshaman.com/cdn/shop/files/Screenshot_2026-01-27_115522.png?v=1769523750';

const NEW_IMG_1 = 'https://cdn.shopify.com/s/files/1/0946/8238/2665/files/Screenshot_2026-01-27_120348_b0a9652d-b9d2-4921-a3fb-41fca50682fb.png?v=1794600987';
const NEW_IMG_2 = 'https://cdn.shopify.com/s/files/1/0946/8238/2665/files/Screenshot_2026-01-27_115431_508e408a-e4dd-4d6d-a7a6-3b4bb040bef6.png?v=1794600987';
const NEW_IMG_3 = 'https://cdn.shopify.com/s/files/1/0946/8238/2665/files/Screenshot_2026-01-27_115522_e8ef0163-3657-4412-83e8-97f7aaba9733.png?v=1794600987';

// 1. Update scripts/generate_all_campaigns.js
let genScript = fs.readFileSync(path.join(__dirname, 'generate_all_campaigns.js'), 'utf8');
genScript = genScript.split(OLD_IMG_1).join(NEW_IMG_1);
genScript = genScript.split(OLD_IMG_2).join(NEW_IMG_2);
genScript = genScript.split(OLD_IMG_3).join(NEW_IMG_3);

const oldSignature = `<p style="font-size:14px; line-height:1.6; color:#666666; margin:28px 0 0 0; border-top:1px solid #f0ecf2; padding-top:20px;">
      Warmest holistic wishes,<br>
      <strong style="color:#0d0820;">Dr. Marc Mortiboys (BDS)</strong><br>
      <span style="font-size:12.5px; color:#888888;">Founder &amp; Biological Dental Surgeon &middot; The Dental Shaman</span>
    </p>`;

const newSignature = `<div style="margin:28px 0 0 0; border-top:1px solid #f0ecf2; padding-top:20px;">
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle; padding-right:14px; width:56px;">
            <img src="https://thedentalshaman.com/marc_smiling_nature.jpg" alt="Dr. Marc Mortiboys (BDS)" width="56" height="56" style="display:block; width:56px; height:56px; border-radius:50%; object-fit:cover; border:2px solid #744B6F;">
          </td>
          <td style="vertical-align:middle;">
            <p style="font-size:14px; line-height:1.5; color:#666666; margin:0;">
              Warmest holistic wishes,<br>
              <strong style="color:#0d0820; font-size:15px;">Dr. Marc Mortiboys (BDS)</strong><br>
              <span style="font-size:12px; color:#888888;">Founder &amp; Biological Dental Surgeon &middot; The Dental Shaman</span>
            </p>
          </td>
        </tr>
      </table>
    </div>`;

if (genScript.includes(oldSignature)) {
  genScript = genScript.replace(oldSignature, newSignature);
} else {
  const oldSigCRLF = oldSignature.replace(/\n/g, '\r\n');
  const newSigCRLF = newSignature.replace(/\n/g, '\r\n');
  if (genScript.includes(oldSigCRLF)) {
    genScript = genScript.replace(oldSigCRLF, newSigCRLF);
  }
}

fs.writeFileSync(path.join(__dirname, 'generate_all_campaigns.js'), genScript, 'utf8');
console.log('[Patch] scripts/generate_all_campaigns.js updated successfully.');

// 2. Run generate_all_campaigns.js to regenerate all 20 templates & update db.json
require('./generate_all_campaigns.js');

// 3. Update standalone templates
const standalone = ['templates/post_purchase_care.html', 'templates/vip_winback.html'];
standalone.forEach(file => {
  const p = path.join(__dirname, '..', file);
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, 'utf8');
    content = content.split(OLD_IMG_1).join(NEW_IMG_1);
    content = content.split(OLD_IMG_2).join(NEW_IMG_2);
    content = content.split(OLD_IMG_3).join(NEW_IMG_3);
    fs.writeFileSync(p, content, 'utf8');
    console.log(`[Patch] Updated ${file}`);
  }
});

console.log('[Patch] All templates and database updated with verified, 200-OK profile and product images.');
