# RetentionFlow &middot; Shopify Publishing & Deployment Guide

This guide details the exact steps to publish **RetentionFlow** as an embedded custom application on **The Dental Shaman** (`shop.thedentalshaman.com` / `myjrue-ku.myshopify.com`).

---

## Architecture Overview
- **App Name:** RetentionFlow
- **Shopify Store:** `myjrue-ku.myshopify.com` (`shop.thedentalshaman.com`)
- **Integration Type:** Shopify Admin Embedded Custom App (Polaris Design System)
- **Deployment Host:** Render Web Service (`https://tds-followup-app.onrender.com`)
- **Repository:** `https://github.com/dynabytedigital/tds-followup-app`

---

## Step 1: Push Repository to GitHub

In your project folder, double-click:
```
push-to-github.bat
```
*(Located at `C:\Users\nasra\.gemini\antigravity\scratch\dental-shaman-followup-app\push-to-github.bat`)*

This stages all files, sets the branch to `main`, and pushes to GitHub. If prompted by your browser or Git Credential Manager, confirm your sign-in to `dynabytedigital`.

---

## Step 2: Deploy on Render (Free & Automated)

1. Open **[Render Dashboard](https://dashboard.render.com/)**.
2. Click **New +** &rarr; **Web Service**.
3. Select the repository: **`dynabytedigital/tds-followup-app`**.
4. Configure service settings:
   - **Name:** `tds-followup-app`
   - **Region:** Frankfurt (EU) or Oregon (US)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. Click **Advanced** &rarr; **Add Environment Variables** (or Render will detect `render.yaml` automatically):

```env
SHOPIFY_SHOP=shop.thedentalshaman.com
SHOPIFY_MYSHOPIFY_DOMAIN=myjrue-ku.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=<your-shopify-admin-token>
API_VERSION=2024-01
MASTER_ACCESS_CODE=TDS-FLW#8E92B1C4-6A47D0F1-03B52E89
RESEND_API_KEY=<your-resend-api-key>
DEFAULT_FROM_NAME=Dr. Marc Mortiboys | The Dental Shaman
DEFAULT_FROM_EMAIL=shop@thedentalshaman.com
DEFAULT_REPLY_TO=shop@thedentalshaman.com
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=shop@thedentalshaman.com
SMTP_PASS=<your-smtp-pass>
APP_URL=https://tds-followup-app.onrender.com
```

6. Click **Create Web Service**.
Render will deploy the service in ~60-90 seconds. Your live HTTPS app URL will be:
`https://tds-followup-app.onrender.com`

---

## Step 3: Install & Publish Inside Shopify Admin

1. Open Shopify Admin for The Dental Shaman:
   **[https://admin.shopify.com/store/myjrue-ku/settings/apps/development](https://admin.shopify.com/store/myjrue-ku/settings/apps/development)**
2. Click **Create an app**:
   - **App name:** `RetentionFlow`
   - **App developer:** Dr. Marc Mortiboys / DynaByte
3. In **Configuration** &rarr; **Admin API integration**, click **Configure**:
   Ensure the following scopes are checked:
   - `read_customers`, `write_customers`
   - `read_orders`
   - `read_price_rules`, `write_price_rules`
   - `read_discounts`, `write_discounts`
   - `read_products`
   Click **Save**.
4. In **App setup** tab:
   - **App URL:** `https://tds-followup-app.onrender.com`
   - **Allowed redirection URL(s):**
     ```
     https://tds-followup-app.onrender.com/auth/callback
     https://tds-followup-app.onrender.com/api/auth/callback
     ```
   Click **Save**.
5. Click **Install app** at the top right and confirm installation.

---

## Step 4: Verification & Real-Life Testing

1. In your Shopify Admin left sidebar, click **Apps** &rarr; **RetentionFlow**.
2. RetentionFlow will load natively inside your Shopify Admin.
3. If prompted for the Master Operator Key, click **Auto-Fill Master Operator Key** or paste:
   `TDS-FLW#8E92B1C4-6A47D0F1-03B52E89`
4. The dashboard will immediately load:
   - **1,555 Store Customers**
   - **The 4 Campaign Silos (20 follow-up sequence templates)**
   - **Conversion Attribution & Proof Engine**
   - **Diagnostic Email Transmitter**
5. Dispatch a diagnostic test email to your inbox to confirm live delivery from `shop@thedentalshaman.com` via Resend API.
