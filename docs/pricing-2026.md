# 2026 pricing: what was built and how to roll it out

Branch `feat/pricing-2026` in three repos, each from `origin/staging`: `period-buddy-be` (backend), `period-buddy` (app) and `The-Nura-website`. Nothing has been deployed, no database has been changed, and no payment has been made.

## The pricing

| Plan | Price | Notes |
|---|---|---|
| Free | ₹0 | Tracking, predictions, logging, daily insights, Ask Nura AI within daily fair use, graphs dashboard, articles/videos, scheme discovery + tracking, community (incl. posting), voice/TTS, reminders, app lock, Forest, safety guidance, browsing doctors and fees |
| Nura Premium, monthly | ₹99 for 30 days | Saved AI chats, Document Vault & Chat, doctor-ready PDF reports, PCOS/endometriosis checker, enhanced symptom predictions, Partner Connect, Period Buddy matching, more AI messages per day |
| Nura Premium, yearly | ₹799 for 12 months | ≈ ₹66.58/month; ₹389 (32.7%) less than 12 × ₹99. Paid once |
| Founding member | ₹499 first year | **Off** until an admin switches it on. New Premium members only, once per account and per phone number, first 500 (configurable) and an optional end date. Then ₹799/year if they choose to continue |

| Add-on | 30 days | 12 months |
|---|---:|---:|
| Saved AI chat | ₹29 | ₹290 |
| Medical Document Vault & Chat | ₹39 | ₹390 |
| Doctor-ready PDF report | ₹19 | ₹190 |
| PCOS/endometriosis symptom checker | ₹29 | ₹290 |
| Enhanced symptom predictions | ₹19 | ₹190 |
| Partner Connect | ₹19 | ₹190 |
| Period Buddy matching | ₹19 | ₹190 |
| Community posting | Free | Free |

Every price is a database row an admin can change. `utils/pricing.js#PRICING_2026` is only what the migration script and the seeder write.

### Not sold, on purpose

| Item | Why |
|---|---|
| Voice check-in minute packs (₹99/15 min) and voice minutes in Premium | Call minutes aren't metered yet, and the Sarvam/Samvaad cost per minute isn't confirmed. The voice feature keeps its current admin setting. |
| Government scheme application help (₹49) | Today "Track this scheme" only saves a scheme to a list; nobody helps with an application. Saving is now free. The website says "Coming soon" and promises no approval. |
| Creator plan (₹299/₹2,999) | The tools don't exist yet. The website mentions it only as "Coming soon", with no price. |
| "Enhanced personal health-history access" | There is no separate feature for this to sell. |

## Decisions made with the safe default

1. **No auto-renewal.** The existing system sells prepaid periods; nothing charges again by itself, and all copy says so.
   - **Why:** true auto-renewal needs Cashfree Subscriptions (UPI Autopay / e-mandate), dashboard setup and RBI e-mandate rules.
   - **Founding offer:** "after the first year, ₹799/year if you choose to continue".
   - **Renewal reminders:** none exist yet, so no copy promises one.
2. **Prices include 18% GST** (`SubscriptionSettings.tax`). It's shown as "Includes 18% GST (₹15.10)". The company's GST registration and the correct rate need confirming with your accountant (see Blockers).
3. **Fair use is built but off** (`fairUse.enabled: false`). The proposed limits are below; the AI numbers are placeholders until real cost data exists.

   | Limit | Free | Premium |
   |---|---:|---:|
   | AI messages per day | 20 | 100 |
   | Documents per month | 2 | 2 |
   | Pages per document | 5 | 5 |
   | Doctor-report AI summaries per month | 1 | 1 |

4. **Existing subscribers keep what they paid for.** Entitlements store their own price and expiry, and the migration never touches them. Old plans stay on sale unless you run it with `--retire-old-plans`.

## What changed, by repo

### Backend (`period-buddy-be`)

**New files**

| File | What it does |
|---|---|
| `utils/pricing.js` | Every money rule, pure: catalog, yearly saving, GST, founding eligibility, renewal stacking, entitlement resolution, usage tier, fair-use limits, India-calendar periods |
| `utils/subscriptionPurchase.js` | Activation shared by verify, webhook and `/me` re-check; refund handling |
| `utils/usageQuota.js` + `models/UsageCounter.js` | Atomic per-user, per-period counters |
| `utils/documentPages.js` | Counts PDF pages (pdf-lib) |
| `utils/pricingMigration.js` + `scripts/applyPricing2026.js` | Dry-run-first migration |

**Changed models** (additive fields only; no data migration needed)

| Model | New fields |
|---|---|
| `SubscriptionFeature` | `yearlyPrice` |
| `SubscriptionPlan` | `family`, `promo` |
| `Entitlement` | `refunded` status, `refundedAt`, `isFoundingOffer`, index on `cashfreeOrderId` |
| `SubscriptionSettings` | `tax`, `fairUse`, `unitCostInr` |

**`subscriptionController.js`**
- New `GET /pricing`.
- `/order` gains:
  - yearly add-ons
  - founding eligibility (`403 OFFER_NOT_ELIGIBLE`)
  - no paying twice (`409 ALREADY_INCLUDED`)
  - no coupon on promo plans
  - GST-aware amount
- `/verify` uses the shared activation.
- `/me` adds `premium` and `usage`, and re-checks recent unpaid orders with Cashfree.

**Cashfree webhook.** `consultationController.cashfreeConsultationWebhook` now also routes `sub_…` orders and refunds. It's the same signed URL, so there's no new dashboard setup.

**Doctor report.** `reportController.getHealthReport` gains `includeAnalysis`. The AI summary is gated on `health_reports` access plus the monthly allowance; the free stats are unchanged.

**Fair-use middleware.** Added on `/questions/ask`, session messages, document chat/summarize, voice converse and document upload. The upload also checks the page limit. **Red-flag messages are never limited.**

**Admin**
- New allowlisted fields, merged field by field.
- `promo.redeemedCount` is read-only.
- New `GET /admin/subscriptions/usage` for usage and estimated cost.

**Seed data, docs and tests**
- The seed catalog uses the new prices; it only inserts missing rows, as before.
- Docs: `CLAUDE.md`, `docs/API_DOCUMENTATION.md` (new "Subscriptions & pricing" section), regenerated Swagger.
- New tests: `pricing.test.js` (13), `pricingMigration.test.js` (5), `documentPages.test.js` (2), `fairUseSafety.test.js` (3).

### App (`period-buddy`)

| File | Change |
|---|---|
| `lib/pricing.ts` (+ tests) | Rupees, saving, GST, add-on price per period, the pre-checkout disclosure, a fallback summary for older backends |
| `lib/api/subscription.ts` | `getPricing`, new types and fields; yearly add-on purchase |
| `lib/api/ai.ts` | `includeAnalysis`, `analysisLocked`, `analysisLimit` |
| `app/(app)/subscription.tsx` | Rebuilt pricing: Premium card with a Monthly/Yearly switch, founding card (only when eligible), add-ons per period ("In Premium" for members), "Good to know", `refunded` in history. Removed the misleading "Renews or expires" copy |
| `components/subscription/PurchaseConfirmSheet.tsx` | Amount, period, GST, no-auto-renew and founding renewal price before paying |
| `components/subscription/PaywallModal.tsx` | Never offers promo plans; passes the billing cycle to the disclosure |
| `hooks/useQaConversation.ts`, `lib/qaFallback.ts` | Explains the daily limit; a red flag still gets the offline safety answer |
| `graphs-reports.tsx`, `symptom-report.tsx` | `includeAnalysis: false`: stops an AI call that ran on every visit and was never shown |
| `lib/healthReport.ts`, `documents.tsx` | The PDF still downloads when the month's AI summary is used up, with a note |
| Docs | `CLAUDE.md`, `docs/API_REFERENCE.md`, `docs/WORKFLOW.md` §7 (new pricing contract row), this file |

### Website (`The-Nura-website`)

| File | Change |
|---|---|
| `src/pages/Pricing.jsx` | Rewritten. Reads `GET /api/subscriptions/pricing`, falling back to `src/lib/pricing.js`. Free vs Premium, an accessible Monthly/Yearly toggle (`aria-pressed`, 44px targets, focus ring), yearly shown as "paid once" with the monthly equivalent and saving. Founding banner only from live data. Add-on table (semantic `<table>`, "In Premium" tags). Professional section: verified profiles free during launch, clinician-set fees, consultations separate, creator plan "Coming soon", clinics by enquiry. FAQs on billing, renewal, yearly, GST, fair use, consultations, AI limits and privacy; AI disclaimer |
| `src/pages/Faq.jsx` | "Is Nura free?" now matches |
| `src/pages/Contact.jsx` | `?topic=partnership` preselects "Partnership / press" |
| `src/index.css` | Toggle, table and `.sr-only` styles |

The old page's per-feature prices (₹5–₹18) didn't match the backend catalog (₹39–₹199). Both now come from one source.

## Checks run

| Repo | Command | Result |
|---|---|---|
| Backend | `npm test` | **454 / 454 pass** (431 on staging, plus 23 new) |
| Backend | `npx eslint .`, `npx prettier --check src` | clean |
| Backend | Integration script against a throwaway local MongoDB (17 scenarios) | **17 / 17 pass** |
| Backend | `applyPricing2026.js` dry run, `--apply`, `--apply` again on a throwaway DB | Correct and idempotent; the founding offer stays off; entitlements untouched |
| App | `npm test` | **243 / 243 pass** (incl. the urgent-safety tests from the same branch) |
| App | `npm run lint`, `npx tsc --noEmit` | clean |
| Website | `npm run lint`, `npm run build` | clean, builds |

The integration script covered:
- the migration result and that it's idempotent
- that the free plan stays locked
- no founding offer while it's off, and the founding offer for an eligible user
- no promo plan in the paywall
- `409` for a feature Premium already includes
- existing members refused the founding offer
- no coupon with the founding offer
- a yearly add-on at its yearly price
- early renewal stacking after the current period
- duplicate activation being a no-op
- the founding counter counted once, and refused for the same phone number
- `/me` reporting no auto-renew
- refunded purchases unlocking nothing
- the fair-use limit, its refund on failure, and the urgent bypass
- the admin usage overview
- the founding counter being protected from admin edits

**Not run:**
- a real Cashfree payment (needs sandbox credentials and a real checkout)
- the app on a device
- the website in a browser: no headless browser here, so layout at phone and desktop widths is unverified
- an Android release build (needs EAS credentials)

## Blockers before production

| # | Blocker | Owner |
|---|---|---|
| 1 | **Google Play policy.** The app sells digital subscriptions through Cashfree. Play requires Google Play Billing for in-app digital goods, or enrolment in Play's alternative/user-choice billing for India, with its service fee and its UI rules. Consultations (a real-world service) are exempt. Decide before promoting Premium in the Android app. | Product + legal |
| 2 | **GST.** Confirm registration, the 18% rate and whether listed prices include it. Change `SubscriptionSettings.tax` if not. Invoices/receipts aren't generated today. | Finance / CA |
| 3 | **Consumer disclosure and refunds.** There is no written refund policy for subscriptions. Terms (website `/terms`) should cover prepaid periods, the founding offer and refunds before launch. Legal pages change only on request. | Legal |
| 4 | **Provider costs.** Set `unitCostInr` from real AI/OCR bills, then decide on the fair-use limits before switching them on. | Engineering + finance |
| 5 | **Cashfree webhook.** Confirm in the Cashfree dashboard (staging and production) that payment and refund webhooks are on and point at `/api/consultation/webhook/cashfree`. | Ops |
| 6 | **Content Studio UI** (`period-buddy-content`, someone else's uncommitted work there) doesn't yet show the new fields: `yearlyPrice`, `family`, `promo`, `tax`, `fairUse`, `unitCostInr`, usage. Until it does, the founding offer is switched on through the existing plan `isActive` toggle; the other fields are set via the admin API. | Engineering |

## Rollout checklist

**Staging**
1. Merge the backend branch into `staging` and deploy.
2. On the staging database: `node src/scripts/applyPricing2026.js` (dry run), review, then `--apply`. Add `--retire-old-plans` only if old plans should leave sale.
3. Check `GET https://stage.backend.thenura.care/api/subscriptions/pricing`.
4. Point a website preview at staging (`VITE_API_URL`) and check `/pricing` at 360px and desktop.
5. Run an app preview build against staging, then:
   - buy monthly and yearly Premium and a yearly add-on in **Cashfree sandbox**
   - buy again early and confirm the new period starts after the current one
   - confirm an add-on Premium includes can't be bought
   - kill the app mid-payment and confirm the webhook activates it
6. Switch the founding offer on in staging (approval flow). Check eligibility with a new user, an existing member and a shared phone number, then switch it off.
7. Switch fair use on in staging with tiny limits. Check the 429 message in Nura AI, that a red-flag question still gets 112 guidance, the 5-page document limit and the report-summary limit. Then switch it off.

**Production** (each step needs an explicit go-ahead)
1. Resolve the blockers above, Play billing first.
2. Deploy the backend, then run the migration dry run on production and review it with the team before `--apply`.
3. Deploy the website after the migration, so `/pricing` and the API agree.
4. Ship the app build. Older app builds keep working: the new fields are optional, and the backend defaults `includeAnalysis` to true.
5. Turn subscriptions on (`subscriptionEnabled`) only when ready. The founding offer and fair use stay off until separately approved.
