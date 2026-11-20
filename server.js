require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('./database');
const cloudSync = require('./cloudSync');
cloudSync.pullFromGitHub().catch(e => console.warn('[CloudSync] Initial pull error:', e.message));
const shopifyClient = require('./shopifyClient');
const emailService = require('./emailService');
const trackingEngine = require('./trackingEngine');

const app = express();
const PORT = process.env.PORT || 3070;

// Security & iframe headers for Shopify Admin Embedding
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com 'self';"
  );
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Root route
app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check for Render (wakes up instance & checks scheduled queue)
app.get('/healthz', async (req, res) => {
  if (typeof processDueScheduledDispatches === 'function') {
    processDueScheduledDispatches().catch(() => {});
  }
  res.json({
    status: 'ok',
    service: 'dental-shaman-followup-app',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime())
  });
});

// Shopify OAuth Callback
app.get(['/auth/callback', '/api/auth/callback'], (req, res) => {
  const shop = req.query.shop || 'shop.thedentalshaman.com';
  const host = req.query.host || '';
  res.redirect(`/?shop=${shop}&host=${host}`);
});

/* ========================================================
   MASTER SECURITY GATE & OPERATOR AUTH
   ======================================================== */
const loginAttempts = new Map();

function isIpLocked(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() < record.lockedUntil) return true;
  if (Date.now() >= record.lockedUntil && record.lockedUntil > 0) {
    loginAttempts.delete(ip);
    return false;
  }
  return false;
}

function recordFailedAttempt(ip) {
  const record = loginAttempts.get(ip) || { attempts: 0, lockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lock
    console.warn(`[Security] 5 failed attempts from ${ip}. Locked for 15m.`);
  }
  loginAttempts.set(ip, record);
}

function clearFailedAttempts(ip) {
  loginAttempts.delete(ip);
}

// Master Key Verification & Session Creation
app.post('/api/auth/access', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  if (isIpLocked(clientIp)) {
    const record = loginAttempts.get(clientIp);
    const remainingMins = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      success: false,
      error: `Security lockout: Too many failed attempts. Try again in ${remainingMins} minute(s).`
    });
  }

  const { accessKey } = req.body || {};
  if (!accessKey) {
    return res.status(401).json({ success: false, error: 'Master access key is required.' });
  }

  if (!db.verifyMasterAccessCode(accessKey)) {
    recordFailedAttempt(clientIp);
    console.warn(`[Security] Unauthorized access attempt from ${clientIp}`);
    const remaining = Math.max(0, 5 - ((loginAttempts.get(clientIp) || {}).attempts || 0));
    return res.status(401).json({
      success: false,
      error: remaining > 0
        ? `Invalid master operator key. (${remaining} attempts remaining before temporary lockout)`
        : 'Invalid master operator key. Security lockout activated for 15 minutes.'
    });
  }

  clearFailedAttempts(clientIp);
  const token = db.createSession('Authorized Operator');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  console.log(`[Security] Master access granted successfully to ${clientIp} (30-day session)`);
  res.json({ success: true, token, expiresInDays: 30, expiresAt });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)tds_operator_key=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }
  if (db.validateSession(token)) {
    return res.json({ success: true, validForDays: 30 });
  }
  return res.status(401).json({ success: false, error: 'Invalid or expired session.' });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (token) db.deleteSession(token);
  res.json({ success: true });
});

// Protect all /api endpoints except /api/auth, /healthz, and /t/c/
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path.startsWith('/cron/')) return next();

  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)tds_operator_key=([^;]+)/);
    if (match) token = decodeURIComponent(match[1]);
  }

  if (!db.validateSession(token)) {
    return res.status(401).json({ error: 'Unauthorized: Master Access Key required.' });
  }
  next();
});

/* ========================================================
   CLICK & REDIRECT ATTRIBUTION GATEWAY (PUBLIC)
   ======================================================== */
app.get('/t/c/:dispatchId', (req, res) => {
  try {
    const dispatchId = req.params.dispatchId;
    const destinationUrl = trackingEngine.handleClick(dispatchId, req.query, req);
    res.redirect(302, destinationUrl);
  } catch (err) {
    console.error('[Tracking] Redirect error:', err.message);
    res.redirect(302, 'https://shop.thedentalshaman.com');
  }
});

/* ========================================================
   CUSTOMERS DIRECTORY API
   ======================================================== */
app.get('/api/customers', (req, res) => {
  const customers = db.getCustomers();
  const stats = db.getStats();
  res.json({
    success: true,
    stats,
    total: customers.length,
    customers
  });
});

app.post('/api/customers/sync', async (req, res) => {
  try {
    const list = await shopifyClient.fetchAllCustomers();
    const updated = db.setCustomers(list);
    res.json({
      success: true,
      count: updated.length,
      stats: db.getStats()
    });
  } catch (err) {
    console.error('[API] Customer sync error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const customer = db.getCustomers().find(c => String(c.id) === String(req.params.id));
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    const orders = await shopifyClient.getCustomerOrders(customer.id);
    const dispatches = db.getDispatches().filter(d => String(d.customerId) === String(customer.id) || d.customerEmail === customer.email);
    res.json({
      success: true,
      customer,
      orders,
      dispatches
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================
   CAMPAIGNS & TEMPLATES STUDIO API (FULL DYNAMIC CRUD)
   ======================================================== */
app.get('/api/campaigns', (req, res) => {
  res.json({
    success: true,
    campaigns: db.getCampaigns()
  });
});

app.post('/api/campaigns', (req, res) => {
  try {
    const { name, shortName, color, iconSvg } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Campaign name is required.' });
    }
    const camp = db.createCampaign({ name, shortName, color, iconSvg });
    res.json({ success: true, campaign: camp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/campaigns/:id', (req, res) => {
  try {
    const updated = db.updateCampaign(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Campaign not found.' });
    res.json({ success: true, campaign: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/campaigns/:id', (req, res) => {
  try {
    const ok = db.deleteCampaign(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Campaign not found.' });
    res.json({ success: true, message: 'Campaign and associated stages deleted permanently.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/templates', (req, res) => {
  res.json({
    success: true,
    templates: db.getTemplates(req.query.campaignId)
  });
});

app.post('/api/templates', (req, res) => {
  try {
    const { campaignId, stage, stageLabel, name, description, subject, discountCode, discountPercent, htmlContent } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Preset name is required.' });
    }
    const tpl = db.createTemplate({
      campaignId,
      stage,
      stageLabel,
      name,
      description,
      subject,
      discountCode,
      discountPercent,
      htmlContent
    });
    res.json({ success: true, template: tpl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/templates/:id', (req, res) => {
  try {
    const ok = db.deleteTemplate(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Preset not found.' });
    res.json({ success: true, message: 'Preset deleted permanently.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/templates/:id/raw', (req, res) => {
  const tpl = db.getTemplateById(req.params.id);
  if (!tpl) return res.status(404).json({ error: 'Template not found.' });
  const html = tpl.htmlContent || emailService.getTemplateHtml(tpl.file);
  res.json({ success: true, template: tpl, html });
});

app.post('/api/templates/:id/save', (req, res) => {
  try {
    const { name, subject, discountCode, discountPercent, description, htmlContent, stageLabel, stage } = req.body;
    const updated = db.saveTemplate(req.params.id, {
      name,
      subject,
      discountCode,
      discountPercent: discountPercent !== undefined ? Number(discountPercent) : undefined,
      description,
      htmlContent,
      stageLabel,
      stage: stage !== undefined ? Number(stage) : undefined
    });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Template not found.' });
    }
    console.log(`[Templates] Successfully saved customizations for template: ${req.params.id}`);
    res.json({
      success: true,
      message: 'Template and HTML code saved permanently to database and disk.',
      template: updated
    });
  } catch (err) {
    console.error('[Templates] Error saving template:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/templates/:id/preview', (req, res) => {
  const { customer, customSubject, customDiscountCode, customBody } = req.body;
  const rendered = emailService.renderTemplate(
    req.params.id,
    customer || {},
    customSubject,
    customDiscountCode,
    customBody
  );
  res.json({ success: true, rendered });
});

/* ========================================================
   AUTOMATION RULES API
   ======================================================== */
app.get('/api/rules', (req, res) => {
  res.json({ success: true, rules: db.getRules() });
});

app.post('/api/rules', (req, res) => {
  try {
    const rule = db.saveRule(req.body);
    res.json({ success: true, rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/rules/:id', (req, res) => {
  try {
    const ok = db.deleteRule(req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Rule not found.' });
    res.json({ success: true, message: 'Rule deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/rules/:id/run', async (req, res) => {
  try {
    const rule = db.getRuleById(req.params.id);
    if (!rule) return res.status(404).json({ success: false, error: 'Rule not found.' });

    const allCustomers = db.getCustomers();
    let matching = [];

    if (rule.triggerType === 'spend_min') {
      const min = parseFloat(rule.triggerValue) || 0;
      matching = allCustomers.filter(c => parseFloat(c.total_spent || 0) >= min);
    } else if (rule.triggerType === 'orders_min') {
      const minOrders = parseInt(rule.triggerValue) || 1;
      matching = allCustomers.filter(c => parseInt(c.orders_count || 0) >= minOrders);
    } else if (rule.triggerType === 'never_followed_up') {
      matching = allCustomers.filter(c => !c.lastFollowUpAt);
    } else {
      matching = allCustomers;
    }

    // Filter to customers with valid email
    matching = matching.filter(c => c.email && c.email.includes('@'));

    // Find template for rule
    const templates = db.getTemplates(rule.campaignId).sort((a, b) => (a.stage || 1) - (b.stage || 1));
    const targetTpl = templates.find(t => (t.stage || 1) === (rule.stage || 1)) || templates[0];

    let sent = 0;
    let failed = 0;

    for (const cust of matching) {
      try {
        await emailService.sendFollowUpEmail({
          to: cust.email,
          customer: cust,
          templateId: targetTpl ? targetTpl.id : 'water_flosser_1',
          mode: 'automated_rule'
        });
        sent++;
      } catch (e) {
        failed++;
      }
      // Small pause between emails
      await new Promise(r => setTimeout(r, 60));
    }

    db.saveRule({
      id: rule.id,
      lastRunAt: new Date().toISOString(),
      enrolledCount: (rule.enrolledCount || 0) + sent
    });

    res.json({
      success: true,
      message: `Rule "${rule.name}" executed: ${sent} emails dispatched, ${failed} failed.`,
      matched: matching.length,
      sent,
      failed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ========================================================
   FOLLOW-UP EMAIL DISPATCHER API
   ======================================================== */
app.post('/api/followup/send', async (req, res) => {
  try {
    const {
      customerId,
      customerEmail,
      recipientName,
      recipientFirstName,
      templateId,
      customSubject,
      customDiscountCode,
      customBody
    } = req.body;

    if (!customerEmail) {
      return res.status(400).json({ error: 'Customer email address is required.' });
    }

    const email = customerEmail.trim().toLowerCase();
    const allCustomers = db.getCustomers();
    let customer = customerId ? allCustomers.find(c => String(c.id) === String(customerId)) : null;
    if (!customer) {
      customer = allCustomers.find(c => (c.email || '').toLowerCase() === email) || {
        id: customerId || ('custom_' + Date.now()),
        email: email,
        name: recipientName || email,
        first_name: recipientFirstName || (recipientName ? recipientName.split(' ')[0] : email.split('@')[0]),
        orders_count: 0,
        total_spent: '0.00'
      };
    }

    const result = await emailService.sendFollowUpEmail({
      to: customerEmail,
      customer,
      templateId: templateId || 'water_flosser_1',
      customSubject,
      customDiscountCode,
      customBody,
      mode: 'manual'
    });

    res.json({
      success: true,
      message: `Personalized follow-up delivered to ${customerEmail}!`,
      dispatchId: result.dispatchId,
      messageId: result.messageId,
      usedProtocol: result.usedProtocol
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/followup/batch-send', async (req, res) => {
  try {
    const {
      customerIds,
      recipients,
      templateId,
      campaignId: explicitCampaignId,
      campaignName: explicitCampaignName,
      customSubject,
      customDiscountCode,
      customBody,
      scheduleFullSequence = true,
      sessionId: customSessionId,
      sessionName: customSessionName,
      stageSchedules = {}
    } = req.body;

    const allCustomers = db.getCustomers();
    let targetCustomers = [];

    if (Array.isArray(recipients) && recipients.length > 0) {
      targetCustomers = recipients.map(r => {
        if (typeof r === 'string') {
          const email = r.trim().toLowerCase();
          const found = allCustomers.find(c => (c.email || '').toLowerCase() === email);
          if (found) return found;
          return {
            id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            email: email,
            first_name: email.split('@')[0],
            name: email,
            orders_count: 0,
            total_spent: '0.00'
          };
        }
        if (r.id) {
          const found = allCustomers.find(c => String(c.id) === String(r.id));
          if (found) return found;
        }
        const email = (r.email || '').trim().toLowerCase();
        return {
          id: r.id || ('custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
          email: email,
          first_name: r.first_name || (r.name ? r.name.split(' ')[0] : (email ? email.split('@')[0] : 'Valued')),
          name: r.name || email || 'Valued Customer',
          orders_count: r.orders_count || 0,
          total_spent: r.total_spent || '0.00'
        };
      }).filter(c => c.email && c.email.includes('@'));
    } else if (Array.isArray(customerIds) && customerIds.length > 0) {
      targetCustomers = customerIds
        .map(id => allCustomers.find(c => String(c.id) === String(id)))
        .filter(Boolean);
    }

    if (targetCustomers.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one valid recipient must be provided.' });
    }

    // Determine Campaign & Template Details
    const allTemplates = db.getTemplates();
    const activeTpl = allTemplates.find(t => t.id === templateId) || allTemplates[0] || {
      id: templateId || 'water_flosser_1',
      campaignId: explicitCampaignId || 'water_flosser',
      campaignName: explicitCampaignName || 'Water Flosser Routine & Care',
      stage: 1,
      stageLabel: 'Stage 1'
    };

    const campaignId = explicitCampaignId || activeTpl.campaignId || 'water_flosser';
    const campaignName = explicitCampaignName || activeTpl.campaignName || 'Follow-Up Campaign';
    const activeStageNum = Number(activeTpl.stage) || 1;

    // Create Activity Session ("Season")
    const sessionId = customSessionId || ('ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
    const sessionName = customSessionName || `${campaignName} • ${targetCustomers.length} Recipient${targetCustomers.length > 1 ? 's' : ''}`;

    const session = db.createActivitySession({
      id: sessionId,
      name: sessionName,
      campaignId: campaignId,
      campaignName: campaignName,
      recipients: targetCustomers.map(c => ({
        id: c.id,
        email: c.email,
        name: c.name || c.first_name || c.email
      })),
      stagesConfigured: scheduleFullSequence ? 5 : 1,
      status: 'active'
    });

    const successes = [];
    const failures = [];
    let scheduledCount = 0;

    // Check if active stage is scheduled for later or immediate
    const activeSched = stageSchedules[activeStageNum] || stageSchedules[String(activeStageNum)];
    const isActiveScheduled = activeSched && activeSched.isInstant === false && activeSched.scheduledIso;

    for (const cust of targetCustomers) {
      const email = (cust.email || '').trim();
      if (!email || !email.includes('@')) {
        failures.push({
          customerId: cust.id,
          name: cust.name || 'Valued Customer',
          email,
          error: 'No valid email address'
        });
        continue;
      }

      if (isActiveScheduled) {
        // Scheduled active stage
        const scheduledDate = new Date(activeSched.scheduledIso);
        const disp = db.addDispatch({
          sessionId: session.id,
          campaignId: campaignId,
          campaignName: campaignName,
          stage: activeStageNum,
          stageLabel: activeTpl.stageLabel || `Stage ${activeStageNum}`,
          templateId: activeTpl.id,
          templateName: activeTpl.name,
          subject: customSubject || activeTpl.subject,
          htmlContent: customBody || activeTpl.html || null,
          customerEmail: email,
          customerName: cust.name || cust.first_name || email,
          customerFirstName: cust.first_name || (cust.name ? cust.name.split(' ')[0] : email.split('@')[0]),
          customerId: cust.id,
          discountCode: customDiscountCode || 'TDS-CARE',
          status: 'scheduled',
          scheduledFor: scheduledDate.toISOString(),
          sentAt: null,
          mode: 'campaign_stage_scheduled'
        });
        scheduledCount++;
      } else {
        // Immediate active stage dispatch
        try {
          const result = await emailService.sendFollowUpEmail({
            to: email,
            customer: cust,
            templateId: activeTpl.id,
            customSubject,
            customDiscountCode,
            customBody,
            mode: 'batch_manual',
            sessionId: session.id,
            stage: activeStageNum,
            stageLabel: activeTpl.stageLabel || `Stage ${activeStageNum}`
          });

          successes.push({
            customerId: cust.id,
            name: cust.name || 'Valued Customer',
            email,
            dispatchId: result.dispatchId
          });
        } catch (err) {
          failures.push({
            customerId: cust.id,
            name: cust.name || 'Valued Customer',
            email,
            error: err.message || 'Delivery error'
          });
        }
        await new Promise(r => setTimeout(r, 80));
      }
    }

    // Schedule Subsequent Stages (Stages 2-5+) if scheduleFullSequence is true
    if (scheduleFullSequence) {
      const remainingTemplates = allTemplates
        .filter(t => t.campaignId === campaignId && Number(t.stage) > activeStageNum)
        .sort((a, b) => Number(a.stage) - Number(b.stage));

      const defaultDelays = {
        2: 3,   // Day 3 (+3 days from now)
        3: 7,   // Day 7 (+7 days from now)
        4: 14,  // Day 14 (+14 days from now)
        5: 21   // Day 21 (+21 days from now)
      };

      const now = new Date();
      for (const tpl of remainingTemplates) {
        const stageNum = Number(tpl.stage);
        const stageSched = stageSchedules[stageNum] || stageSchedules[String(stageNum)];

        let scheduledDate;
        if (stageSched && stageSched.scheduledIso) {
          scheduledDate = new Date(stageSched.scheduledIso);
        } else {
          const delayDays = defaultDelays[stageNum] || ((stageNum - 1) * 7);
          scheduledDate = new Date(now.getTime() + delayDays * 86400000);
        }

        for (const cust of targetCustomers) {
          const email = (cust.email || '').trim();
          if (!email || !email.includes('@')) continue;

          db.addDispatch({
            sessionId: session.id,
            campaignId: campaignId,
            campaignName: campaignName,
            stage: stageNum,
            stageLabel: tpl.stageLabel || `Stage ${stageNum}`,
            templateId: tpl.id,
            templateName: tpl.name,
            subject: tpl.subject,
            htmlContent: tpl.html || null,
            customerEmail: email,
            customerName: cust.name || cust.first_name || email,
            customerFirstName: cust.first_name || (cust.name ? cust.name.split(' ')[0] : email.split('@')[0]),
            customerId: cust.id,
            discountCode: customDiscountCode || 'TDS-CARE',
            status: 'scheduled',
            scheduledFor: scheduledDate.toISOString(),
            sentAt: null,
            mode: 'campaign_sequence_scheduled'
          });
          scheduledCount++;
        }
      }
    }

    res.json({
      success: true,
      sessionId: session.id,
      session,
      total: targetCustomers.length,
      sentCount: successes.length,
      scheduledCount,
      failedCount: failures.length,
      message: `Activity session started: ${successes.length} dispatched immediately, ${scheduledCount} scheduled for future stages.`,
      successes,
      failures
    });
  } catch (err) {
    console.error('[BatchSend] Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/followup/test', async (req, res) => {
  try {
    const { testEmail, templateId, customSubject, customDiscountCode, customBody } = req.body;
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid test recipient email address.' });
    }

    const result = await emailService.sendTestPreview(
      testEmail,
      templateId || 'post_purchase_care',
      customSubject,
      customDiscountCode,
      customBody
    );

    res.json({
      success: true,
      message: `Test preview email successfully delivered to ${testEmail}!`,
      dispatchId: result.dispatchId,
      messageId: result.messageId,
      usedProtocol: result.usedProtocol
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ========================================================
   TRACKING, ATTRIBUTION PROOF & AUDIT REPORT API
   ======================================================== */
app.post('/api/tracking/sync-conversions', async (req, res) => {
  try {
    const auditResult = await trackingEngine.syncAndAuditConversions();
    res.json({
      success: true,
      message: 'Conversion attribution audit complete.',
      ...auditResult
    });
  } catch (err) {
    console.error('[API] Conversion sync error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/tracking/conversions', (req, res) => {
  const conversions = trackingEngine.filterConversions(req.query);
  const periodStats = trackingEngine.getPeriodStats(conversions);
  res.json({
    success: true,
    stats: db.getStats(),
    periodStats,
    conversions
  });
});

app.get('/api/tracking/dispatches', (req, res) => {
  let dispatches = db.getDispatches();
  if (req.query.campaignId && req.query.campaignId !== 'all') {
    dispatches = dispatches.filter(d => d.campaignId === req.query.campaignId);
  }
  res.json({
    success: true,
    dispatches,
    stats: db.getStats()
  });
});

// Downloadable Conversion Audit Report (CSV)
app.get('/api/tracking/report/csv', (req, res) => {
  try {
    const csvContent = trackingEngine.generateCsvReport(req.query);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `TheDentalShaman_FollowUp_Conversion_Report_${dateStr}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate CSV: ' + err.message });
  }
});

// Executive Minimalistic Printable / Downloadable Report (HTML & Print-Ready PDF)
app.get('/api/tracking/report/html', (req, res) => {
  try {
    const htmlReport = trackingEngine.generateExecutiveReportHtml(req.query);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(htmlReport);
  } catch (err) {
    res.status(500).send('Failed to generate report: ' + err.message);
  }
});

app.get('/api/stats', (req, res) => {
  res.json(db.getStats());
});

/* ========================================================
   DIAGNOSTIC & SETTINGS API
   ======================================================== */
app.get('/api/verify-resend', async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY || db.getSettings().resendApiKey;
  if (!apiKey) {
    return res.json({ status: 'NOT_CONFIGURED', error: 'No Resend API Key found.' });
  }

  try {
    const axios = require('axios');
    await axios.get('https://api.resend.com/api-keys', {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      timeout: 5000
    });
    res.json({ status: 'SUCCESS', message: 'Resend API authenticated.' });
  } catch (e) {
    if (e.response?.data?.message?.includes('only send emails')) {
      return res.json({ status: 'SUCCESS', message: 'Resend Sending API key authenticated and active.' });
    }
    res.json({ status: 'FAILED', error: e.response?.data?.message || e.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json({
    success: true,
    settings: db.getSettings()
  });
});

app.post('/api/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/verify-gmail', async (req, res) => {
  try {
    const transporter = emailService.getTransporter(req.body || {});
    await transporter.verify();
    res.json({ success: true, message: 'Google Workspace Gmail connection verified successfully!' });
  } catch (err) {
    const isTimeout = err.message && (err.message.includes('timeout') || err.message.includes('ETIMEDOUT'));
    res.json({
      success: false,
      error: err.message,
      isFirewallBlocked: isTimeout,
      message: isTimeout
        ? 'Notice: Outbound SMTP ports (465/587) are firewalled on this hosting tier. The system will automatically use the Resend HTTPS API gateway from shop@thedentalshaman.com for guaranteed delivery.'
        : err.message
    });
  }
});

/* ========================================================
   START FRESH SEQUENCES, AUTOMATED SCHEDULING & PRESETS
   ======================================================== */

// Robust Background Scheduler: checks every 30s and processes due UK scheduled emails
let isSchedulerRunning = false;
async function processDueScheduledDispatches() {
  if (isSchedulerRunning) return { skipped: true, reason: 'Already running' };
  isSchedulerRunning = true;
  try {
    const allDispatches = db.getDispatches();
    const now = new Date();
    const dueDispatches = allDispatches.filter(d => 
      d.status === 'scheduled' && 
      d.scheduledFor && 
      new Date(d.scheduledFor) <= now
    );

    if (dueDispatches.length === 0) return { processed: 0 };

    console.log(`[Scheduler] Found ${dueDispatches.length} due scheduled email(s) at UK reference ${now.toISOString()}. Executing...`);

    let sent = 0;
    let failed = 0;

    for (const d of dueDispatches) {
      console.log(`[Scheduler] Dispatching due email ${d.id} to ${d.customerEmail} (Stage ${d.stage || 1})...`);
      try {
        const allCustomers = db.getCustomers();
        let cust = d.customerId ? allCustomers.find(c => String(c.id) === String(d.customerId)) : null;
        if (!cust) {
          cust = {
            id: d.customerId || ('cust_' + Date.now()),
            email: d.customerEmail,
            first_name: d.customerFirstName || (d.customerName ? d.customerName.split(' ')[0] : d.customerEmail.split('@')[0]),
            name: d.customerName || d.customerEmail,
            orders_count: 0,
            total_spent: '0.00'
          };
        }

        await emailService.sendFollowUpEmail({
          to: d.customerEmail,
          customer: cust,
          templateId: d.templateId || 'water_flosser_1',
          customSubject: d.subject,
          customDiscountCode: d.discountCode || 'TDS-CARE',
          customBody: d.htmlContent || null,
          mode: 'scheduled_automated',
          sessionId: d.sessionId || null,
          stage: d.stage || 1,
          stageLabel: d.stageLabel || 'Scheduled Stage',
          existingDispatchId: d.id
        });

        db.updateDispatch(d.id, {
          status: 'sent',
          sentAt: new Date().toISOString(),
          error: null
        });
        console.log(`[Scheduler] Successfully sent scheduled dispatch ${d.id} to ${d.customerEmail}`);
        sent++;
      } catch (err) {
        console.error(`[Scheduler] Failed dispatch ${d.id} for ${d.customerEmail}:`, err.message);
        db.updateDispatch(d.id, {
          status: 'failed',
          error: err.message
        });
        failed++;
      }
      await new Promise(r => setTimeout(r, 100)); // Throttling
    }

    // Trigger cloud sync to immediately persist updated dispatch states
    try {
      const cloudSync = require('./cloudSync');
      cloudSync.schedulePush();
    } catch (e) {}

    return { processed: dueDispatches.length, sent, failed };
  } catch (e) {
    console.error('[Scheduler] Error in background execution loop:', e.message);
    return { error: e.message };
  } finally {
    isSchedulerRunning = false;
  }
}

// Check every 30 seconds
setInterval(processDueScheduledDispatches, 30000);

// Public Keepalive & Scheduled Queue Runner for Free Cron (cron-job.org / uptimerobot)
app.get('/api/cron/process-scheduled', async (req, res) => {
  const result = await processDueScheduledDispatches();
  res.json({
    success: true,
    message: 'Scheduled sequence queue evaluated.',
    timestamp: new Date().toISOString(),
    ...result
  });
});

// API: Get Fresh Presets
app.get('/api/fresh-presets', (req, res) => {
  try {
    const presets = db.getFreshPresets();
    res.json({ success: true, presets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Save Fresh Preset
app.post('/api/fresh-presets', (req, res) => {
  try {
    const preset = req.body;
    if (!preset || !preset.name) {
      return res.status(400).json({ success: false, error: 'Preset name is required.' });
    }
    const saved = db.saveFreshPreset(preset);
    res.json({ success: true, preset: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete Fresh Preset
app.delete('/api/fresh-presets/:id', (req, res) => {
  try {
    const deleted = db.deleteFreshPreset(req.params.id);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Multi-stage Fresh Sequence Dispatch (Instant + Scheduled)
app.post('/api/fresh-sequence/dispatch', async (req, res) => {
  try {
    const {
      sessionId,
      sequenceName,
      recipients, // array of { email, name, first_name, id, ... } or strings
      stages      // array of { stage: 1, subject: '...', htmlContent: '...', delayDays: 0, scheduledFor: ISO or null, trackingCode: '...' }
    } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'Please specify at least one recipient.' });
    }
    if (!Array.isArray(stages) || stages.length === 0) {
      return res.status(400).json({ success: false, error: 'Please configure at least one sequence stage.' });
    }

    const allCustomers = db.getCustomers();
    // Normalize recipients & auto-match against Shopify database
    const normalizedRecipients = recipients.map(r => {
      const email = (typeof r === 'string' ? r : (r.email || '')).trim().toLowerCase();
      const found = allCustomers.find(c => (c.email || '').toLowerCase() === email);
      if (found) return found;

      let fallbackName = (typeof r === 'object' && r.name) ? r.name.trim() : '';
      if (!fallbackName && email.includes('@')) {
        const localPart = email.split('@')[0];
        // clean up dots/numbers: dr.marc -> Marc, john_doe -> John Doe
        fallbackName = localPart.replace(/[._-]+/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      const fallbackFirstName = (typeof r === 'object' && r.first_name) ? r.first_name.trim() : (fallbackName ? fallbackName.split(' ')[0] : 'Valued Client');

      return {
        id: typeof r === 'object' && r.id ? r.id : ('fresh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
        email: email,
        name: fallbackName || email,
        first_name: fallbackFirstName,
        orders_count: 0,
        total_spent: '0.00'
      };
    }).filter(r => r.email && r.email.includes('@'));

    if (normalizedRecipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid recipient email addresses provided.' });
    }

    const results = {
      sentCount: 0,
      scheduledCount: 0,
      failedCount: 0,
      dispatches: []
    };

    const now = new Date();
    const finalSessionId = sessionId || ('session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));

    // Register Activity Session ("Season") for this Fresh Sequence
    const activitySession = db.createActivitySession({
      id: finalSessionId,
      name: sequenceName || `Fresh Sequence • ${normalizedRecipients.length} Recipient${normalizedRecipients.length > 1 ? 's' : ''}`,
      campaignId: 'fresh_sequence',
      campaignName: sequenceName || 'Custom Fresh Sequence',
      recipients: normalizedRecipients.map(c => ({
        id: c.id,
        email: c.email,
        name: c.name || c.first_name || c.email
      })),
      stagesConfigured: stages.length,
      status: 'active'
    });

    for (const stage of stages) {
      const stageNum = Number(stage.stage) || 1;
      const delayDays = Number(stage.delayDays) || 0;
      let isInstant = delayDays === 0 && !stage.scheduledFor;
      let scheduledDate = null;

      if (!isInstant) {
        if (stage.scheduledFor) {
          scheduledDate = new Date(stage.scheduledFor);
        } else {
          scheduledDate = new Date(now.getTime() + delayDays * 86400000);
        }
        if (scheduledDate <= now) {
          isInstant = true;
        }
      }

      for (const cust of normalizedRecipients) {
        const trackingCode = (stage.trackingCode && stage.trackingCode.trim())
          ? stage.trackingCode.trim().toUpperCase()
          : `TDS-TRACK-${Math.random().toString(36).substring(2, 6).toUpperCase()}-S${stageNum}`;

        if (isInstant) {
          try {
            const sendResult = await emailService.sendFollowUpEmail({
              to: cust.email,
              customer: cust,
              templateId: 'fresh_sequence',
              customSubject: stage.subject,
              customDiscountCode: trackingCode,
              customBody: stage.htmlContent,
              mode: 'fresh_sequence_instant',
              sessionId: finalSessionId,
              stage: stageNum,
              stageLabel: `Stage ${stageNum} (Instant)`,
                htmlContent: stage.htmlContent
              });

            // Update dispatch with session info
            if (sendResult && sendResult.dispatchId) {
              db.updateDispatch(sendResult.dispatchId, {
                sessionId: finalSessionId,
                campaignId: 'fresh_sequence',
                campaignName: sequenceName || 'Custom Fresh Sequence',
                templateName: `${sequenceName || 'Fresh Sequence'} (Stage ${stageNum})`,
                stage: stageNum,
                stageLabel: `Stage ${stageNum} (Instant)`,
                htmlContent: stage.htmlContent
              });
            }

            results.sentCount++;
            results.dispatches.push({
              email: cust.email,
              stage: stageNum,
              status: 'sent',
              trackingCode
            });
          } catch (err) {
            results.failedCount++;
            results.dispatches.push({
              email: cust.email,
              stage: stageNum,
              status: 'failed',
              error: err.message,
              trackingCode
            });
          }
        } else {
          // Schedule future dispatch in database
          const scheduledDispatch = db.addDispatch({
            customerEmail: cust.email,
            customerName: cust.name || cust.first_name,
            customerFirstName: cust.first_name,
            customerId: cust.id,
            templateId: 'fresh_sequence',
            templateName: `${sequenceName || 'Fresh Sequence'} (Stage ${stageNum})`,
            campaignId: 'fresh_sequence',
            campaignName: sequenceName || 'Custom Fresh Sequence',
            sessionId: finalSessionId,
            stage: stageNum,
            stageLabel: `Stage ${stageNum} (+${delayDays}d)`,
            discountCode: trackingCode,
            subject: stage.subject,
            htmlContent: stage.htmlContent,
            status: 'scheduled',
            scheduledFor: scheduledDate.toISOString(),
            mode: 'fresh_sequence_scheduled'
          });
          results.scheduledCount++;
          results.dispatches.push({
            id: scheduledDispatch.id,
            email: cust.email,
            stage: stageNum,
            status: 'scheduled',
            scheduledFor: scheduledDate.toISOString(),
            trackingCode
          });
        }
      }
    }

    res.json({
      success: true,
      sessionId: finalSessionId,
      message: `Sequence initiated: ${results.sentCount} instant emails sent, ${results.scheduledCount} scheduled for future delivery, ${results.failedCount} failed.`,
      ...results
    });
  } catch (err) {
    console.error('[FreshSequence] Dispatch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Reschedule a scheduled dispatch
app.post('/api/dispatches/:id/reschedule', (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledFor } = req.body;
    if (!scheduledFor) return res.status(400).json({ success: false, error: 'New scheduled date/time is required.' });
    
    const parsedDate = new Date(scheduledFor);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date/time format.' });
    }

    const updated = db.updateDispatch(id, {
      scheduledFor: parsedDate.toISOString(),
      status: 'scheduled'
    });
    if (!updated) return res.status(404).json({ success: false, error: 'Dispatch not found.' });
    res.json({ success: true, dispatch: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Send a scheduled dispatch immediately
app.post('/api/dispatches/:id/send-now', async (req, res) => {
  try {
    const { id } = req.params;
    const dispatch = db.getDispatchById(id);
    if (!dispatch) return res.status(404).json({ success: false, error: 'Dispatch not found.' });

    const allCustomers = db.getCustomers();
    let cust = dispatch.customerId ? allCustomers.find(c => String(c.id) === String(dispatch.customerId)) : null;
    if (!cust) {
      cust = {
        id: dispatch.customerId || ('cust_' + Date.now()),
        email: dispatch.customerEmail,
        first_name: dispatch.customerFirstName || (dispatch.customerName ? dispatch.customerName.split(' ')[0] : dispatch.customerEmail.split('@')[0]),
        name: dispatch.customerName || dispatch.customerEmail,
        orders_count: 0,
        total_spent: '0.00'
      };
    }

    await emailService.sendFollowUpEmail({
      to: dispatch.customerEmail,
      customer: cust,
      templateId: dispatch.templateId || 'fresh_sequence',
      customSubject: dispatch.subject,
      customDiscountCode: dispatch.discountCode || 'TDS-CARE',
      customBody: dispatch.htmlContent || null,
      mode: 'manual_send_now',
      sessionId: dispatch.sessionId,
      stage: dispatch.stage,
      stageLabel: dispatch.stageLabel,
      existingDispatchId: id
    });

    const updated = db.getDispatchById(id);
    res.json({ success: true, dispatch: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Retry a failed dispatch immediately
app.post('/api/dispatches/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const dispatch = db.getDispatchById(id);
    if (!dispatch) return res.status(404).json({ success: false, error: 'Dispatch record not found.' });

    const allCustomers = db.getCustomers();
    let cust = dispatch.customerId ? allCustomers.find(c => String(c.id) === String(dispatch.customerId)) : null;
    if (!cust) {
      cust = {
        id: dispatch.customerId || ('cust_' + Date.now()),
        email: dispatch.customerEmail,
        first_name: dispatch.customerFirstName || (dispatch.customerName ? dispatch.customerName.split(' ')[0] : dispatch.customerEmail.split('@')[0]),
        name: dispatch.customerName || dispatch.customerEmail,
        orders_count: 0,
        total_spent: '0.00'
      };
    }

    db.updateDispatch(id, { status: 'sending', error: null });

    await emailService.sendFollowUpEmail({
      to: dispatch.customerEmail,
      customer: cust,
      templateId: dispatch.templateId || 'water_flosser_1',
      customSubject: dispatch.subject,
      customDiscountCode: dispatch.discountCode || 'TDS-CARE',
      customBody: dispatch.htmlContent || null,
      mode: 'manual_retry',
      sessionId: dispatch.sessionId,
      stage: dispatch.stage,
      stageLabel: dispatch.stageLabel,
      existingDispatchId: id
    });

    const updated = db.getDispatchById(id);
    res.json({ success: true, dispatch: updated });
  } catch (e) {
    db.updateDispatch(req.params.id, { status: 'failed', error: e.message });
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Permanently delete a dispatch record (recalculates analytics immediately)
app.delete('/api/dispatches/:id', (req, res) => {
  try {
    const { id } = req.params;
    const dispatch = db.getDispatchById(id);
    if (!dispatch) return res.status(404).json({ success: false, error: 'Dispatch record not found.' });

    const deleted = db.deleteDispatch(id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Could not delete dispatch record.' });

    res.json({ success: true, message: 'Dispatch record permanently deleted.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Activity Sessions ("Seasons")
app.get('/api/activity-sessions', (req, res) => {
  try {
    const sessions = db.getActivitySessions();
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/activity-sessions/:id', (req, res) => {
  try {
    const session = db.getActivitySessionById(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Activity session not found.' });
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// API: Re-send to failed recipients in an activity session (or forceAll)
app.post('/api/activity-sessions/:id/retry-failed', async (req, res) => {
  try {
    const { id } = req.params;
    const { forceAll } = req.body || {};
    const session = db.getActivitySessionById(id);
    if (!session) return res.status(404).json({ success: false, error: 'Activity session not found.' });

    let targets = (session.dispatches || []).filter(d => forceAll ? (d.status === 'failed' || d.status === 'sent') : d.status === 'failed');

    if (targets.length === 0) {
      if (!forceAll) {
        return res.json({
          success: true,
          message: 'No failed recipients found in this session.',
          retriedCount: 0,
          sentCount: 0,
          failedCount: 0
        });
      } else {
        targets = session.dispatches || [];
      }
    }

    const allCustomers = db.getCustomers();
    const results = {
      retriedCount: targets.length,
      sentCount: 0,
      failedCount: 0,
      details: []
    };

    for (const d of targets) {
      try {
        let cust = d.customerId ? allCustomers.find(c => String(c.id) === String(d.customerId)) : null;
        if (!cust) {
          cust = {
            id: d.customerId || ('cust_' + Date.now()),
            email: d.customerEmail,
            first_name: d.customerFirstName || (d.customerName ? d.customerName.split(' ')[0] : d.customerEmail.split('@')[0]),
            name: d.customerName || d.customerEmail,
            orders_count: 0,
            total_spent: '0.00'
          };
        }

        db.updateDispatch(d.id, { status: 'sending', error: null });

        await emailService.sendFollowUpEmail({
          to: d.customerEmail,
          customer: cust,
          templateId: d.templateId || 'fresh_sequence',
          customSubject: d.subject,
          customDiscountCode: d.discountCode || 'TDS-CARE',
          customBody: d.htmlContent || null,
          mode: 'session_retry',
          sessionId: id,
          stage: d.stage,
          stageLabel: d.stageLabel,
          existingDispatchId: d.id
        });

        results.sentCount++;
        results.details.push({ id: d.id, email: d.customerEmail, status: 'sent' });
      } catch (sendErr) {
        results.failedCount++;
        results.details.push({ id: d.id, email: d.customerEmail, status: 'failed', error: sendErr.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${results.retriedCount} recipient(s): ${results.sentCount} sent, ${results.failedCount} failed.`,
      ...results
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/activity-sessions/:id', (req, res) => {
  try {
    const purgeDispatches = req.query.purgeDispatches !== 'false';
    const result = db.deleteActivitySession(req.params.id, purgeDispatches);
    if (!result) return res.status(404).json({ success: false, error: 'Activity session not found.' });
    res.json({
      success: true,
      message: `Activity session deleted successfully${result.removedDispatchesCount ? ` (${result.removedDispatchesCount} dispatch records removed)` : ''}.`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ========================================================
   SERVER INITIALIZATION
   ======================================================== */
app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`   RetentionFlow - The Dental Shaman Conversion Engine `);
  console.log(`   Running on http://localhost:${PORT}                 `);
  console.log(`=======================================================`);

  // Initial Shopify customer sync if database is empty
  if (db.getCustomers().length === 0) {
    console.log('[RetentionFlow] Performing initial customer synchronization from Shopify...');
    try {
      const list = await shopifyClient.fetchAllCustomers();
      db.setCustomers(list);
    } catch (e) {
      console.warn('[RetentionFlow] Initial customer sync warning:', e.message);
    }
  }
});
