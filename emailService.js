const fs = require('fs');
const path = require('path');
const axios = require('axios');
const nodemailer = require('nodemailer');
const db = require('./database');
const trackingEngine = require('./trackingEngine');
require('dotenv').config();

class EmailService {
  constructor() {
    this.templatesDir = path.join(__dirname, 'templates');
  }

  getTransporter(settings = {}) {
    const host = settings.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(settings.smtpPort || process.env.SMTP_PORT || '465', 10);
    const secure = (settings.smtpSecure !== undefined ? settings.smtpSecure : (process.env.SMTP_SECURE === 'true')) || port === 465;
    const user = settings.smtpUser || process.env.SMTP_USER || 'shop@thedentalshaman.com';
    const pass = (settings.smtpPass || process.env.SMTP_PASS || '').replace(/\s+/g, '');

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000
    });
  }

  getTemplateHtml(filename) {
    const filePath = path.join(this.templatesDir, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    // Fallback minimal template
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827; background: #ffffff;">
        <h2 style="color: #744B6F;">The Dental Shaman</h2>
        <p>Dear {{first_name}},</p>
        <p>Thank you for being a valued client of The Dental Shaman.</p>
        <div style="margin: 24px 0; padding: 16px; background: #fbf7fa; border: 1px solid #eadce6; border-radius: 8px;">
          <p style="margin: 0; font-weight: 600;">Use promo code: <span style="color: #744B6F;">{{discount_code}}</span></p>
        </div>
        <p><a href="{{shop_url}}" style="display: inline-block; padding: 12px 24px; background: #744B6F; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Visit Our Holistic Store</a></p>
      </div>
    `;
  }

  renderTemplate(templateId, customer = {}, customSubject = null, customDiscountCode = null, customBody = null) {
    const tpl = db.getTemplateById(templateId) || db.getTemplates()[0];
    const rawHtml = customBody || (tpl.htmlContent || this.getTemplateHtml(tpl.file));

    const firstName = customer.first_name ? customer.first_name.trim() : (customer.name ? customer.name.split(' ')[0] : 'there');
    const fullName = customer.name || firstName;
    const email = customer.email || '';
    
    // Determine tracking code (zero discounts across the platform)
    let trackingCode = '';

    if (customDiscountCode !== undefined && customDiscountCode !== null) {
      trackingCode = String(customDiscountCode).trim();
    } else {
      trackingCode = tpl.discountCode ? String(tpl.discountCode).trim() : 'TDS-CARE';
    }
    if (!trackingCode || trackingCode.toUpperCase() === 'NONE') {
      trackingCode = 'TDS-CARE';
    }

    // Professional clinical care guidance banner (no discounts or coupon mentions)
    const discountBlock = `
      <div style="background-color:#fbf7fa; border-left:4px solid #744B6F; padding:16px 20px; margin:24px 0; border-radius:0 6px 6px 0;">
        <p style="color:#744B6F; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0 0 4px 0; font-family:Arial,sans-serif; font-weight:bold;">
          Clinical Care Guidance &amp; Consultation
        </p>
        <p style="font-family:Arial,sans-serif; font-size:13.5px; color:#4a4a4a; margin:0; line-height:1.5;">
          This clinical guidance is provided by Dr. Marc Mortiboys (BDS) to support your everyday biological wellness and periodontal care protocol.
        </p>
      </div>
    `;

    const shopName = 'The Dental Shaman';
    const shopUrl = process.env.SHOPIFY_SHOP ? `https://${process.env.SHOPIFY_SHOP}` : 'https://shop.thedentalshaman.com';

    let subject = customSubject || tpl.subject;
    subject = subject
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{customer_name\}\}/gi, fullName)
      .replace(/\{\{tracking_code\}\}/gi, trackingCode)
      .replace(/\{\{discount_code\}\}/gi, trackingCode)
      .replace(/\{\{shop_name\}\}/gi, shopName);

    let html = rawHtml
      .replace(/\{\{discount_block\}\}/gi, discountBlock)
      .replace(/\{\{first_name\}\}/gi, firstName)
      .replace(/\{\{customer_name\}\}/gi, fullName)
      .replace(/\{\{customer_email\}\}/gi, email)
      .replace(/\{\{tracking_code\}\}/gi, trackingCode)
      .replace(/\{\{discount_code\}\}/gi, trackingCode)
      .replace(/\{\{discount_percent\}\}/gi, '0')
      .replace(/\{\{shop_name\}\}/gi, shopName)
      .replace(/\{\{shop_url\}\}/gi, shopUrl)
      .replace(/\{\{total_spent\}\}/gi, customer.total_spent ? `£${customer.total_spent}` : '£0.00')
      .replace(/\{\{orders_count\}\}/gi, String(customer.orders_count || 0));

    return {
      template: tpl,
      subject,
      html,
      discountCode: trackingCode
    };
  }

  /**
   * Universal sub-second email dispatcher
   * Resend API Port 443 -> SMTP Fallback
   */
  async sendFollowUpEmail({
    to,
    customer = {},
    templateId = 'water_flosser_1',
    customSubject = null,
    customDiscountCode = null,
    customBody = null,
    mode = 'manual',
    sessionId = null,
    stage = null,
    stageLabel = null,
    existingDispatchId = null
  }) {
    const rawTo = (to || customer.email || '').trim();
    const settings = db.getSettings();
    const fromName = settings.senderName || 'Dr. Marc Mortiboys | The Dental Shaman';
    const fromEmail = settings.senderEmail || 'shop@thedentalshaman.com';
    const replyTo = settings.replyTo || fromEmail;

    // 1. Render template & personalization
    let rendered;
    try {
      rendered = this.renderTemplate(templateId, customer, customSubject, customDiscountCode, customBody);
    } catch (e) {
      rendered = {
        template: { name: 'Care Follow-Up', campaignId: 'water_flosser', campaignName: 'Water Flosser Routine & Care', stage: 1, stageLabel: 'Stage 1' },
        subject: customSubject || 'Follow-Up from Dr. Marc Mortiboys',
        discountCode: customDiscountCode || 'NONE',
        html: customBody || '<p>Care follow-up</p>'
      };
    }

    // 2. Pre-generate or retrieve dispatch record in database to obtain dispatchId
    let dispatch = null;
    if (existingDispatchId) {
      dispatch = db.getDispatchById(existingDispatchId);
      if (dispatch) {
        db.updateDispatch(dispatch.id, {
          status: 'sending',
          sessionId: sessionId || dispatch.sessionId || null,
          templateId,
          templateName: rendered.template?.name || dispatch.templateName,
          campaignId: rendered.template?.campaignId || dispatch.campaignId,
          campaignName: rendered.template?.campaignName || dispatch.campaignName,
          stage: stage || rendered.template?.stage || dispatch.stage || 1,
          stageLabel: stageLabel || rendered.template?.stageLabel || dispatch.stageLabel || 'Stage 1',
          discountCode: rendered.discountCode,
          subject: rendered.subject,
          mode
        });
      }
    }
    if (!dispatch) {
      dispatch = db.addDispatch({
        customerEmail: rawTo.toLowerCase(),
        customerName: customer.name || (rawTo ? rawTo.split('@')[0] : 'Valued Customer'),
        customerId: customer.id || null,
        templateId,
        templateName: rendered.template?.name || 'Care Follow-Up',
        campaignId: rendered.template?.campaignId || 'water_flosser',
        campaignName: rendered.template?.campaignName || 'Water Flosser Routine & Care',
        stage: stage || rendered.template?.stage || 1,
        stageLabel: stageLabel || rendered.template?.stageLabel || 'Stage 1',
        discountCode: rendered.discountCode,
        subject: rendered.subject,
        mode,
        status: 'sending',
        sessionId: sessionId || null
      });
    }

    if (!rawTo || !rawTo.includes('@')) {
      const errMsg = `Invalid recipient email address: "${rawTo || 'none'}"`;
      db.updateDispatch(dispatch.id, {
        status: 'failed',
        error: errMsg
      });
      if (customer.id) {
        db.updateCustomer(customer.id, {
          lastFollowUpAt: new Date().toISOString(),
          lastFollowUpStatus: 'failed',
          lastFollowUpError: errMsg
        });
      }
      throw new Error(errMsg);
    }

    // 3. Wrap email links with Click & Conversion tracking gateway
    const trackedHtml = trackingEngine.wrapEmailHtmlWithTracking(rendered.html, dispatch.id, rendered.discountCode);

    try {
      let messageId = null;
      let usedProtocol = 'Google Workspace Gmail';

      const preferredProvider = settings.emailProvider || process.env.EMAIL_PROVIDER || 'google_workspace';
      const resendKey = settings.resendApiKey || process.env.RESEND_API_KEY;

      if (preferredProvider === 'resend' && resendKey && resendKey.trim()) {
        usedProtocol = 'Resend REST API (HTTPS Port 443)';
        const payload = {
          from: `${fromName} <${fromEmail}>`,
          to: [rawTo],
          reply_to: replyTo,
          subject: rendered.subject,
          html: trackedHtml
        };

        const res = await axios.post('https://api.resend.com/emails', payload, {
          headers: {
            Authorization: `Bearer ${resendKey.trim()}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        messageId = res.data?.id || `resend_${Date.now()}`;
      } else {
        // Attempt Google Workspace Gmail SMTP
        try {
          usedProtocol = `Google Workspace Gmail (${fromEmail})`;
          const transporter = this.getTransporter(settings);
          const info = await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to: rawTo,
            replyTo,
            subject: rendered.subject,
            html: trackedHtml
          });
          messageId = info.messageId;
        } catch (smtpErr) {
          console.warn('[EmailService] SMTP attempt failed or timed out:', smtpErr.message);
          // Gracefully fall back to Resend API (HTTPS Port 443) if cloud host blocks raw SMTP ports
          if (resendKey && resendKey.trim()) {
            console.log('[EmailService] Automatically falling back to Resend API (HTTPS Port 443)...');
            usedProtocol = 'Resend REST API (HTTPS Fallback)';
            const payload = {
              from: `${fromName} <${fromEmail}>`,
              to: [rawTo],
              reply_to: replyTo,
              subject: rendered.subject,
              html: trackedHtml
            };
            const res = await axios.post('https://api.resend.com/emails', payload, {
              headers: {
                Authorization: `Bearer ${resendKey.trim()}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            });
            messageId = res.data?.id || `resend_${Date.now()}`;
          } else {
            throw smtpErr;
          }
        }
      }

      // 4. Update dispatch record as sent
      db.updateDispatch(dispatch.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        messageId,
        usedProtocol,
        error: null
      });

      // 5. Update customer record follow-up history
      if (customer.id) {
        db.updateCustomer(customer.id, {
          lastFollowUpAt: new Date().toISOString(),
          lastTemplateSent: rendered.template.name,
          lastFollowUpStatus: 'sent',
          lastFollowUpError: null,
          followUpCount: (customer.followUpCount || 0) + 1
        });
      }

      console.log(`[EmailService] Follow-up successfully delivered to ${rawTo} via ${usedProtocol} (ID: ${messageId})`);

      return {
        success: true,
        dispatchId: dispatch.id,
        messageId,
        usedProtocol,
        subject: rendered.subject
      };
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      console.error(`[EmailService] Failed to send email to ${rawTo}:`, errMsg);

      db.updateDispatch(dispatch.id, {
        status: 'failed',
        error: errMsg
      });

      if (customer.id) {
        db.updateCustomer(customer.id, {
          lastFollowUpAt: new Date().toISOString(),
          lastFollowUpStatus: 'failed',
          lastFollowUpError: errMsg
        });
      }

      throw new Error(errMsg);
    }
  }

  /**
   * Quick test preview sender
   */
  async sendTestPreview(targetEmail, templateId = 'post_purchase_care', customSubject = null, customDiscountCode = null, customBody = null) {
    const dummyCustomer = {
      id: 'test_preview',
      first_name: 'Dr. Marc',
      name: 'Dr. Marc Mortiboys',
      email: targetEmail,
      total_spent: '149.00',
      orders_count: 3
    };

    return await this.sendFollowUpEmail({
      to: targetEmail,
      customer: dummyCustomer,
      templateId,
      customSubject: customSubject ? `[TEST] ${customSubject}` : null,
      customDiscountCode,
      customBody,
      mode: 'test'
    });
  }
}

module.exports = new EmailService();
