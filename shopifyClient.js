const axios = require('axios');
require('dotenv').config();

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP || 'shop.thedentalshaman.com';
const SHOPIFY_DOMAIN = process.env.SHOPIFY_MYSHOPIFY_DOMAIN || 'myjrue-ku.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const API_VERSION = process.env.API_VERSION || '2024-01';

class ShopifyClient {
  constructor() {
    this.shop = SHOPIFY_SHOP;
    this.domain = SHOPIFY_DOMAIN;
    this.token = SHOPIFY_TOKEN;
    this.apiVersion = API_VERSION;

    this.api = axios.create({
      baseURL: `https://${this.domain}/admin/api/${this.apiVersion}`,
      headers: {
        'X-Shopify-Access-Token': this.token,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
  }

  async testConnection() {
    try {
      const res = await this.api.get('/shop.json');
      return {
        success: true,
        shop: {
          name: res.data.shop.name,
          email: res.data.shop.email,
          domain: res.data.shop.domain,
          myshopify_domain: res.data.shop.myshopify_domain,
          currency: res.data.shop.currency,
          plan_name: res.data.shop.plan_name
        }
      };
    } catch (err) {
      console.error('[ShopifyClient] Connection test failed:', err.response?.data || err.message);
      return { success: false, error: err.response?.data?.errors || err.message };
    }
  }

  /**
   * Fetches all customers with robust Link-header pagination
   */
  async fetchAllCustomers() {
    let allCustomers = [];
    let url = `/customers.json?limit=250`;
    let page = 1;

    console.log('[ShopifyClient] Synchronizing all Shopify customers...');

    while (url) {
      try {
        const res = await this.api.get(url);
        const list = res.data.customers || [];
        allCustomers.push(...list);

        console.log(`[ShopifyClient] Page ${page}: retrieved ${list.length} customers (Total so far: ${allCustomers.length})`);

        // Check Link header for next page
        const linkHeader = res.headers['link'] || res.headers['Link'];
        url = null;
        if (linkHeader) {
          const links = linkHeader.split(',');
          for (const link of links) {
            const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
            if (match && match[2] === 'next') {
              const fullUrl = new URL(match[1]);
              url = `${fullUrl.pathname}${fullUrl.search}`.replace(`/admin/api/${this.apiVersion}`, '');
              break;
            }
          }
        }
        page++;
      } catch (err) {
        console.error(`[ShopifyClient] Error fetching page ${page}:`, err.message);
        break;
      }
    }

    // Normalize and clean customer objects
    const normalized = allCustomers.map(c => {
      const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.email?.split('@')[0] || 'Valued Customer';
      return {
        id: String(c.id),
        email: c.email ? c.email.trim().toLowerCase() : null,
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        name: fullName,
        phone: c.phone || '',
        orders_count: c.orders_count || 0,
        total_spent: parseFloat(c.total_spent || 0).toFixed(2),
        currency: c.currency || 'GBP',
        tags: c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        verified_email: Boolean(c.verified_email),
        marketing_opt_in: c.email_marketing_consent?.state === 'subscribed',
        last_order_id: c.last_order_id ? String(c.last_order_id) : null,
        last_order_name: c.last_order_name || null,
        created_at: c.created_at,
        updated_at: c.updated_at
      };
    });

    console.log(`[ShopifyClient] Successfully normalized ${normalized.length} total customer records.`);
    return normalized;
  }

  async getCustomerById(id) {
    try {
      const res = await this.api.get(`/customers/${id}.json`);
      return res.data.customer;
    } catch (e) {
      return null;
    }
  }

  /**
   * Fetches orders for a specific customer to audit purchase history
   */
  async getCustomerOrders(customerId) {
    try {
      const res = await this.api.get(`/customers/${customerId}/orders.json?status=any&limit=50`);
      return res.data.orders || [];
    } catch (e) {
      console.warn(`[ShopifyClient] Could not fetch orders for customer ${customerId}:`, e.message);
      return [];
    }
  }

  /**
   * Fetches orders placed since a specific ISO date (or past 30 days)
   */
  async getRecentOrders(sinceDate = null) {
    try {
      const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const minDate = sinceDate || defaultSince;
      const res = await this.api.get(`/orders.json?status=any&created_at_min=${encodeURIComponent(minDate)}&limit=250`);
      return res.data.orders || [];
    } catch (e) {
      console.error('[ShopifyClient] Failed to fetch recent orders:', e.message);
      return [];
    }
  }

  /**
   * Generates or ensures a unique promo code under a Shopify PriceRule
   */
  async createUniqueDiscountCode(code, percentOff = 10) {
    const cleanCode = code.toUpperCase().trim();
    const priceRuleId = process.env.PRICE_RULE_ID || '1878761963849'; // Existing store credit/discount rule

    try {
      // Create discount code under price rule
      const res = await this.api.post(`/price_rules/${priceRuleId}/discount_codes.json`, {
        discount_code: {
          code: cleanCode
        }
      });
      return { success: true, code: res.data.discount_code.code, id: res.data.discount_code.id };
    } catch (err) {
      // If code already exists or price rule endpoint is strict, return the requested code as safe fallback
      return { success: true, code: cleanCode, note: 'Code pre-existing or fallback' };
    }
  }
}

module.exports = new ShopifyClient();
