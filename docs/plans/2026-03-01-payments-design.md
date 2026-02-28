# Payments Module Design

> Date: 2026-03-01
> PRD: section 4.5.12
> Blueprint: `docs/blueprints/PAYMENTS.md`
> Scope: Full stack (backend + frontend)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | PaymentProvider interface + PaymentService class | Blueprint pattern; well-suited for multi-provider abstraction |
| Implementation order | Blueprint-first (schema → interface → Stripe → Datatrans → webhooks → routes → frontend) | Blueprint is detailed enough to follow directly |
| PDF receipts | Server-side via pdfkit | More control, consistent formatting, downloadable via API |
| Credentials storage | `payment_providers.config` JSON column, env vars as fallback | Admin can configure via UI; env vars for bootstrap |
| Scope | Full stack: backend services + routes + webhooks + admin pages + checkout integration | User choice |

## File Structure

### Backend (server/src/)

```
services/
  payment.service.ts          # PaymentProvider interface + PaymentService facade
  stripe.service.ts           # Stripe implementation (checkout, webhook verify, refund)
  datatrans.service.ts        # Datatrans implementation (raw HTTP, HMAC verify)
  receipt.service.ts          # PDF receipt generation (pdfkit)

routes/
  payments.ts                 # POST /checkout, GET /admin/transactions, POST /admin/refund/:id, GET|PUT /admin/settings
  webhooks/
    stripe.webhook.ts         # POST /api/webhooks/stripe (raw body)
    datatrans.webhook.ts      # POST /api/webhooks/datatrans (raw body)

__tests__/
  payments.test.ts            # Unit + integration tests for routes
  payment-service.test.ts     # Unit tests for service facade
  stripe-service.test.ts      # Unit tests for Stripe provider
  datatrans-service.test.ts   # Unit tests for Datatrans provider
  receipt-service.test.ts     # Unit tests for PDF generation
```

### Frontend (web/src/)

```
app/dashboard/payments/
  page.tsx                    # Transaction log (admin)
  settings/
    page.tsx                  # Provider configuration (admin)
```

Plus integration into:
- Tournament registration flow (checkout redirect after fee)
- Homepage (donation widget)

## Database Schema

As defined in blueprint section 4:
- `payment_providers` — PSP configuration (Stripe/Datatrans, enabled, config JSON, testMode)
- `payment_use_cases` — which use cases are active (tournament_fee, survey_order, donation)
- `transactions` — every payment attempt with status tracking

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /api/payments/checkout | none (public) | Create checkout session |
| POST | /api/webhooks/stripe | none (signature verified) | Stripe webhook |
| POST | /api/webhooks/datatrans | none (HMAC verified) | Datatrans webhook |
| GET | /api/admin/payments/transactions | admin | Transaction log |
| POST | /api/admin/payments/refund/:id | admin | Issue refund |
| GET | /api/admin/payments/settings | admin | Get payment config |
| PUT | /api/admin/payments/settings | admin | Update payment config |
| GET | /api/payments/receipt/:id | authenticated | Download PDF receipt |

## Key Implementation Details

- Webhook routes registered BEFORE `express.json()` in index.ts
- Twint auto-filtered for non-CHF currencies
- Idempotency via `transactions.idempotencyKey`
- Partial refund tracking via `refundedAmount` column
- Receipt PDF: date, amount, purpose, nickname (no PII)
- Config JSON secrets masked in GET response (last 4 chars only)

## References

- Blueprint: `docs/blueprints/PAYMENTS.md` (full implementation details)
- Setup guide: `docs/guides/PAYMENTS_SETUP.md`
- Integration research: `docs/INTEGRATION_RESEARCH.md` (sections 1-2)
