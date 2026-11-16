const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const MASTER_ACCESS_CODE = process.env.MASTER_ACCESS_CODE || 'TDS-FLW#8E92B1C4-6A47D0F1-03B52E89';

const CAMPAIGNS = [
  {
    id: 'water_flosser',
    name: 'Water Flosser Routine & Care',
    shortName: 'Water Flosser',
    icon: '',
    iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
    color: '#008060'
  },
  {
    id: 'bogof_cup',
    name: 'Mouthwash Cup Routine & Care',
    shortName: 'Mouthwash Cup',
    icon: '',
    iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l-1.5 16a2 2 0 0 1-2 1.8H9.5a2 2 0 0 1-2-1.8L6 3z"/><line x1="6" y1="8" x2="18" y2="8"/></svg>',
    color: '#d97706'
  },
  {
    id: 'bogof_spray',
    name: 'Ozomist Spray Defense Routine',
    shortName: 'Ozomist Spray',
    icon: '',
    iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="10" width="10" height="12" rx="2"/><path d="M12 10V6"/><path d="M9 6h6"/><path d="M9 3h3v3"/><line x1="18" y1="5" x2="21" y2="5"/><line x1="18" y1="3" x2="20" y2="2"/><line x1="18" y1="7" x2="20" y2="8"/></svg>',
    color: '#16a34a'
  },
  {
    id: 'ebook_50',
    name: 'All E-Books 50% Off Campaign',
    shortName: 'All E-Books 50%',
    icon: '',
    iconSvg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>',
    color: '#744B6F'
  }
];

let DEFAULT_TEMPLATES = [];
try {
  const { ALL_TEMPLATES } = require('./scripts/generate_all_campaigns');
  DEFAULT_TEMPLATES = ALL_TEMPLATES;
} catch (e) {
  console.warn('[Database] Could not load ALL_TEMPLATES from scripts/generate_all_campaigns:', e.message);
}

class Database {
  constructor() {
    this.ensureDataDir();
    this.lastMtime = 0;
    this.data = this.load();
    this.initDefaults();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  reloadIfChanged() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const stat = fs.statSync(DB_FILE);
        if (!this.lastMtime || stat.mtimeMs > this.lastMtime) {
          this.data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
          this.lastMtime = stat.mtimeMs;
        }
      }
    } catch (e) {}
  }

  load() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const stat = fs.statSync(DB_FILE);
        this.lastMtime = stat.mtimeMs;
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      } catch (e) {
        console.error('[Database] Corrupt db.json, initializing fresh store.');
      }
    }
    return {};
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
      if (fs.existsSync(DB_FILE)) {
        this.lastMtime = fs.statSync(DB_FILE).mtimeMs;
      }
    } catch (e) {
      console.error('[Database] Failed to write db.json:', e.message);
    }
  }

  initDefaults() {
    let changed = false;
    if (!this.data.sessions) { this.data.sessions = {}; changed = true; }
    if (!this.data.customers) { this.data.customers = []; changed = true; }
    if (!this.data.dispatches) { this.data.dispatches = []; changed = true; }
    if (!this.data.clicks) { this.data.clicks = []; changed = true; }
    if (!this.data.conversions) { this.data.conversions = []; changed = true; }
    if (!this.data.templates || this.data.templates.length < 20) {
      this.data.templates = DEFAULT_TEMPLATES;
      changed = true;
    }
    if (!this.data.settings) {
      this.data.settings = {
        senderName: process.env.DEFAULT_FROM_NAME || 'Dr. Marc Mortiboys | The Dental Shaman',
        senderEmail: process.env.DEFAULT_FROM_EMAIL || 'shop@thedentalshaman.com',
        replyTo: process.env.DEFAULT_REPLY_TO || 'shop@thedentalshaman.com',
        resendApiKey: process.env.RESEND_API_KEY || '',
        defaultDiscountCode: 'HOLISTIC10',
        attributionWindowDays: 14,
        shopUrl: 'https://shop.thedentalshaman.com'
      };
      changed = true;
    }
    if (changed) this.save();
  }

  // --- Session & Security ---
  verifyMasterAccessCode(code) {
    if (!code) return false;
    const raw = String(code).trim();
    const targetCode = process.env.MASTER_ACCESS_CODE || MASTER_ACCESS_CODE;
    try {
      const hashA = crypto.createHash('sha256').update(raw).digest();
      const hashB = crypto.createHash('sha256').update(targetCode).digest();
      return crypto.timingSafeEqual(hashA, hashB);
    } catch (e) {
      return false;
    }
  }

  createSession(user = 'Authorized Operator') {
    const token = 'tok_' + crypto.randomBytes(32).toString('hex');
    this.data.sessions[token] = {
      user,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    this.save();
    return token;
  }

  validateSession(token) {
    if (!token || !this.data.sessions[token]) return false;
    const session = this.data.sessions[token];
    if (new Date(session.expiresAt) < new Date()) {
      delete this.data.sessions[token];
      this.save();
      return false;
    }
    return true;
  }

  deleteSession(token) {
    if (this.data.sessions[token]) {
      delete this.data.sessions[token];
      this.save();
    }
  }

  // --- Customers ---
  getCustomers() {
    this.reloadIfChanged();
    return this.data.customers || [];
  }

  setCustomers(list) {
    // Merge existing follow-up history with newly fetched customers
    const existingMap = new Map((this.data.customers || []).map(c => [String(c.id), c]));
    this.data.customers = list.map(c => {
      const prev = existingMap.get(String(c.id));
      return {
        ...c,
        lastFollowUpAt: prev?.lastFollowUpAt || null,
        followUpCount: prev?.followUpCount || 0,
        lastTemplateSent: prev?.lastTemplateSent || null,
        conversionStatus: prev?.conversionStatus || 'none',
        convertedRevenue: prev?.convertedRevenue || 0
      };
    });
    this.save();
    return this.data.customers;
  }

  updateCustomer(id, updates) {
    const customer = (this.data.customers || []).find(c => String(c.id) === String(id));
    if (customer) {
      Object.assign(customer, updates);
      this.save();
    }
    return customer;
  }

  // --- Campaigns & Templates ---
  getCampaigns() {
    return CAMPAIGNS;
  }

  getTemplates(campaignId = null) {
    this.reloadIfChanged();
    const list = this.data.templates || DEFAULT_TEMPLATES;
    if (campaignId && campaignId !== 'all') {
      return list.filter(t => t.campaignId === campaignId);
    }
    return list;
  }

  getTemplateById(id) {
    this.reloadIfChanged();
    const tpl = (this.data.templates || DEFAULT_TEMPLATES).find(t => t.id === id);
    if (tpl && tpl.file) {
      const filePath = path.join(__dirname, 'templates', tpl.file);
      if (fs.existsSync(filePath)) {
        try {
          tpl.htmlContent = fs.readFileSync(filePath, 'utf8');
        } catch (e) {}
      }
    }
    return tpl;
  }

  saveTemplate(id, updates = {}) {
    this.reloadIfChanged();
    let tpl = (this.data.templates || []).find(t => t.id === id);
    if (!tpl) return null;

    Object.assign(tpl, updates);

    // If htmlContent was provided, write to file on disk in templates/
    if (updates.htmlContent && tpl.file) {
      const filePath = path.join(__dirname, 'templates', tpl.file);
      try {
        fs.writeFileSync(filePath, updates.htmlContent, 'utf8');
      } catch (err) {
        console.error('[Database] Failed to write template file:', err.message);
      }
    }

    this.save();
    return tpl;
  }

  updateTemplate(id, updates) {
    return this.saveTemplate(id, updates);
  }

  // --- Dispatches ---
  addDispatch(entry) {
    this.reloadIfChanged();
    const dispatch = {
      id: 'flw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      sentAt: new Date().toISOString(),
      campaignId: entry.campaignId || 'water_flosser',
      stage: entry.stage || 1,
      clicked: false,
      clickCount: 0,
      firstClickedAt: null,
      conversionStatus: 'pending', // pending | converted | expired
      orderId: null,
      orderNumber: null,
      convertedRevenue: 0,
      evidenceSummary: null,
      ...entry
    };
    this.data.dispatches.unshift(dispatch);
    if (this.data.dispatches.length > 2000) this.data.dispatches.pop();
    this.save();
    return dispatch;
  }

  getDispatches() {
    this.reloadIfChanged();
    return this.data.dispatches || [];
  }

  getDispatchById(id) {
    return (this.data.dispatches || []).find(d => d.id === id);
  }

  updateDispatch(id, updates) {
    const dispatch = (this.data.dispatches || []).find(d => d.id === id);
    if (dispatch) {
      Object.assign(dispatch, updates);
      this.save();
    }
    return dispatch;
  }

  // --- Clicks ---
  addClick(clickData) {
    this.reloadIfChanged();
    const click = {
      id: 'clk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      ...clickData
    };
    this.data.clicks.unshift(click);
    if (this.data.clicks.length > 5000) this.data.clicks.pop();

    // Update dispatch record
    const dispatch = this.getDispatchById(clickData.dispatchId);
    if (dispatch) {
      dispatch.clicked = true;
      dispatch.clickCount = (dispatch.clickCount || 0) + 1;
      if (!dispatch.firstClickedAt) {
        dispatch.firstClickedAt = click.timestamp;
      }
    }

    this.save();
    return click;
  }

  getClicks(dispatchId) {
    if (dispatchId) {
      return (this.data.clicks || []).filter(c => c.dispatchId === dispatchId);
    }
    return this.data.clicks || [];
  }

  // --- Conversions (Attribution Proof) ---
  addConversion(conv) {
    this.reloadIfChanged();
    const existing = (this.data.conversions || []).find(c => String(c.orderId) === String(conv.orderId));
    if (existing) {
      Object.assign(existing, conv);
      this.save();
      return existing;
    }
    const dispatch = conv.dispatchId ? this.getDispatchById(conv.dispatchId) : null;
    const conversion = {
      id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      verifiedAt: new Date().toISOString(),
      campaignId: conv.campaignId || dispatch?.campaignId || 'water_flosser',
      stage: conv.stage || dispatch?.stage || 1,
      ...conv
    };
    this.data.conversions.unshift(conversion);
    this.save();

    // Link back to dispatch
    if (dispatch) {
      dispatch.conversionStatus = 'converted';
      dispatch.orderId = conv.orderId;
      dispatch.orderNumber = conv.orderNumber;
      dispatch.convertedRevenue = conv.totalPrice;
      dispatch.convertedAt = conv.orderCreatedAt;
      dispatch.evidenceSummary = conv.proofReason;
    }

    // Link back to customer
    if (conv.customerEmail) {
      const customer = (this.data.customers || []).find(c => c.email && c.email.toLowerCase() === conv.customerEmail.toLowerCase());
      if (customer) {
        customer.conversionStatus = 'converted';
        customer.convertedRevenue = (customer.convertedRevenue || 0) + parseFloat(conv.totalPrice || 0);
      }
    }

    this.save();
    return conversion;
  }

  getConversions() {
    this.reloadIfChanged();
    return this.data.conversions || [];
  }

  // --- Settings ---
  getSettings() {
    this.reloadIfChanged();
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  // --- Metrics Summary ---
  getStats() {
    this.reloadIfChanged();
    const customers = this.data.customers || [];
    const dispatches = this.data.dispatches || [];
    const conversions = this.data.conversions || [];

    const totalCustomers = customers.length;
    const totalDispatched = dispatches.filter(d => d.status === 'sent').length;
    const totalFailed = dispatches.filter(d => d.status === 'failed').length;
    const totalClicked = dispatches.filter(d => d.clicked).length;
    const totalConverted = conversions.length;

    const totalRevenueGenerated = conversions.reduce((sum, c) => sum + parseFloat(c.totalPrice || 0), 0);
    const clickRate = totalDispatched > 0 ? ((totalClicked / totalDispatched) * 100).toFixed(1) : 0;
    const conversionRate = totalDispatched > 0 ? ((totalConverted / totalDispatched) * 100).toFixed(1) : 0;

    return {
      totalCustomers,
      totalDispatched,
      totalFailed,
      totalClicked,
      totalConverted,
      totalRevenueGenerated: totalRevenueGenerated.toFixed(2),
      clickRate: parseFloat(clickRate),
      conversionRate: parseFloat(conversionRate)
    };
  }
}

module.exports = new Database();
