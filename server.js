require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('./database');
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

// Health check for Render
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dental-shaman-followup-app',
    timestamp: new Date().toISOString()
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
  console.log(`[Security] Master access granted successfully to ${clientIp}`);
  res.json({ success: true, token });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }
  if (db.validateSession(token)) {
    return res.json({ success: true });
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
  if (req.path.startsWith('/auth/')) return next();

  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && req.query.token) {
    token = req.query.token;
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
      templateId,
      customSubject,
      customDiscountCode,
      customBody
    } = req.body;

    if (!customerEmail) {
      return res.status(400).json({ error: 'Customer email address is required.' });
    }

    const customer = customerId
      ? db.getCustomers().find(c => String(c.id) === String(customerId)) || { email: customerEmail }
      : { email: customerEmail };

    const result = await emailService.sendFollowUpEmail({
      to: customerEmail,
      customer,
      templateId: templateId || 'post_purchase_care',
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
      templateId,
      customSubject,
      customDiscountCode,
      customBody
    } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one customer must be selected.' });
    }

    const allCustomers = db.getCustomers();
    const targetCustomers = customerIds
      .map(id => allCustomers.find(c => String(c.id) === String(id)))
      .filter(Boolean);

    if (targetCustomers.length === 0) {
      return res.status(400).json({ success: false, error: 'None of the selected customer IDs could be found.' });
    }

    const successes = [];
    const failures = [];

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

      try {
        const result = await emailService.sendFollowUpEmail({
          to: email,
          customer: cust,
          templateId: templateId || 'water_flosser_1',
          customSubject,
          customDiscountCode,
          customBody,
          mode: 'batch_manual'
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

      // 80ms gentle throttle between dispatches
      await new Promise(r => setTimeout(r, 80));
    }

    res.json({
      success: true,
      total: targetCustomers.length,
      sentCount: successes.length,
      failedCount: failures.length,
      message: `Batch complete: ${successes.length} dispatched successfully, ${failures.length} failed.`,
      successes,
      failures
    });
  } catch (err) {
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
    res.status(400).json({ success: false, error: err.message });
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
