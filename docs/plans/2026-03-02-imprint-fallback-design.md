# Imprint Fallback Design

**Date:** 2026-03-02
**Status:** Approved

## Problem

When no legal settings are configured, the imprint page (`/imprint/`) renders essentially blank. In DACH countries (Germany, Austria, Switzerland), a missing or incomplete Impressum is a legal liability and a common attack vector for Abmahnungen (cease-and-desist letters).

## Solution: Smart Fallback with Cascading Data Sources

### Data Cascade

When legal-specific fields are empty, fall back to other available settings:

| Legal Field | Fallback Source |
|---|---|
| `legal_org_name` | `club_name` |
| `legal_email` | `contact_info` (if it looks like an email) |
| `legal_phone` | _(no fallback, show placeholder)_ |
| `legal_address` | _(no fallback, show placeholder)_ |
| `legal_responsible` | _(no fallback, show placeholder)_ |

### Placeholder Strategy

Required fields that have no data at all display a translated placeholder:
- DE: "wird ergänzt"
- EN: "to be completed"
- FR: "sera complété"

### Legal Header

Add a jurisdiction-appropriate legal reference header:
- "Angaben gemäß §5 DDG, §5 ECG, Art. 3 OR"
- This signals legal compliance intent and covers DE/AT/CH.

### Contact Notice

When the imprint is incomplete (any required field is missing), show a small notice at the bottom:
- DE: "Dieses Impressum wird derzeit vervollständigt. Für Anfragen kontaktieren Sie uns bitte unter [best email]."
- EN: "This imprint is being completed. For inquiries please contact [best email]."
- FR: "Les mentions légales sont en cours de finalisation. Pour toute demande, contactez-nous à [best email]."

The "best email" cascades: `legal_email` → `contact_info` (if email) → `dpo_email` → omit sentence.

### What Counts as "Incomplete"

An imprint is incomplete when any of these required fields (after cascade) is still empty:
- Organization name
- Address
- Contact email
- Responsible person

### Scope

**In scope:**
- Modify `web/src/app/imprint/page.tsx` to add fallback logic
- Add new i18n keys for placeholders, legal header, and notice text

**Out of scope:**
- Admin dashboard warning (future enhancement)
- Privacy page fallback (separate task)
- Server-side changes (none needed — all settings already exposed via GET /api/settings)

## Files to Modify

1. `web/src/app/imprint/page.tsx` — add fallback logic, legal header, notice
2. `web/src/lib/i18n.ts` — add new translation keys
3. `web/src/app/imprint/page.test.tsx` — new test file for fallback scenarios (TDD)
