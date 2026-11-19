const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

function buildEmailHtml({
  badgeText,
  title,
  heroText,
  clinicalSectionTitle,
  clinicalPoints,
  ctaText,
  ctaUrl
}) {
  const pointsHtml = clinicalPoints.map(p => `
    <li style="margin-bottom:8px;">
      <strong style="color:#0d0820;">${p.bold}:</strong> ${p.text}
    </li>
  `).join('');

  return `<!-- THE DENTAL SHAMAN • CLINICAL CARE SEQUENCE -->
<div style="font-family:Georgia, 'Times New Roman', serif; max-width:600px; margin:0 auto; background-color:#faf8f5; border:1px solid #e8e3ec; border-radius:8px; overflow:hidden; color:#2d2d2d;">

  <!-- HEADER -->
  <div style="background-color:#0d0820; padding:28px 24px 22px 24px; text-align:center;">
    <a href="{{shop_url}}" target="_blank" style="text-decoration:none; display:inline-block; margin-bottom:14px;">
      <img src="https://thedentalshaman.com/assets/tds_logo_header.png" alt="The Dental Shaman" style="height:46px; width:auto; display:block; margin:0 auto; border:0;">
    </a>
    <p style="color:#2D8B7A; font-size:11px; letter-spacing:2px; text-transform:uppercase; margin:0 0 8px 0; font-family:Arial,sans-serif; font-weight:bold;">
      ${badgeText}
    </p>
    <h1 style="color:#ffffff; font-size:24px; font-weight:normal; margin:0; line-height:1.3; font-style:italic;">
      ${title}
    </h1>
  </div>

  <!-- HERO IMAGE STRIP -->
  <div style="padding:0; margin:0; line-height:0; background-color:#0d0820;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td width="33.33%" style="padding:0 1px 0 0; vertical-align:top; line-height:0;">
          <img src="https://shop.thedentalshaman.com/cdn/shop/files/Screenshot_2026-01-27_120348.png?v=1769523750" alt="Biological Care" style="display:block; width:100%; height:140px; object-fit:cover; border:0;">
        </td>
        <td width="33.33%" style="padding:0 1px 0 1px; vertical-align:top; line-height:0;">
          <img src="https://shop.thedentalshaman.com/cdn/shop/files/Screenshot_2026-01-27_115431.png?v=1769523750" alt="Clinical Tool" style="display:block; width:100%; height:140px; object-fit:cover; border:0;">
        </td>
        <td width="33.33%" style="padding:0 0 0 1px; vertical-align:top; line-height:0;">
          <img src="https://shop.thedentalshaman.com/cdn/shop/files/Screenshot_2026-01-27_115522.png?v=1769523750" alt="Dr. Marc Mortiboys" style="display:block; width:100%; height:140px; object-fit:cover; border:0;">
        </td>
      </tr>
    </table>
  </div>

  <!-- CONTENT -->
  <div style="padding:32px 28px 24px 28px; background:#ffffff;">
    <p style="font-size:16px; line-height:1.6; margin:0 0 16px 0;">
      Dear {{first_name}},
    </p>
    <div style="font-size:15px; line-height:1.65; color:#444444; margin:0 0 20px 0;">
      ${heroText}
    </div>

    <!-- DOCTOR'S CLINICAL POINTS -->
    <div style="background-color:#fbf7fa; border-left:4px solid #744B6F; padding:18px 20px; margin:22px 0; border-radius:0 6px 6px 0;">
      <h3 style="color:#744B6F; font-size:14px; margin:0 0 10px 0; font-family:Arial,sans-serif; text-transform:uppercase; letter-spacing:0.5px;">
        ${clinicalSectionTitle}
      </h3>
      <ul style="margin:0; padding-left:18px; font-family:Arial,sans-serif; font-size:13.5px; color:#4a4a4a; line-height:1.6;">
        ${pointsHtml}
      </ul>
    </div>

    <!-- DYNAMIC CLINICAL GUIDANCE BLOCK -->
    {{discount_block}}

    <!-- CTA -->
    <div style="text-align:center; margin:32px 0 24px 0;">
      <a href="${ctaUrl}" target="_blank" style="background-color:#744B6F; color:#ffffff; font-family:Arial,sans-serif; font-size:14.5px; font-weight:bold; text-decoration:none; padding:14px 32px; border-radius:6px; display:inline-block; letter-spacing:0.5px; box-shadow:0 4px 14px rgba(116,75,111,0.25);">
        ${ctaText} &rarr;
      </a>
    </div>

    <p style="font-size:14px; line-height:1.6; color:#666666; margin:28px 0 0 0; border-top:1px solid #f0ecf2; padding-top:20px;">
      Warmest holistic wishes,<br>
      <strong style="color:#0d0820;">Dr. Marc Mortiboys (BDS)</strong><br>
      <span style="font-size:12.5px; color:#888888;">Founder &amp; Biological Dental Surgeon &middot; The Dental Shaman</span>
    </p>
  </div>

  <!-- FOOTER -->
  <div style="background-color:#faf8f5; padding:20px 24px; text-align:center; font-family:Arial,sans-serif; font-size:11.5px; color:#888888; border-top:1px solid #e8e3ec;">
    <p style="margin:0 0 6px 0;">The Dental Shaman &middot; Surrey, United Kingdom &middot; shop.thedentalshaman.com</p>
    <p style="margin:0;">You are receiving this communication as a valued client of The Dental Shaman.</p>
  </div>
</div>`;
}

const ALL_TEMPLATES = [
  // ==========================================
  // CAMPAIGN 1: WATER FLOSSER ROUTINE & CARE (5 STAGES)
  // ==========================================
  {
    id: 'water_flosser_1',
    campaignId: 'water_flosser',
    campaignName: 'Water Flosser Routine & Care',
    stage: 1,
    stageLabel: 'Stage 1: Setup & Guidance',
    name: 'Flosser Setup & 7-Day Adaptation Guide',
    subject: 'A personal clinical note from Dr. Marc Mortiboys (BDS) on your Sonic Flosser',
    discountCode: 'TDS-FLOSSER',
    discountPercent: 0,
    description: 'Post-purchase onboarding on pressure modes, warm water use, and 45° sulcus angle positioning.',
    file: 'water_flosser_1.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (1 of 5)',
      title: 'Optimal Sonic Flosser Setup & Adaptation',
      heroText: 'I wanted to personally check in and guide your first week with the Ozone Sonic Water Flosser. Biological dentistry is built on working with your oral biology rather than tearing delicate periodontal ligaments with aggressive pressure.',
      clinicalSectionTitle: 'Three Rules For Your First 7 Days:',
      clinicalPoints: [
        { bold: 'Start on Soft Mode', text: 'Allow gingival tissues 5-7 days to adapt to pulsed hydro-irrigation before increasing intensity.' },
        { bold: 'Use Luke-Warm Water', text: 'Cold water shocks exposed dentin tubules and triggers acute nerve sensitivity.' },
        { bold: 'Trace the Gumline at 45°', text: 'Keep the nozzle tip aimed at the sulcus margin where anaerobic biofilm accumulates.' }
      ],
      ctaText: 'View The Clinical Technique Guide',
      ctaUrl: '{{shop_url}}/pages/water-flosser-guide'
    }
  },
  {
    id: 'water_flosser_2',
    campaignId: 'water_flosser',
    campaignName: 'Water Flosser Routine & Care',
    stage: 2,
    stageLabel: 'Stage 2: Periodontal Calibration',
    name: 'Why 90 PSI Protects Periodontal Pockets',
    subject: 'Why 90 PSI protects periodontal pockets without tissue trauma, {{first_name}}',
    discountCode: 'TDS-FLOSSER',
    discountPercent: 0,
    description: 'Clinical rationale of pulsed micro-bubbles disrupting anaerobic subgingival biofilm.',
    file: 'water_flosser_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (2 of 5)',
      title: 'The Periodontal Sulcus & Micro-Bubble Physics',
      heroText: 'Many patients ask me why string floss frequently leaves periodontal pockets inflamed. String floss cuts horizontally across papillae and cannot reach deeper than 2-3mm without causing tissue laceration.',
      clinicalSectionTitle: 'The Hydro-Dynamic Advantage:',
      clinicalPoints: [
        { bold: 'Pulsed Fluid Dynamics', text: 'Rapid pulses create acoustic micro-cavitation bubbles that physically dislodge stubborn colonies.' },
        { bold: 'Oxygenating Anaerobic Pockets', text: 'Pathogenic bacteria like P. gingivalis thrive in oxygen-depleted depths; irrigation delivers life-giving oxygen.' },
        { bold: 'Preserves Attached Gingiva', text: 'Zero mechanical abrasion means your delicate sulcular epithelial attachment remains pristine.' }
      ],
      ctaText: 'Explore Periodontal Care Resources',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'water_flosser_3',
    campaignId: 'water_flosser',
    campaignName: 'Water Flosser Routine & Care',
    stage: 3,
    stageLabel: 'Stage 3: Antimicrobial Infusion',
    name: 'Liquid Ozone & Organic Antimicrobial Infusions',
    subject: 'Clinical Tip: What to add to your flosser reservoir for 3x defense, {{first_name}}',
    discountCode: 'TDS-FLOSSER',
    discountPercent: 0,
    description: 'Guide to infusing the reservoir with organic rinses and biological saline solutions.',
    file: 'water_flosser_3.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (3 of 5)',
      title: 'Infusing Your Reservoir: Biological Additives',
      heroText: 'Your water flosser is not just an irrigator — it is an active delivery system for biological antimicrobial agents. By adding pure clinical elements to warm reservoir water, you accelerate tissue regeneration.',
      clinicalSectionTitle: 'Approved Reservoir Infusions:',
      clinicalPoints: [
        { bold: 'Himalayan Pink Saline', text: 'Add 1/4 tsp pure dissolved mineral salt to create an isotonic soothing rinse.' },
        { bold: 'Diluted Botanical Mouthwash', text: 'Add 1-2 capfuls of alcohol-free herbal rinse to circulate botanical extracts subgingivally.' },
        { bold: 'Ozonated Water Synergy', text: 'Fill directly from an ozone generator to flood pockets with transient trioxygen for instant biofilm oxidation.' }
      ],
      ctaText: 'Explore Biological Additives & Care',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'water_flosser_4',
    campaignId: 'water_flosser',
    campaignName: 'Water Flosser Routine & Care',
    stage: 4,
    stageLabel: 'Stage 4: Tip Refresh & Hygiene',
    name: '60-Day Hygienic Tip Refresh & Anti-Calcification',
    subject: 'Time to refresh your flosser tips, {{first_name}}? Clinical care notice',
    discountCode: 'TDS-FLOSSER',
    discountPercent: 0,
    description: 'Preventing bacterial colonization on nozzles and mineral scaling inside the pump.',
    file: 'water_flosser_4.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (4 of 5)',
      title: 'Nozzle Hygiene & Tip Maintenance',
      heroText: 'Just like manual toothbrush bristles degrade, water flosser nozzle orifices wear under continuous 90 PSI pressure. Micro-grooves harbor bacterial biofilm after 60 to 90 days of consistent usage.',
      clinicalSectionTitle: 'Hygiene Maintenance Checklist:',
      clinicalPoints: [
        { bold: 'Replace Tips Every 60-90 Days', text: 'Ensures a focused, cohesive water jet stream and prevents bacterial retrograde.' },
        { bold: 'Monthly Vinegar Descaling', text: 'Run 1 part white vinegar to 2 parts warm water to clear tap water calcium deposits.' },
        { bold: 'Air Dry Reservoir Open', text: 'Never leave stagnant water sitting sealed in the chamber overnight.' }
      ],
      ctaText: 'Replenish Flosser Tips & Accessories',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'water_flosser_5',
    campaignId: 'water_flosser',
    campaignName: 'Water Flosser Routine & Care',
    stage: 5,
    stageLabel: 'Stage 5: VIP Loyalty Check-In',
    name: 'VIP Loyalty Check-In & Complete Oral Mastery',
    subject: 'How is your gum sensitivity feeling, {{first_name}}? Clinical check-in',
    discountCode: 'TDS-FLOSSER',
    discountPercent: 0,
    description: 'Milestone check-in celebrating bleeding cessation and long-term oral vitality.',
    file: 'water_flosser_5.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (5 of 5)',
      title: 'Congratulations on Oral Routine Mastery',
      heroText: 'By sticking with your water flossing protocol, you have significantly reduced systemic inflammation markers entering via the oral-vascular route. Patients at this stage routinely report complete cessation of bleeding.',
      clinicalSectionTitle: 'Long-Term Biological Strategy:',
      clinicalPoints: [
        { bold: 'Notice Gum Color', text: 'Healthy gingiva transitions from congested red to firm, pale stippled pink.' },
        { bold: 'Pair with Tongue Scraping', text: 'Remove morning volatile sulfur compounds before bedtime irrigation.' },
        { bold: 'Continuous Clinical Support', text: 'Our clinical team is always available to answer your periodontal and holistic oral health questions.' }
      ],
      ctaText: 'Visit The Dental Shaman Store',
      ctaUrl: '{{shop_url}}'
    }
  },

  // ==========================================
  // CAMPAIGN 2: MOUTHWASH CUP ROUTINE & CARE (5 STAGES)
  // ==========================================
  {
    id: 'bogof_cup_1',
    campaignId: 'bogof_cup',
    campaignName: 'Mouthwash Cup Routine & Care',
    stage: 1,
    stageLabel: 'Stage 1: The Copper Ritual',
    name: 'The Sacred Biological Copper Water Ritual',
    subject: 'The Oligodynamic Effect: Why drinking from pure copper transforms morning oral wellness',
    discountCode: 'TDS-COPPER',
    discountPercent: 0,
    description: 'Clinical explanation of Tamra Jal, antimicrobial oligodynamic copper ions, and morning saliva alkalization.',
    file: 'bogof_cup_1.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (1 of 5)',
      title: 'The Sacred Biological Copper Water Ritual',
      heroText: 'In biological medicine and ancient Ayurveda, storing water in 100% pure copper overnight creates "Tamra Jal." Microscopic copper ions naturally leach into the water — a phenomenon known clinically as the <strong>Oligodynamic Effect</strong>, proven to eliminate harmful bacteria naturally without chemical additives.',
      clinicalSectionTitle: 'Why Pure Copper Belongs In Your Morning Routine:',
      clinicalPoints: [
        { bold: 'Natural Antimicrobial Action', text: 'Copper ions disrupt bacterial cell walls, keeping water sterile and alkaline.' },
        { bold: 'Alkalizes Morning Saliva', text: 'Drinking copper-charged water neutralizes morning acidic saliva that causes enamel erosion.' },
        { bold: 'Zero Plastic Leaching', text: 'Completely eliminates microplastics and endocrine disruptors from your hydration.' }
      ],
      ctaText: 'Discover Handcrafted Copper Cups',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },
  {
    id: 'bogof_cup_2',
    campaignId: 'bogof_cup',
    campaignName: 'Mouthwash Cup Routine & Care',
    stage: 2,
    stageLabel: 'Stage 2: Vessel Benefits',
    name: 'Handcrafted Copper Water Vessels: Benefits & Care',
    subject: 'Pure Artisan Copper: Daily clinical hydration for periodontal health, {{first_name}}',
    discountCode: 'TDS-COPPER',
    discountPercent: 0,
    description: 'Detailed clinical guide on unlined copper vessels, morning routines, and biological health.',
    file: 'bogof_cup_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (2 of 5)',
      title: 'Artisan Copper Vessel Protocol',
      heroText: 'To help you establish consistent biological hydration at home and at work, Dr. Marc recommends incorporating unlined pure copper vessels into your everyday routine.',
      clinicalSectionTitle: 'Clinical Copper Properties:',
      clinicalPoints: [
        { bold: '100% Pure Virgin Copper', text: 'Heavy gauge, unlined, and free from synthetic nickel or tin coatings.' },
        { bold: 'Bedside Hydration', text: 'Store room temperature water overnight (6-8 hours) for optimal ion absorption.' },
        { bold: 'Biological Alkaline Balance', text: 'Supports systemic and salivary pH balance naturally.' }
      ],
      ctaText: 'Explore Copper Vessel Details &rarr;',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },
  {
    id: 'bogof_cup_3',
    campaignId: 'bogof_cup',
    campaignName: 'Mouthwash Cup Routine & Care',
    stage: 3,
    stageLabel: 'Stage 3: Morning Detox Protocol',
    name: 'Dr. Marc\'s 3-Step Morning Oral Detox Routine',
    subject: 'How Dr. Marc uses pure copper water every morning in 3 clinical steps',
    discountCode: 'TDS-COPPER',
    discountPercent: 0,
    description: 'Actionable step-by-step: scrape tongue, swish copper water, hydrate gut before coffee.',
    file: 'bogof_cup_3.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (3 of 5)',
      title: 'Dr. Marc\'s 3-Step Morning Detox Routine',
      heroText: 'Most people wake up and immediately brew acidic coffee, trapping overnight bacterial biofilm onto enamel. Here is the exact clinical sequence I practice every morning to protect teeth and wake up the digestive fire.',
      clinicalSectionTitle: 'The 3-Step Morning Sequence:',
      clinicalPoints: [
        { bold: 'Step 1: Scrape Tongue 7 Times', text: 'Gently scrape from root to tip to remove overnight metabolic waste before swallowing anything.' },
        { bold: 'Step 2: Swish Copper Water for 30s', text: 'Take a generous sip of Tamra Jal and swish across gums to coat mucosal tissues with alkaline ions.' },
        { bold: 'Step 3: Drink Full Vessel Warm', text: 'Hydrate your intestines to stimulate peristalsis before your first meal or hot beverage.' }
      ],
      ctaText: 'Explore The Full Morning Detox Protocol',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },
  {
    id: 'bogof_cup_4',
    campaignId: 'bogof_cup',
    campaignName: 'Mouthwash Cup Routine & Care',
    stage: 4,
    stageLabel: 'Stage 4: Patina & Cleaning Care',
    name: 'Pure Copper Maintenance & Natural Patina Care',
    subject: 'Why real copper darkens and how to clean it naturally in 60 seconds',
    discountCode: 'TDS-COPPER',
    discountPercent: 0,
    description: 'Clinical guide on natural lemon & salt cleaning, explaining oxidation vs harmful green verdigris.',
    file: 'bogof_cup_4.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (4 of 5)',
      title: 'Maintaining Pure Copper: Natural Patina Guide',
      heroText: 'If your copper cup begins developing dark spots or a deeper reddish-brown tone, rejoice! That is conclusive scientific proof your vessel is genuine 100% unlined copper rather than a plastic imitation coated in clear varnish.',
      clinicalSectionTitle: 'The 60-Second Natural Cleanse:',
      clinicalPoints: [
        { bold: 'Half a Lemon + Pinch of Salt', text: 'Rub the cut lemon dipped in sea salt across the cup surface; watch oxidation dissolve instantly.' },
        { bold: 'Rinse with Warm Water', text: 'Wash away acidic lemon residue and dry thoroughly with a soft microfibre towel.' },
        { bold: 'Never Use A Dishwasher', text: 'Harsh industrial chemical detergents strip pure copper and damage its metallurgical structure.' }
      ],
      ctaText: 'Read The Complete Copper Care Manual',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },
  {
    id: 'bogof_cup_5',
    campaignId: 'bogof_cup',
    campaignName: 'Mouthwash Cup Routine & Care',
    stage: 5,
    stageLabel: 'Stage 5: Courtesy Check-In',
    name: 'Clinical Check-In: Your Copper Water Routine',
    subject: 'Clinical Check-In: Your morning copper water hydration habit, {{first_name}}',
    discountCode: 'TDS-COPPER',
    discountPercent: 0,
    description: 'Courtesy check-in on patient hydration and oral tissue vitality.',
    file: 'bogof_cup_5.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (5 of 5)',
      title: 'Clinical Check-In: Morning Hydration Ritual',
      heroText: 'Our handcrafted copper cups are beaten in small artisan batches in India. Storing water overnight and alkalizing morning saliva is one of the most effective habits you can build for long-term oral biological vitality.',
      clinicalSectionTitle: 'Key Routine Benefits:',
      clinicalPoints: [
        { bold: 'Natural Alkalization', text: 'Balances saliva pH naturally to resist enamel demineralization.' },
        { bold: 'Unlined Pure Copper', text: '100% food-grade certified virgin antimicrobial copper.' },
        { bold: 'Lifelong Biological Companion', text: 'Built to last for decades of daily morning detox rituals.' }
      ],
      ctaText: 'Visit The Copper Vessel Collection &rarr;',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },

  // ==========================================
  // CAMPAIGN 3: OZOMIST SPRAY DEFENSE ROUTINE (5 STAGES)
  // ==========================================
  {
    id: 'bogof_spray_1',
    campaignId: 'bogof_spray',
    campaignName: 'Ozomist Spray Defense Routine',
    stage: 1,
    stageLabel: 'Stage 1: Microbiome Shield',
    name: 'The Oral Microbiome Shield vs Harsh Alcohol Washes',
    subject: 'Why conventional alcohol mouthwash damages your heart and oral barrier',
    discountCode: 'TDS-OZOMIST',
    discountPercent: 0,
    description: 'Clinical breakdown of how alcohol mouthwashes destroy nitric-oxide oral flora, introducing organic botanical spray.',
    file: 'bogof_spray_1.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (1 of 5)',
      title: 'The Oral Microbiome Shield',
      heroText: 'Did you know that standard high-street mouthwashes contain up to 26% alcohol? Clinical studies show this strips the beneficial oral bacteria responsible for producing nitric oxide — leading to spiked blood pressure and dry mouth.',
      clinicalSectionTitle: 'Why Botanical Spray Outperforms Mouthwash:',
      clinicalPoints: [
        { bold: 'Selectively Targets Pathogens', text: 'Plant botanicals suppress Streptococcus mutans without wiping out beneficial probiotics.' },
        { bold: 'Hydrates Rather Than Dries', text: 'Organic plant glycerine maintains salivary moisture and enzymatic defense.' },
        { bold: 'Instant Portable Alkalization', text: 'Pocket-sized protection you can deploy immediately after coffee, sugar, or meals.' }
      ],
      ctaText: 'Explore Botanical Oral Spray',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },
  {
    id: 'bogof_spray_2',
    campaignId: 'bogof_spray',
    campaignName: 'Ozomist Spray Defense Routine',
    stage: 2,
    stageLabel: 'Stage 2: Formulation Guide',
    name: 'Botanical Oral Shield: Organic Herbal Spray Formulation',
    subject: 'Clinical Formula Breakdown: Organic Myrrh, Colloidal Silver, and Peppermint',
    discountCode: 'TDS-OZOMIST',
    discountPercent: 0,
    description: 'Clinical analysis of therapeutic herbal ingredients in Dr. Marc\'s organic botanical spray formula.',
    file: 'bogof_spray_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (2 of 5)',
      title: 'Clinical Formula Architecture',
      heroText: 'We want every client to have clean biological oral defense within arm\'s reach at all times. Dr. Marc\'s Botanical Oral Spray provides portable, on-the-go protection against acidic plaque without harsh chemicals.',
      clinicalSectionTitle: 'What Makes This Formula Unique:',
      clinicalPoints: [
        { bold: 'Wildcrafted Myrrh & Clove', text: 'Centuries of clinical evidence soothing inflamed pocket tissue.' },
        { bold: 'Colloidal Silver Infusion', text: 'Sub-micron silver particles provide natural barrier protection against acidic plaque.' },
        { bold: 'Pure English Peppermint', text: 'Clean, crisp breath without artificial sweeteners or synthetic dyes.' }
      ],
      ctaText: 'Learn More About Botanical Defense &rarr;',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },
  {
    id: 'bogof_spray_3',
    campaignId: 'bogof_spray',
    campaignName: 'Ozomist Spray Defense Routine',
    stage: 3,
    stageLabel: 'Stage 3: Post-Meal Defense',
    name: 'The 2-Minute Midday Post-Meal Enamel Defense Protocol',
    subject: 'The 2-Minute Post-Meal Protocol to stop enamel demineralization on the go',
    discountCode: 'TDS-OZOMIST',
    discountPercent: 0,
    description: 'Practical clinical instructions on spraying right after meals to buffer acidity.',
    file: 'bogof_spray_3.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (3 of 5)',
      title: 'The 2-Minute Post-Meal Protocol',
      heroText: 'Every time you eat carbohydrates, sip coffee, or have fruit, oral bacteria convert sugars into lactic acid within 4 minutes. Your enamel softens during this acidic window. Brushing immediately actually scrubs away softened enamel.',
      clinicalSectionTitle: 'The Correct Post-Meal Sequence:',
      clinicalPoints: [
        { bold: 'Wait Before Brushing', text: 'Never brush immediately after acidic food; let minerals resettle.' },
        { bold: 'Spray 2 Pumps Directly', text: 'Spray onto tongue and inner cheeks to immediately buffer saliva back to pH 7.2.' },
        { bold: 'Swish Saliva for 10 Seconds', text: 'Allows botanical flavonoids to penetrate tight contact points.' }
      ],
      ctaText: 'Explore Botanical Spray Protocols',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },
  {
    id: 'bogof_spray_4',
    campaignId: 'bogof_spray',
    campaignName: 'Ozomist Spray Defense Routine',
    stage: 4,
    stageLabel: 'Stage 4: Organic Ingredients',
    name: 'Inside The Bottle: Clinical Anatomy of Organic Myrrh & Silver',
    subject: 'The science behind our wildcrafted Myrrh, Colloidal Silver, and Peppermint',
    discountCode: 'TDS-OZOMIST',
    discountPercent: 0,
    description: 'Detailed monograph on therapeutic plant actives, anti-gingivitis flavonoids, and biocompatibility.',
    file: 'bogof_spray_4.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (4 of 5)',
      title: 'Therapeutic Monograph: What Is In Your Spray',
      heroText: 'Commercial oral sprays rely on synthetic cetylpyridinium chloride (CPC) and sodium saccharin. Our formula uses certified food-grade, biocompatible botanicals that nourish connective tissue.',
      clinicalSectionTitle: 'Active Therapeutic Components:',
      clinicalPoints: [
        { bold: 'Somalian Commiphora Myrrha', text: 'Potent sesquiterpenes physically shrink inflamed sulcular margins.' },
        { bold: 'Pharmaceutical Colloidal Silver (20 PPM)', text: 'Generates electrical field that disrupts bacterial replication without developing resistance.' },
        { bold: 'Organic Aloe Vera Base', text: 'Contains acemannan to stimulate fibroblast growth and speed ulcer healing.' }
      ],
      ctaText: 'Discover Full Formula Specifications',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },
  {
    id: 'bogof_spray_5',
    campaignId: 'bogof_spray',
    campaignName: 'Ozomist Spray Defense Routine',
    stage: 5,
    stageLabel: 'Stage 5: Courtesy Check-In',
    name: 'Clinical Check-In: Botanical Spray Oral Protection',
    subject: 'Clinical Check-In: Your daily midday botanical defense, {{first_name}}',
    discountCode: 'TDS-OZOMIST',
    discountPercent: 0,
    description: 'Clinical check-in on patient portable oral defense and midday enamel buffering.',
    file: 'bogof_spray_5.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (5 of 5)',
      title: 'Clinical Check-In: On-The-Go Oral Vitality',
      heroText: 'Keeping your saliva pH neutral between meals is the single greatest preventive habit you can adopt against acid erosion and recurrent decay. We hope your Botanical Oral Spray is keeping your oral microbiome thriving.',
      clinicalSectionTitle: 'Daily Enamel Protection Summary:',
      clinicalPoints: [
        { bold: 'Buffered Salivary pH', text: 'Restores neutral pH within seconds of post-meal acidity.' },
        { bold: 'Nourishes Periodontal Tissues', text: 'Plant botanicals soothe tender sulcular margins.' },
        { bold: 'Zero Harmful Additives', text: 'Free of alcohol, artificial dyes, and synthetic sweeteners.' }
      ],
      ctaText: 'Visit The Botanical Care Range &rarr;',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },

  // ==========================================
  // CAMPAIGN 4: HOLISTIC DENTAL WELLNESS GUIDES (5 STAGES)
  // ==========================================
  {
    id: 'ebook_50_1',
    campaignId: 'ebook_50',
    campaignName: 'Holistic Dental Wellness Guides',
    stage: 1,
    stageLabel: 'Stage 1: Living Teeth Biology',
    name: 'The Root Cause of Oral Disease & Living Teeth Biology',
    subject: 'Why cavities and gum disease are symptoms of internal imbalance, {{first_name}}',
    discountCode: 'TDS-GUIDES',
    discountPercent: 0,
    description: 'Dr. Marc\'s foundational philosophy on how teeth heal from within via dentinal fluid flow.',
    file: 'ebook_50_1.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Biological Wisdom Series (1 of 5)',
      title: 'Teeth Are Living Organs: The Root Cause',
      heroText: 'Conventional dentistry treats teeth like inert blocks of stone to be drilled, filled, and billed. But biological dentistry reveals that each tooth is a living organ connected to your autonomic nervous system, endocrine glands, and lymphatic drainage.',
      clinicalSectionTitle: 'Core Biological Principles:',
      clinicalPoints: [
        { bold: 'The Dentinal Fluid Flow', text: 'When healthy, nutrient-rich fluid pumps outward from the pulp through microscopic tubules to repel bacteria.' },
        { bold: 'Systemic Stress & Diet Reversal', text: 'High sugar and chronic stress reverse this fluid flow, sucking oral bacteria inward toward the nerve.' },
        { bold: 'Remineralization Is Possible', text: 'With correct fat-soluble vitamins (K2, D3, A) and minerals, teeth can actively remineralize.' }
      ],
      ctaText: 'Explore The Holistic Guide Library',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_2',
    campaignId: 'ebook_50',
    campaignName: 'Holistic Dental Wellness Guides',
    stage: 2,
    stageLabel: 'Stage 2: Biological Guides',
    name: 'The Complete Dental Shaman Biological Guide Series',
    subject: 'Clinical Guide Series: Biological Oral Health Protocols by Dr. Marc Mortiboys',
    discountCode: 'TDS-GUIDES',
    discountPercent: 0,
    description: 'Comprehensive overview of Dr. Marc\'s digital clinical protocols and oral wellness guides.',
    file: 'ebook_50_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Biological Wisdom Series (2 of 5)',
      title: 'Biological Dental Protocols & Clinical Guides',
      heroText: 'To put the power of preventive biological medicine directly in your hands, Dr. Marc has assembled his comprehensive clinical guide series covering natural remineralization, periodontal restoration, and biocompatible oral care.',
      clinicalSectionTitle: 'Included in the Digital Collection:',
      clinicalPoints: [
        { bold: 'Reversing Gum Recession Naturally', text: 'Clinical nutrition and hydro-therapy protocols to tighten periodontal attachments.' },
        { bold: 'The Enamel Remineralization Protocol', text: 'The exact ratio of fat-soluble vitamins and ionic trace minerals to harden tooth structure.' },
        { bold: 'The Toxic Dentistry Detox Guide', text: 'Safe practices surrounding mercury amalgam, root canals, and fluoride alternatives.' }
      ],
      ctaText: 'Read Dr. Marc\'s Clinical Guides &rarr;',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_3',
    campaignId: 'ebook_50',
    campaignName: 'Holistic Dental Wellness Guides',
    stage: 3,
    stageLabel: 'Stage 3: Chapter Excerpt',
    name: 'Clinical Chapter Excerpt: Reversing Demineralization',
    subject: 'Excerpt from Chapter 2: The dentinal fluid flow that actively heals teeth',
    discountCode: 'TDS-GUIDES',
    discountPercent: 0,
    description: 'Actionable excerpt on Vitamin K2 (MK-7) directing calcium into teeth rather than arteries.',
    file: 'ebook_50_3.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Biological Wisdom Series (3 of 5)',
      title: 'Chapter Excerpt: How Calcium Reaches Your Teeth',
      heroText: 'Here is a free clinical excerpt from Chapter 2 of Dr. Marc\'s master guide: <em>"Most people take calcium supplements believing it strengthens teeth. In reality, without Vitamin K2, calcium floats in the blood and deposits in your coronary arteries rather than your teeth."</em>',
      clinicalSectionTitle: 'Key Takeaways from the Chapter:',
      clinicalPoints: [
        { bold: 'Vitamin K2 (MK-7) is the Conductor', text: 'K2 activates Osteocalcin, the protein that literally grabs calcium and locks it into tooth enamel.' },
        { bold: 'Magnesium Ratio Matters', text: 'Excess calcium without magnesium leads to brittle enamel prone to micro-fractures.' },
        { bold: 'Complete Clinical Protocols', text: 'Includes complete daily nutritional tables and meal timing strategies.' }
      ],
      ctaText: 'Read The Complete Clinical Protocol &rarr;',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_4',
    campaignId: 'ebook_50',
    campaignName: 'Holistic Dental Wellness Guides',
    stage: 4,
    stageLabel: 'Stage 4: Toxic Dentistry Myths',
    name: 'Biocompatible Dentistry: Myths & Safe Holistic Protocols',
    subject: 'Fluoride, amalgam, and microplastics: What modern dental clinics often overlook',
    discountCode: 'TDS-GUIDES',
    discountPercent: 0,
    description: 'Dr. Marc\'s clinical exposé on toxic ingredients in modern dental products and safe holistic swaps.',
    file: 'ebook_50_4.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Biological Wisdom Series (4 of 5)',
      title: 'Biocompatible Dentistry vs Modern Myths',
      heroText: 'Many products marketed as "dental essentials" actually contain industrial byproducts and neurotoxins that place a chronic burden on your liver and microbiome.',
      clinicalSectionTitle: 'Three Common Myths Debunked:',
      clinicalPoints: [
        { bold: 'Myth 1: You Need Synthetic Fluoride', text: 'Nano-hydroxyapatite provides identical remineralization with zero neurological or thyroid toxicity.' },
        { bold: 'Myth 2: Bleaching Gels Are Harmless', text: 'Peroxides strip the protective protein pellicle, creating microscopic pits in enamel.' },
        { bold: 'Myth 3: Foaming Pastes Clean Better', text: 'Sodium Lauryl Sulfate (SLS) is an industrial surfactant proven to trigger recurring canker sores.' }
      ],
      ctaText: 'Access The Biocompatible Guide &rarr;',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_5',
    campaignId: 'ebook_50',
    campaignName: 'Holistic Dental Wellness Guides',
    stage: 5,
    stageLabel: 'Stage 5: Complete Library',
    name: 'Complete Clinical Guide & Lifetime Reference Library',
    subject: 'Complete download access: Dr. Marc\'s Biological Dental Care Library',
    discountCode: 'TDS-GUIDES',
    discountPercent: 0,
    description: 'Full overview of Dr. Marc\'s holistic dental library, guides, and practical home care protocols.',
    file: 'ebook_50_5.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Biological Wisdom Series (5 of 5)',
      title: 'The Complete Biological Dental Library',
      heroText: 'Take control of your oral health with evidence-based biological dental wisdom. Instant digital access delivers complete clinical protocols directly to your device.',
      clinicalSectionTitle: 'Instant Digital Access:',
      clinicalPoints: [
        { bold: 'Immediate Smartphone & Tablet Access', text: 'Read on any device with searchable PDF format.' },
        { bold: 'Actionable Clinical Protocols', text: 'Step-by-step nutrition, remineralization, and non-toxic home care routines.' },
        { bold: 'Lifetime Reference Material', text: 'Actionable protocols you and your family can return to for years.' }
      ],
      ctaText: 'Explore The Complete Dental Shaman Library &rarr;',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  }
];

// Populate htmlContent and write clean files to disk
for (const tpl of ALL_TEMPLATES) {
  const filePath = path.join(TEMPLATES_DIR, tpl.file);
  const html = buildEmailHtml(tpl.htmlData);
  tpl.htmlContent = html;
  fs.writeFileSync(filePath, html, 'utf8');
}

console.log(`[Generate] Successfully generated and wrote ${ALL_TEMPLATES.length} clean, 100% zero-discount clinical templates!`);

module.exports = {
  ALL_TEMPLATES
};
