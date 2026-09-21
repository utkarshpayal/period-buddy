# Product Requirements Document — The Nura App

**Status:** living document, describing the product as currently built and
shipping. Unlike a pre-development PRD, this doubles as the requirements
baseline for future feature work — treat any gap between this doc and the
actual app as a bug in the doc, not the app (update this file in the same
change that changes behavior, same rule as `CLAUDE.md`).

## 1. Problem statement

Most period-tracking apps do one job: log a period, guess the next one.
That leaves several real needs unmet for the people who use them:

- Questions about symptoms, hygiene, sex, and body changes go unanswered
  outside an awkward doctor visit, or get answered by unreliable search
  results.
- Health data (logs, lab reports, prescriptions) stays trapped in the app —
  there's no way to hand a doctor something useful.
- Partners who want to support someone through their cycle have no way to
  understand what's happening or what would actually help, beyond being
  told directly.
- Consistency (logging daily, building healthy habits) has no built-in
  reward, so engagement drops off.
- In India specifically, real government reproductive/menstrual-health
  benefits exist but are largely undiscoverable — no consumer app connects
  users to them.

**The Nura App is a full women's health companion, not just a calendar with
a red dot** — cycle tracking is the entry point, not the whole product.

## 2. Goals

1. Make cycle tracking accurate and effortless (predictions personalized to
   the user's own history, a fast multi-category daily log).
2. Answer real health questions in plain language, privately, at any hour —
   via Nura AI — while being explicit about what needs a real clinician.
3. Turn tracked data into something actionable: doctor-ready reports, real
   video consultations, and partner guidance that's specific rather than
   generic.
4. Make consistency rewarding (Forest, streaks, Care Points) instead of a
   chore.
5. Connect users to real support: peer community, a matched "buddy," and —
   distinctively — real government health schemes they may be eligible for.
6. Do all of the above with privacy as a default, not an afterthought
   (opt-in partner sharing, anonymous-friendly community, app lock).

### Non-goals

- The app does not diagnose. Every AI/clinical-adjacent feature (symptom
  checker, Nura AI, document analysis) is framed as education/screening
  that points toward a clinician, never a replacement for one.
- No on-device ML/health-sensor fusion (no Apple Health/Health Connect
  integration is currently in scope — see `CLAUDE.md`'s note on this having
  been deliberately removed rather than shipped half-built).
- Not a general-purpose women's social network — Community is scoped to
  health/wellbeing topics.

## 3. Target users

- **Primary:** people who menstruate, tracking their cycle for general
  health awareness, symptom management, trying-to-conceive, or avoiding
  pregnancy.
- **Secondary — Partners:** a connected partner who wants visibility into
  what their partner has explicitly chosen to share, and concrete guidance
  on how to support them (read-only "viewer" role, not a data-owner
  account).
- **Geography:** built India-first — 11 Indic languages + English
  throughout (chat, blogs, voice), government-scheme content scoped to
  Central + Rajasthan state schemes (architected to extend to other
  states), phone-based outbound calling and OTP flows suited to Indian
  carriers.

## 4. Scope

### In scope (shipped)

| Area | Summary |
|---|---|
| Cycle tracking & predictions | Calendar, multi-category daily log, phase/period/ovulation predictions with confidence bands, symptom predictions, daily insights, graphs & reports |
| Nura AI | Topic-scoped and general chat, text + voice, personalized to the asker's own cycle data, knowledge-base-first with AI fallback |
| Voice agent | In-app conversational logging (structured JSON action contract) + real outbound "check-in call" phone calls, one-off or recurring |
| Medical documents | Upload, OCR extraction, AI summarize, AI chat-over-documents |
| Doctor consultations | Browse doctors, book, pay, video-call, in-app messaging |
| Partner mode | Invite/connect, granular sharing permissions, AI-assisted care suggestions, dedicated partner UI (overview/chat/voice/forum/account) |
| Community | Anonymous-friendly forum, polls, likes/comments/reports with auto-hide |
| Peer support | Buddy matching/nomination, buddy chat |
| Content | Blogs, video reels, Health Issues hub, Hygiene, Sexual Wellbeing — all admin-authored via a separate Content Studio |
| Gamification | Wellness Forest (growth visual tied to consistency), Habits, streaks, Care Points wallet |
| Government schemes | Browse/search Central + Rajasthan reproductive-health schemes, eligibility checker, application tracking, nearest-facility lookup |
| Monetization | Per-feature/bundle subscriptions, coupon codes, Cashfree payments (cards/UPI/netbanking) |
| Notifications | Push (FCM) for partner/buddy/community activity, period/ovulation/daily-log reminders |
| Privacy/security | App Lock (PIN/biometric), opt-in-only partner sharing, anonymous community posting |
| Accessibility | Light/dark mode, 11-language support, Gen Z Mode (cosmetic) |

### Out of scope (explicitly, for now)

- Wearable/health-sensor integration (Apple Health, Health Connect).
- Multi-country government-scheme coverage beyond Central + Rajasthan.
- Any AI provider other than Sarvam AI (single-vendor by design — see
  backend `AI_ML_OVERVIEW.md`).
- Web push notifications (FCM covers native only in the current build).
- An in-app admin/moderation console (content and moderation currently
  route through the separate Content Studio and manual review, not an
  in-app admin surface).

## 5. Functional requirements by feature area

Each area below has a corresponding section in
[FEATURES.md](./FEATURES.md) with the full user-facing behavior; this
section states the *requirement*, not the UI copy.

- **Onboarding:** a user must be able to create an account (email+OTP or
  Google), and the app must collect enough (cycle length, last period date,
  tracking goal) to generate a first prediction without additional input.
- **Logging:** a user must be able to record, for any date (past or
  present), any subset of: flow, mood, energy, symptoms, sleep, water,
  weight, temperature, stress, medication, digestion, skin, discharge,
  exercise, intimacy, and a free-text note — with no field required beyond
  what the user chooses to log.
- **Predictions:** must be derived from the user's own logged period
  episodes, not solely from a static configured date, and must
  communicate reduced confidence when data is sparse or stale, rather than
  presenting a guess as fact.
- **Nura AI:** must never present an AI answer as medical fact without a
  clinician-referral framing where relevant; must gate 18+ topics; must
  degrade to a non-AI knowledge base and static fallback if the AI vendor
  is unavailable.
- **Partner sharing:** every category of shared data must be an explicit,
  individually toggleable opt-in; nothing is shared by default on connect.
- **Payments:** any premium feature must be enforced server-side (client-
  side checks are UX-only, never the actual gate); a failed/abandoned
  payment must never leave the user in a state that looks paid but isn't,
  or vice versa.
- **Notifications:** a user must be able to disable any reminder category
  independently; a disabled category must never fire.
- **Government schemes:** eligibility results must never claim a
  guarantee — "may be eligible" only, with a link to verify officially.

## 6. Non-functional requirements

- **Privacy:** anonymous-by-choice community posting; partner data sharing
  is granular and opt-in; App Lock available on top of account auth;
  sensitive local config (Firebase keys, `.env`) never committed.
- **Reliability:** every AI-dependent feature has a defined non-AI fallback
  (see `AI_ML_OVERVIEW.md` §8); payment flows handle the
  pending/failed/timeout states explicitly, not just the happy path.
- **Performance:** a shared, reference-counted WebSocket instead of
  per-screen sockets; cached dashboard/subscription fetches instead of
  refetching on every screen visit; bounded/paginated queries on every list
  endpoint.
- **Platform support:** iOS, Android, and Web from one Expo codebase;
  responsive layouts, with a couple of native-only conveniences (biometric
  App Lock, push notifications) that degrade gracefully on web.
- **Localization:** English + 10 Indic languages across chat, blogs, and
  voice — a single supported-language list shared by every feature that
  needs one.
- **Accessibility:** icon-only controls carry accessible labels; loading/
  error/empty states are consistent, branded components rather than ad hoc
  per-screen implementations.

## 7. Monetization

Feature- and bundle-level subscriptions, priced and toggled free/premium
from the separate Content Studio admin portal, enforced by one server-side
route registry (never inferred client-side). Coupon codes (percentage or
flat, with total and per-user redemption limits, enforced atomically)
apply across both subscription and consultation purchases. Payments run
through Cashfree (cards, UPI, netbanking); a 100%-off coupon skips
checkout entirely and activates instantly.

## 8. Dependencies

- **Sarvam AI** (`api.sarvam.ai` + `apps.sarvam.ai`) — the sole AI/voice
  vendor; every AI feature's availability depends on this one integration.
- **Cashfree** — payments.
- **AWS S3** — file storage (avatars, documents, reels, blog media).
- **Firebase Cloud Messaging** — push notifications.
- **MongoDB** — the single shared datastore across this app, the backend,
  and the Content Studio.
- **Content Studio** (`period-buddy-content`, separate repo) — the only
  way blogs/reels/Q&A/schemes/pricing get authored; this app is read-only
  over that content.

## 9. Risks

- **Single AI vendor.** An outage or pricing change at Sarvam affects six
  distinct feature areas at once (mitigated by fallbacks, but fallbacks are
  a degraded experience, not parity).
- **Scheduled jobs need explicit ops attention.** Recurring check-in calls
  and daily reminders rely on either an in-process interval (single-
  instance only) or an external scheduler that must be provisioned —
  silently misconfigured, the symptom is "nothing fires," not an error (see
  backend `README.md`).
- **Government-scheme content currency.** Eligibility/scheme details are
  admin-authored and can drift from the real government program if not
  kept current — the "may be eligible, verify officially" framing exists
  specifically to bound this risk.
- **Cross-repo drift.** Frontend, backend, and Content Studio are three
  separate repos sharing one database/contract — a schema or contract
  change in one requires coordinated updates across the others.

## 10. Success metrics

Not currently instrumented with a dedicated analytics doc — the natural
proxies available today are: daily tracking streak retention, Nura AI
session volume/repeat usage, consultation booking conversion, subscription
conversion/renewal rate, partner-connect adoption, and community
posting/engagement volume. Formalizing these into a tracked KPI dashboard
is open future work, not yet implemented.

## Related docs

- [FEATURES.md](./FEATURES.md) — the user-facing behavior this PRD requires.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — how it's built.
- [API_REFERENCE.md](./API_REFERENCE.md) — the contract between frontend and backend.
- [SETUP.md](./SETUP.md) — environment/dependency setup.
