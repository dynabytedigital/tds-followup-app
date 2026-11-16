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
  defaultDiscountNote,
  ctaText,
  ctaUrl,
  signoffNote
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

    <!-- DYNAMIC DISCOUNT / ADVICE BLOCK -->
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

// 20 TEMPLATES DEFINITIONS
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
    discountCode: 'FLOSSERCARE',
    discountPercent: 10,
    description: 'Post-purchase onboarding on pressure modes, warm water use, and 45° sulcus angle positioning.',
    file: 'water_flosser_1.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (1 of 5)',
      title: 'Optimal Sonic Flosser Setup & Adaptation',
      heroText: 'I wanted to personally check in and guide your first week with the Ozone Sonic Water Flosser. Biological dentistry is built on working with your oral biology rather than tearing fragile tissue with aggressive manual thread.',
      clinicalSectionTitle: 'Dr. Marc\'s 3-Step Start Protocol:',
      clinicalPoints: [
        { bold: 'Begin on Soft Mode', text: 'Allow your gingival capillaries 7 days to adapt to pulsed hydro-oxygenation before escalating pressure.' },
        { bold: 'Use Lukewarm Filtered Water', text: 'Cold water shocks dentinal tubules; warm water relaxes periodontal tissues.' },
        { bold: 'Trace the 45-Degree Sulcus', text: 'Keep the tip angled along the gum line for 60 seconds nightly before sleep.' }
      ],
      ctaText: 'Explore Water Flosser Care & Guides',
      ctaUrl: '{{shop_url}}/products/sonic-water-flosser'
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
    discountCode: 'FLOSSERCARE',
    discountPercent: 10,
    description: 'Clinical rationale of pulsed micro-bubbles disrupting anaerobic subgingival biofilm.',
    file: 'water_flosser_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (2 of 5)',
      title: 'The Science of Subgingival Biofilm Disruption',
      heroText: 'Now that your gums have completed the initial adaptation, let us calibrate your pressure settings. Periodontal pockets shelter anaerobic pathogens that thrive in low-oxygen environments. Water pulsating at 1,400 pulses per minute carries dissolved oxygen deep beneath the margin.',
      clinicalSectionTitle: 'Calibrating Your Pressure:',
      clinicalPoints: [
        { bold: 'Normal Mode (90 PSI)', text: 'Ideal for dislodging tenacious interdental plaque without lacerating fragile papilla.' },
        { bold: 'Pulse Mode for Micro-Circulation', text: 'Alternating pressure massages gingival margins, drawing fresh blood flow and nutrients.' },
        { bold: 'Zero Force Required', text: 'Let the hydro-kinetic stream do the work; never press the plastic nozzle hard against the tooth.' }
      ],
      ctaText: 'View Clinical Routine Video',
      ctaUrl: '{{shop_url}}/pages/water-flosser-guide'
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
    discountCode: 'FLOSSERCARE',
    discountPercent: 10,
    description: 'Guide to infusing the reservoir with organic rinses and biological saline solutions.',
    file: 'water_flosser_3.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (3 of 5)',
      title: 'Antimicrobial Reservoir Infusions',
      heroText: 'Water alone delivers exceptional physical cleansing, but infusing your water flosser reservoir transforms it into an active biological defense station.',
      clinicalSectionTitle: 'Recommended Reservoir Infusions:',
      clinicalPoints: [
        { bold: 'Organic Herbal Mouth Rinse', text: 'Add 1 capful of The Dental Shaman Botanical Concentrate to warm water for botanical astringency.' },
        { bold: 'Celtic Sea Salt Pinch', text: 'Creates an isotonic mineral wash that reduces tissue edema and accelerates healing.' },
        { bold: 'Always Flush Clean Water', text: 'Run 10 seconds of plain water after finishing to preserve the internal pump.' }
      ],
      ctaText: 'Browse Organic Herbal Rinses',
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
    subject: 'Time to refresh your flosser tips, {{first_name}}? Clinical restock notice',
    discountCode: 'RESTOCK10',
    discountPercent: 10,
    description: 'Preventing bacterial colonization on nozzles and mineral scaling inside the pump.',
    file: 'water_flosser_4.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Clinical Care Series (4 of 5)',
      title: 'Nozzle Hygiene & Tip Replacement',
      heroText: 'Just like manual toothbrush bristles degrade, water flosser nozzle orifices wear under continuous 90 PSI pressure. Micro-grooves harbor bacterial biofilm after 60 to 90 days of consistent usage.',
      clinicalSectionTitle: 'Hygiene Maintenance Checklist:',
      clinicalPoints: [
        { bold: 'Replace Tips Every 60-90 Days', text: 'Ensures a focused, cohesive water jet stream and prevents bacterial retrograde.' },
        { bold: 'Monthly Vinegar Descaling', text: 'Run 1 part white vinegar to 2 parts warm water to clear tap water calcium deposits.' },
        { bold: 'Air Dry Reservoir Open', text: 'Never leave stagnant water sitting sealed in the chamber overnight.' }
      ],
      ctaText: 'Replenish Flosser Tips & Rinses',
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
    discountCode: 'MASTERY10',
    discountPercent: 10,
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
        { bold: 'VIP Privilege Extended', text: 'We have reserved an ongoing 10% courtesy benefit for all clinical replenishment on your account.' }
      ],
      ctaText: 'Visit The Dental Shaman Store',
      ctaUrl: '{{shop_url}}'
    }
  },

  // ==========================================
  // CAMPAIGN 2: BOGOF COPPER CUP SPECIAL (5 STAGES)
  // ==========================================
  {
    id: 'bogof_cup_1',
    campaignId: 'bogof_cup',
    campaignName: 'BOGOF Copper Cup Special',
    stage: 1,
    stageLabel: 'Stage 1: The Copper Ritual',
    name: 'The Sacred Biological Copper Water Ritual',
    subject: 'The Oligodynamic Effect: Why drinking from pure copper transforms morning oral wellness',
    discountCode: 'BOGOFCUP',
    discountPercent: 10,
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
    campaignName: 'BOGOF Copper Cup Special',
    stage: 2,
    stageLabel: 'Stage 2: BOGOF Announcement',
    name: 'Buy 1 Handcrafted Copper Cup, Get 1 Free',
    subject: 'Special Clinical Courtesy: Buy 1 Handcrafted Copper Cup, Receive 1 Free, {{first_name}}',
    discountCode: 'BOGOFCUP',
    discountPercent: 10,
    description: 'Exclusive BOGOF promotion invitation for patients and clients.',
    file: 'bogof_cup_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (2 of 5)',
      title: 'Buy One Get One Free Clinical Invitation',
      heroText: 'To help you establish this biological habit both at home and at the office (or share the gift of biological wellness with a loved one), Dr. Marc has opened an exclusive <strong>Buy One Get One Free</strong> allocation on our artisan-beaten 100% pure copper cups.',
      clinicalSectionTitle: 'Your BOGOF Copper Benefit:',
      clinicalPoints: [
        { bold: '100% Pure Virgin Copper', text: 'Heavy gauge, unlined, and free from synthetic nickel or tin coatings.' },
        { bold: 'One for Nightstand, One for Desk', text: 'Keep charged water by your bedside and at your workspace.' },
        { bold: 'Automatic Checkout Application', text: 'Clicking below applies your BOGOF entitlement instantly at checkout.' }
      ],
      ctaText: 'Claim Your BOGOF Copper Cup &rarr;',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },
  {
    id: 'bogof_cup_3',
    campaignId: 'bogof_cup',
    campaignName: 'BOGOF Copper Cup Special',
    stage: 3,
    stageLabel: 'Stage 3: Morning Detox Protocol',
    name: 'Dr. Marc\'s 3-Step Morning Oral Detox Routine',
    subject: 'Dr. Marc\'s 3-Step Morning Oral Ritual using pure copper, {{first_name}}',
    discountCode: 'BOGOFCUP',
    discountPercent: 10,
    description: 'Detailed protocol combining tongue scraping, copper water sipping, and biological oil swishing.',
    file: 'bogof_cup_3.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (3 of 5)',
      title: 'Dr. Marc\'s Morning Detox Protocol',
      heroText: 'What you do in the first 10 minutes after waking sets your oral pH and digestive immunity for the entire day. Here is the exact morning routine Dr. Marc prescribes to biological dentistry patients.',
      clinicalSectionTitle: 'The 3-Step Morning Sequence:',
      clinicalPoints: [
        { bold: 'Step 1: Scrape the Tongue', text: 'Clear accumulated nocturnal endotoxins from the dorsal tongue before swallowing.' },
        { bold: 'Step 2: Sip 200ml Copper Water', text: 'Drink copper-charged water on an empty stomach to stimulate peristalsis and alkalize the stomach.' },
        { bold: 'Step 3: Gentle Botanical Swish', text: 'Swish with warm water and botanical rinse for 30 seconds to oxygenate the gums.' }
      ],
      ctaText: 'Pair with BOGOF Copper Cup',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },
  {
    id: 'bogof_cup_4',
    campaignId: 'bogof_cup',
    campaignName: 'BOGOF Copper Cup Special',
    stage: 4,
    stageLabel: 'Stage 4: Care & Maintenance',
    name: 'Pure Copper Maintenance & Natural Patina Care',
    subject: 'How to keep your pure copper gleaming naturally (lemon & salt guide)',
    discountCode: 'BOGOFCUP',
    discountPercent: 10,
    description: 'Natural cleaning instructions without harsh chemicals; understanding copper oxidation.',
    file: 'bogof_cup_4.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (4 of 5)',
      title: 'Natural Pure Copper Care Guide',
      heroText: 'Because our cups are 100% pure copper with no chemical lacquer, they will naturally develop dark patina markings when reacting with air and water. This is living proof that your cup is authentic, pure copper.',
      clinicalSectionTitle: 'The 60-Second Natural Cleanse:',
      clinicalPoints: [
        { bold: 'Lemon & Salt Rub', text: 'Sprinkle salt on half a fresh lemon and gently rub the cup exterior for 30 seconds.' },
        { bold: 'Rinse with Warm Water', text: 'Wash thoroughly and wipe dry with a soft microfiber cloth.' },
        { bold: 'Never Use Dishwashers', text: 'Dishwasher heat and harsh detergents strip the natural copper surface.' }
      ],
      ctaText: 'Secure Your BOGOF Copper Cup',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },
  {
    id: 'bogof_cup_5',
    campaignId: 'bogof_cup',
    campaignName: 'BOGOF Copper Cup Special',
    stage: 5,
    stageLabel: 'Stage 5: Final Call on Allocation',
    name: 'Final 24 Hours: Reserved BOGOF Copper Cup Benefit',
    subject: 'Final 24 Hours: Reserved Buy 1 Get 1 Free Copper Cup courtesy allocation for {{first_name}}',
    discountCode: 'BOGOFCUP',
    discountPercent: 10,
    description: 'Closing notice on the reserved BOGOF copper cup stock allocation.',
    file: 'bogof_cup_5.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Copper Ritual Series (5 of 5)',
      title: 'Final Call: BOGOF Copper Cup Allocation',
      heroText: 'Our handcrafted copper cups are beaten in small artisan batches in India. We have held a reserved Buy One Get One Free pairing under your customer profile, but unclaimed allocations must be released back to the general clinic catalog tonight.',
      clinicalSectionTitle: 'Closing Opportunity Summary:',
      clinicalPoints: [
        { bold: 'Buy 1 Get 1 Free Privilege', text: 'Two heirloom copper cups for the price of one.' },
        { bold: 'Zero Code Entry Needed', text: 'Clicking below applies your discount coupon directly on checkout.' },
        { bold: 'Pure Holistic Quality', text: '100% food-grade certified virgin antimicrobial copper.' }
      ],
      ctaText: 'Claim Your BOGOF Set Now &rarr;',
      ctaUrl: '{{shop_url}}/products/copper-cup'
    }
  },

  // ==========================================
  // CAMPAIGN 3: BOGOF HERBAL SPRAY OFFER (5 STAGES)
  // ==========================================
  {
    id: 'bogof_spray_1',
    campaignId: 'bogof_spray',
    campaignName: 'BOGOF Herbal Spray Offer',
    stage: 1,
    stageLabel: 'Stage 1: Microbiome Shield',
    name: 'The Oral Microbiome Shield vs Harsh Alcohol Washes',
    subject: 'Why conventional alcohol mouthwash damages your heart and oral barrier',
    discountCode: 'BOGOFSPRAY',
    discountPercent: 10,
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
    campaignName: 'BOGOF Herbal Spray Offer',
    stage: 2,
    stageLabel: 'Stage 2: BOGOF Invitation',
    name: 'Buy 1 Organic Herbal Spray, Get Free Copper Cup or Bonus Spray',
    subject: 'Exclusive Courtesy: Buy 1 Botanical Oral Spray, Get a Bonus Spray or Cup Free',
    discountCode: 'BOGOFSPRAY',
    discountPercent: 10,
    description: 'BOGOF promotional package allowing customer to get a free second spray or copper companion.',
    file: 'bogof_spray_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (2 of 5)',
      title: 'Buy One Get One Free Clinical Invitation',
      heroText: 'We want every client to have clean biological oral defense within arm\'s reach at all times. For a limited window, when you order Dr. Marc\'s Botanical Oral Spray, you receive a complimentary second bottle or holistic copper cup free.',
      clinicalSectionTitle: 'What Makes This Formula Unique:',
      clinicalPoints: [
        { bold: 'Wildcrafted Myrrh & Clove', text: 'Centuries of clinical evidence soothing inflamed pocket tissue.' },
        { bold: 'Colloidal Silver Infusion', text: 'Sub-micron silver particles provide natural barrier protection against acidic plaque.' },
        { bold: 'Pure English Peppermint', text: 'Clean, crisp breath without artificial sweeteners or synthetic dyes.' }
      ],
      ctaText: 'Claim Your BOGOF Botanical Spray &rarr;',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },
  {
    id: 'bogof_spray_3',
    campaignId: 'bogof_spray',
    campaignName: 'BOGOF Herbal Spray Offer',
    stage: 3,
    stageLabel: 'Stage 3: Post-Meal Defense',
    name: 'The 2-Minute Midday Post-Meal Enamel Defense Protocol',
    subject: 'The 2-Minute Post-Meal Protocol to stop enamel demineralization on the go',
    discountCode: 'BOGOFSPRAY',
    discountPercent: 10,
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
      ctaText: 'Order BOGOF Spray Package',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },
  {
    id: 'bogof_spray_4',
    campaignId: 'bogof_spray',
    campaignName: 'BOGOF Herbal Spray Offer',
    stage: 4,
    stageLabel: 'Stage 4: Ingredient Deep Dive',
    name: 'Inside The Bottle: Clinical Anatomy of Organic Myrrh & Silver',
    subject: 'Inside the bottle: Why we chose organic myrrh and colloidal silver',
    discountCode: 'BOGOFSPRAY',
    discountPercent: 10,
    description: 'Ingredient breakdown for conscious patients wanting full biological transparency.',
    file: 'bogof_spray_4.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (4 of 5)',
      title: 'The Clinical Anatomy of Our Formula',
      heroText: 'Transparency is the cornerstone of biological dentistry. Here is exactly why each active botanical compound was selected for The Dental Shaman Oral Spray formula.',
      clinicalSectionTitle: 'Clinical Breakdown of Active Actives:',
      clinicalPoints: [
        { bold: 'Commiphora Myrrha Resin', text: 'Potent natural astringent that tightens loose gingival margins and soothes aphthous ulcers.' },
        { bold: 'Syzygium Aromaticum (Clove)', text: 'Contains natural eugenol to alleviate sensitivity and calm nerve endings.' },
        { bold: 'Colloidal Silver (10 PPM)', text: 'Non-toxic elemental silver suspended in deionized water for targeted microbial defense.' }
      ],
      ctaText: 'View Complete Formula & BOGOF',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },
  {
    id: 'bogof_spray_5',
    campaignId: 'bogof_spray',
    campaignName: 'BOGOF Herbal Spray Offer',
    stage: 5,
    stageLabel: 'Stage 5: Final Call on Benefit',
    name: 'Final Courtesy Window: Your BOGOF Botanical Spray Benefit',
    subject: 'Courtesy window ending: Your Buy 1 Get 1 Free Botanical Spray benefit, {{first_name}}',
    discountCode: 'BOGOFSPRAY',
    discountPercent: 10,
    description: 'Last notification on the Buy 1 Get 1 Free spray package.',
    file: 'bogof_spray_5.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Botanical Spray Series (5 of 5)',
      title: 'Final Call on BOGOF Botanical Spray',
      heroText: 'This is the final notification before we close our Buy One Get One Free courtesy allocation on The Dental Shaman Botanical Oral Spray. Keep one bottle in your car or handbag and one in your bathroom.',
      clinicalSectionTitle: 'Package Privileges:',
      clinicalPoints: [
        { bold: 'Two Bottles for the Price of One', text: 'Stock up for 4–6 months of portable biological defense.' },
        { bold: '100% Certified Organic & Vegan', text: 'Free from SLS, artificial colors, saccharin, and parabens.' },
        { bold: 'Instant Auto-Applied Coupon', text: 'Applied smoothly during checkout without changing website catalog prices.' }
      ],
      ctaText: 'Claim Your BOGOF Spray Before It Closes &rarr;',
      ctaUrl: '{{shop_url}}/products/organic-oral-spray'
    }
  },

  // ==========================================
  // CAMPAIGN 4: ALL E-BOOKS 50% OFF (5 STAGES)
  // ==========================================
  {
    id: 'ebook_50_1',
    campaignId: 'ebook_50',
    campaignName: 'All E-Books 50% Off Campaign',
    stage: 1,
    stageLabel: 'Stage 1: Living Teeth Biology',
    name: 'The Root Cause of Oral Disease & Living Teeth Biology',
    subject: 'Why cavities and gum disease are symptoms of internal imbalance, {{first_name}}',
    discountCode: 'EBOOK50',
    discountPercent: 50,
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
      ctaText: 'Explore The Holistic E-Book Library',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_2',
    campaignId: 'ebook_50',
    campaignName: 'All E-Books 50% Off Campaign',
    stage: 2,
    stageLabel: 'Stage 2: 50% Courtesy Benefit',
    name: '50% Off The Complete Dental Shaman Biological E-Book Library',
    subject: 'Exclusive 50% Courtesy Benefit: All Biological Oral Health E-Books & Guides',
    discountCode: 'EBOOK50',
    discountPercent: 50,
    description: 'Announcement of 50% courtesy privilege on all digital clinical guides and protocols.',
    file: 'ebook_50_2.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Biological Wisdom Series (2 of 5)',
      title: '50% Courtesy On All Clinical Guides',
      heroText: 'To put the power of preventive biological medicine directly in your hands, Dr. Marc has released an exclusive <strong>50% Courtesy Discount</strong> on all digital e-books, protocols, and oral wellness guides.',
      clinicalSectionTitle: 'Included in the Digital Collection:',
      clinicalPoints: [
        { bold: 'Reversing Gum Recession Naturally', text: 'Clinical nutrition and hydro-therapy protocols to tighten periodontal attachments.' },
        { bold: 'The Enamel Remineralization Protocol', text: 'The exact ratio of fat-soluble vitamins and ionic trace minerals to harden tooth structure.' },
        { bold: 'The Toxic Dentistry Detox Guide', text: 'Safe practices surrounding mercury amalgam, root canals, and fluoride alternatives.' }
      ],
      ctaText: 'Claim 50% Off All E-Books &rarr;',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_3',
    campaignId: 'ebook_50',
    campaignName: 'All E-Books 50% Off Campaign',
    stage: 3,
    stageLabel: 'Stage 3: Chapter Excerpt',
    name: 'Exclusive Chapter Excerpt: Reversing Demineralization',
    subject: 'Excerpt from Chapter 2: The dentinal fluid flow that actively heals teeth',
    discountCode: 'EBOOK50',
    discountPercent: 50,
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
        { bold: 'Download the Full Guide', text: 'Includes complete daily nutritional tables and meal timing strategies.' }
      ],
      ctaText: 'Download The Full E-Book (50% Off)',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_4',
    campaignId: 'ebook_50',
    campaignName: 'All E-Books 50% Off Campaign',
    stage: 4,
    stageLabel: 'Stage 4: Toxic Dentistry Myths',
    name: 'Toxic Dentistry Myths & Safe Biocompatible Protocols',
    subject: 'Fluoride, amalgam, and microplastics: What modern dental clinics often overlook',
    discountCode: 'EBOOK50',
    discountPercent: 50,
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
      ctaText: 'Access The Biocompatible E-Book Guide',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  },
  {
    id: 'ebook_50_5',
    campaignId: 'ebook_50',
    campaignName: 'All E-Books 50% Off Campaign',
    stage: 5,
    stageLabel: 'Stage 5: Final Hours',
    name: 'Final Call: Instant Download Access to 50% Off Holistic E-Books',
    subject: 'Final call for 50% Off Dr. Marc\'s Complete Holistic Dental E-Books',
    discountCode: 'EBOOK50',
    discountPercent: 50,
    description: 'Last notification before the 50% courtesy promotion window closes.',
    file: 'ebook_50_5.html',
    htmlData: {
      badgeText: 'The Dental Shaman · Biological Wisdom Series (5 of 5)',
      title: 'Final Call: 50% Courtesy Benefit Closing',
      heroText: 'This is the final courtesy reminder before the 50% discount allocation on The Dental Shaman complete digital library expires. Immediate PDF digital download delivered to your inbox upon checkout.',
      clinicalSectionTitle: 'Instant Digital Access:',
      clinicalPoints: [
        { bold: 'Immediate Smartphone & Tablet Access', text: 'Read on any device with searchable PDF format.' },
        { bold: '50% Courtesy Applied Automatically', text: 'Clicking below applies code EBOOK50 directly at checkout.' },
        { bold: 'Lifetime Reference Material', text: 'Actionable protocols you and your family can return to for years.' }
      ],
      ctaText: 'Download Complete E-Book Collection (50% Off) &rarr;',
      ctaUrl: '{{shop_url}}/collections/all'
    }
  }
];

// Populate htmlContent and ensure files exist on disk
for (const tpl of ALL_TEMPLATES) {
  const filePath = path.join(TEMPLATES_DIR, tpl.file);
  if (!fs.existsSync(filePath)) {
    const defaultHtml = buildEmailHtml(tpl.htmlData);
    fs.writeFileSync(filePath, defaultHtml, 'utf8');
    tpl.htmlContent = defaultHtml;
  } else {
    tpl.htmlContent = fs.readFileSync(filePath, 'utf8');
  }
  delete tpl.htmlData; // clean up data
}

module.exports = { ALL_TEMPLATES };
