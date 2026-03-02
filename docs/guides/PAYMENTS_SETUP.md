# Payment Setup Guide

> For club administrators who want to collect tournament fees, Trikot orders, or donations.

## Overview

OpenKick supports two payment providers. You can enable one or both:

| Provider | Best for | Twint support | Card payments |
|----------|----------|---------------|---------------|
| **Stripe** | International clubs, cards + Twint | Yes (Swiss CHF accounts) | Visa, Mastercard, Apple Pay, Google Pay |
| **Datatrans** | Swiss clubs, PostFinance + Twint | Yes | Visa, Mastercard, PostFinance |

Parents never enter card details on your site — they're redirected to Stripe's or Datatrans' secure payment page.

## Option A: Set Up Stripe

### 1. Create a Stripe Account

1. Go to [stripe.com](https://stripe.com) and sign up
2. For Twint support, register with a **Swiss address** and **CHF** as your default currency
3. Complete the identity verification (Stripe requires this before you can accept real payments)

### 2. Get Your API Keys

1. In the Stripe Dashboard, go to **Developers > API Keys**
2. Copy the **Publishable key** (`pk_test_...`) and the **Secret key** (`sk_test_...`)
3. Enter them in the OpenKick setup wizard or add to your `.env` file:

```
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

### 3. Enable Twint (Swiss Accounts Only)

1. In the Stripe Dashboard, go to **Settings > Payment Methods**
2. Find **Twint** and enable it
3. Twint only works with CHF — make sure your default currency is CHF in OpenKick settings

### 4. Set Up Webhooks

1. In the Stripe Dashboard, go to **Developers > Webhooks**
2. Click **Add Endpoint**
3. Enter your URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select events: `checkout.session.completed`, `charge.refunded`
5. Copy the **Signing Secret** (`whsec_...`) to your `.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 5. Test Stripe

Use Stripe's test mode (test keys start with `pk_test_` / `sk_test_`). Create a tournament with a fee and try paying with the test card number `4242 4242 4242 4242`.

Switch to live keys when you're ready to accept real payments.

## Option B: Set Up Datatrans

### 1. Get a Datatrans Account

Datatrans is a Swiss payment service provider. Contact them at [datatrans.ch](https://www.datatrans.ch) to get a merchant account, or use their sandbox for testing.

### 2. Get Your Credentials

From the Datatrans Web Admin panel:
- **Merchant ID** (numeric, e.g., `1100012345`)
- **Server-to-Server API password**
- **HMAC sign key** (for verifying webhook signatures)

Add them to your `.env`:

```
DATATRANS_MERCHANT_ID=1100012345
DATATRANS_API_PASSWORD=your-password
DATATRANS_HMAC_KEY=your-hex-key
DATATRANS_BASE_URL=https://api.sandbox.datatrans.com
```

For production, change the base URL to `https://api.datatrans.com`.

### 3. Enable Twint

Ask your Datatrans account manager to activate Twint on your merchant account, or enable it in the Web Admin under **Payment Methods**.

### 4. Set Up Webhooks

Configure a webhook in the Datatrans Web Admin under **UPP Administration > Webhook**:

1. Enter your URL: `https://yourdomain.com/api/webhooks/datatrans`
2. Enable notifications for `payment` and `refund` events
3. Verify the HMAC key matches your `.env` value

### 5. Test Datatrans

The Datatrans sandbox includes a Twint simulator — you can test the full payment flow without a real Twint app.

## What to Enable

In the OpenKick admin dashboard under **Payment Settings**, you choose:

| Use Case | What happens |
|----------|-------------|
| **Tournament fees** | Coach sets a fee when creating a tournament. Parents pay during registration. |
| **Trikot & merchandise orders** | Prices attached to survey items. Parents pay after submitting their order. |
| **Donations** | A donation button on the homepage. Anyone can contribute. |

You can enable or disable each use case independently.

## What Parents See

1. Parent registers for a tournament (or submits a Trikot order)
2. They're redirected to a Stripe/Datatrans payment page
3. They pay with card, Twint, or another enabled method
4. They're redirected back to OpenKick with a confirmation
5. They receive a WhatsApp confirmation message
6. A PDF receipt is available for download

## Refunds

Coaches can issue refunds from the admin dashboard (e.g., if a tournament is cancelled). The refund goes back through the same payment method the parent used.

## Privacy

- OpenKick **never stores card numbers** or bank details
- Transaction records only contain: nickname, amount, purpose, date, and status
- All payment processing happens on Stripe's or Datatrans' servers
