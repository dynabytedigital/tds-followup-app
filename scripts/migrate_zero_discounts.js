const fs = require('fs');
const path = require('path');
const { ALL_TEMPLATES } = require('./generate_all_campaigns');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');

if (fs.existsSync(dbPath)) {
  const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  // 1. Update Campaigns
  if (dbData.campaigns) {
    dbData.campaigns = dbData.campaigns.map(c => {
      if (c.id === 'ebook_50') {
        return {
          ...c,
          name: 'Holistic Dental Wellness Guides',
          shortName: 'Dental Guides'
        };
      }
      if (c.id === 'bogof_cup') {
        return {
          ...c,
          name: 'Mouthwash Cup Routine & Care',
          shortName: 'Mouthwash Cup'
        };
      }
      if (c.id === 'bogof_spray') {
        return {
          ...c,
          name: 'Ozomist Spray Defense Routine',
          shortName: 'Ozomist Spray'
        };
      }
      return c;
    });
  }

  // 2. Replace Templates with the clean, zero-discount ALL_TEMPLATES
  dbData.templates = ALL_TEMPLATES;

  // 3. Update Settings
  if (dbData.settings) {
    dbData.settings.defaultDiscountCode = 'TDS-CARE';
  }

  fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
  console.log('[Migration] Successfully migrated db.json to 100% zero-discount pure tracking architecture!');
} else {
  console.log('[Migration] db.json does not exist yet; will be initialized on first run.');
}
