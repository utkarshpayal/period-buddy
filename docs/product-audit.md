# Product audit: Nura mobile app

Audit of `period-buddy` (Expo SDK 54 app) on 2026-10-24, branch `docs/product-audit` from `origin/staging` at `8f0b52c` (v1.1.7).

**Scope and limits**

- This repo was read in full at the architecture level (`CLAUDE.md`, `docs/`, `app/`, `lib/`, `components/`, `hooks/`). The screens and helpers named below were checked line by line.
- `period-buddy-be` (backend) was read **only**, never changed. It has a colleague's uncommitted work on `fix/hindi-urgent-safety` (`companionChat.js`, `documentController.js`, `voiceAgentController.js`). Backend findings here come from targeted reads, not a full review.
- Not inspected: the doctor portal, admin/CMS portals (`the-nura-care-cms`, `period-buddy-content`) and the website. Not run: a device or emulator build, or the backend's own tests.
- Payments use **Cashfree**, not Razorpay as the brief assumed. There is no Razorpay code.
- `docs/fixes.md` is an earlier review (2026-09). Most of its items are now fixed (see §8). It's not repeated here.

Priority key: **P0** critical (safety, data leak, payment integrity) · **P1** high · **P2** medium · **P3** later.

## 1. What exists today

Verified in code. File paths are in `CLAUDE.md`, which is accurate and current.

| Area | Status | Where |
|---|---|---|
| Sign-up / login (email + Google), revocable sessions, OS-keystore token | Complete | `app/(tabs)/`, `lib/sessionStore.ts`, `components/auth-context.tsx` |
| First-run setup: 5 short questions, resumable, prediction preview, notification soft-ask at the end | Complete | `components/onboarding/OnboardingFlow.tsx`, `lib/onboarding.ts` |
| Home dashboard: stats, week strip, cycle hero, quick log, insights, hub links, per-person layout | Complete | `app/(app)/(dashboard)/home.tsx`, `lib/homeLayout.ts` |
| Cycle tracking, predictions (late periods, fertile window, regularity from the server), calendar | Complete | `tracker.tsx`, `calendar.tsx`, `lib/cycle*.ts` |
| Daily logging: one-tap flow / symptoms / mood with Undo, full day log (flow, mood, symptoms, discharge, digestion, skin, exercise, stress, sleep, water, temperature, weight, notes) | Complete | `hooks/useQuickLog.tsx`, `components/DayDetailsModal.tsx` |
| Nura AI chat: sessions, topic scoping, 18+ topic gate, AI-consent switch, offline fallback, voice mode (EN/HI) | Complete | `app/(app)/qa*.tsx`, `hooks/useQaConversation.ts`, `hooks/useVoiceChat.ts` |
| AI safety: shared safety prompt, deterministic urgent short-circuit before any AI call, age bands | Complete (server) | backend `utils/aiSafety.js`, `utils/companionChat.js` |
| Symptom checker with emergency pre-screen | Complete | `symptom-checker.tsx`, `lib/redFlagScreen.ts` |
| Medical documents: private S3, 10-min signed links, owner-scoped queries, summaries, document chat, doctor-report PDF | Complete | `documents.tsx`, `components/documents/`, backend `documentController.js` |
| Consultations: doctors, slots, Cashfree pay + server verify + signed webhook, Jitsi video, chat, prescriptions, ratings, refunds | Complete | `consultation.tsx`, `components/consultation/`, backend `consultationController.js` |
| Subscriptions / paywall with coupons | Complete | `subscription.tsx`, `components/subscription/` |
| Reminders and push (FCM), neutral lock-screen text **on by default** (`hideNotificationDetails: true`) | Complete | `lib/notifications.ts`, backend `models/User.js` |
| Privacy: data export, device list, sign out everywhere, account deletion, screenshot blocking, no tracking under 18 | Complete | `privacy.tsx`, `lib/screenPrivacy.ts`, `lib/analyticsConsent.ts` |
| Help & support tickets | Complete | `support-ticket*.tsx`, `lib/support.ts` |
| Graphs & reports, symptom report, symptom predictions | Complete | `graphs-reports.tsx`, `symptom-report.tsx`, `symptom-predictions.tsx` |
| Partner Sync, community, Wellness Forest, Gen Z pack, reels, blogs, government schemes, habits, buddy nomination | Complete | see `CLAUDE.md` |
| Remote layout / launch states via CMS | Complete | `lib/appConfig.ts`, `components/AppConfigSync.tsx` |

## 2. Partially implemented

- **Check-in call "Call me now"**: `voiceAgentApi.checkinCall()` is still in `lib/api/` but no screen calls it (the button was removed on purpose). It's dead client code, which is fine if that's intended. (P3)
- **Doctor visit preparation**: the doctor-report PDF (`lib/healthReport.ts`) covers history and symptom counts, but there's no editable "questions for my doctor" list or per-booking share choice. (P2)
- **Play Store install referrer**: the website sets `referrer=deeplink=…`, but the app has no install-referrer reader, so a fresh install doesn't open the shared item. (P3)
- **Documents PDF on web**: there's a `.web` path in `DocumentPreview.tsx`. Not re-tested in a browser in this audit.
- **Hindi urgent detection**: on the backend this is in progress (uncommitted), and was missing from the app's offline fallback until this change.

## 3. Missing (verified absent)

- **Unified health timeline** of period events, logs, documents, AI summaries and consultations. Every piece exists on its own screen. (P2)
- **Weekly health summary** (in-app or push). Daily insights and Cycle Wrapped exist instead. (P2)
- **Product feedback with a rating.** Support tickets cover bugs and questions, and consultations have a session rating, but there's no app rating or feedback category with an optional screenshot. (P2)
- **Funnel analytics.** `lib/usage.ts` counts feature opens and taps only. There are no onboarding-started/completed, first-log or booking-funnel events. (P2, see the roadmap)
- **Quiet hours for push.** Check-in calls have quiet hours (backend `checkinCall.js`). Not found for other pushes; the daily scheduler's send time was not verified. (P2)
- **Skipping the birthday in onboarding.** It's required, because it drives the 13+ gate, under-18 AI rules and no tracking for minors. Product decision, see §5.

## 4. Broken or unreliable flows

- **P0, fixed in this change: urgent Nura AI replies had no way to call.** When the backend returns its urgent reply (`source: "urgent_safety"`), `components/qa/QaMessageBubble.tsx` showed red text saying "call 112 now" with no button. Someone in an emergency had to read, remember and dial the number. The bubble now has one-tap **Call 112** and **Tele-MANAS 14416** buttons.
- **P0, fixed in this change: the offline Nura AI fallback under-escalated.** `lib/qaFallback.ts` used bare keywords, which missed several red flags:
  - "bleeding after sex"
  - "passed out"
  - "pregnant with cramps"
  - "fill a pad every hour"
  - any Hindi/Hinglish phrasing

  It also gave an older urgent reply that left out bleeding after sex or after menopause. It now runs the backend's patterns first (`lib/urgentSafety.ts`) and keeps the old keywords as well. That keeps offline mode at least as cautious as before.
- **P1, backend: urgent pattern word order.** `hasUrgentPattern` matches "soaking … pad" but not "pads are soaked through". Recommended backend fix; the app mirrors the backend, so it shares the gap.
- **P1: voice mode and document chat show no call button.** The backend's deterministic urgent check runs in all three AI paths: companion chat, voice (`voiceAgentController.js`, `replyType: "urgent_safety"`) and document chat (urgent text prefixed to the reply). But the app only acts on it in the text chat:
  - `lib/api/ai.ts` doesn't type `replyType`.
  - `VoiceModeOverlay` just speaks the reply.
  - Document chat gets no flag at all.

  Proposed fix: type `replyType` and show the same buttons in the voice overlay; in document chat, run `isUrgentQuestion` on the user's own message.

## 5. UX problems

- **Onboarding asked for a birthday with no reason given** (P1, fixed: one line now explains it's used to fit advice and answers to your age). Making it skippable needs a product and legal decision: without it the backend treats the user as "unknown age" (more conservative AI answers), and the 13+ gate can't run.
- **The urgent reply is long** (about 90 words covering every red flag). In a real emergency, the call button matters more than the text. That's now fixed, but a shorter reply matched to what the person said would read faster. (P2, backend copy)
- Earlier UX items from `docs/fixes.md` (duplicate language picker, bare loaders, silent hygiene errors) were checked and are resolved.

## 6. Technical debt

- **Safety patterns are duplicated in two repos** (`lib/urgentSafety.ts` ↔ backend `companionChat.js`), with a "keep in sync" note in both places. A shared package would be overkill for one file. A cheaper option is a fixture of phrases both repos' tests run against. (P2)
- Five screens still hand-roll the paywall wiring that `FeatureGate` now covers (`document-chat`, `checkin-call`, `documents`, `qa-history`, `government-scheme-detail`). It works; convert them when those files are next touched. (P3)
- Older lists hand-roll paging instead of `usePaginatedList` (blogs, government-schemes, scheme-applications, documents). (P3)
- `lib/notifications.ts:85` logs unconditionally on simulators. Harmless. (P3)

## 7. Security and privacy

Verified good:

- The token is in the OS keystore, sessions are revocable, and a 401 is handled globally.
- Documents are owner-scoped (`findOne({ _id, userId })`) with signed 10-minute URLs.
- Cashfree webhooks check `x-webhook-signature`, and payment success is decided server-side (`lib/paymentVerify.ts` never treats a client or network answer as paid).
- Rate limiters exist (`middleware/rateLimiters.js`), and upload size limits are set.
- Lock-screen privacy is on by default, screenshot blocking is available, there's no analytics under 18, and a 403 consent gate covers AI.
- `audit-ci` runs in CI.

Open, not fixed here:

- **Sarvam check-in-call webhook is public** (Sarvam offers no request signing). It's mitigated: the backend only trusts a signed per-call JWT echoed in `metadata.callToken` (`voiceAgentController.js#checkinCallWebhook`). Low residual risk; add an IP allowlist if Sarvam publishes ranges. (P3)
- **The offline AI fallback is local and keyword-based.** It's safe by design (it only escalates or gives generic copy), but it's not clinician-reviewed. (P2)
- **DPDP Act 2023 readiness** (consent notices, a grievance officer, a breach process) is a legal and process question this audit can't certify. The engineering controls above help but don't make the app compliant on their own.

## 8. Performance

No new performance issues were measured. The earlier ones from `docs/fixes.md` are addressed:

- Duplicate dashboard fetches are de-duplicated by `lib/queryCache.ts` (15 s).
- The tracker uses one `?year=` request.
- Realtime logs are `__DEV__`-only.

Real-device profiling (Android low-end) was not done.

## 9. Ranked recommendations

| # | P | Change | Status |
|---|---|---|---|
| 1 | P0 | Call buttons on urgent AI replies | **Done** |
| 2 | P0 | Offline urgent detection = backend patterns + Hindi | **Done** |
| 3 | P1 | Call buttons in voice mode and document chat too | Proposed (app only, next task) |
| 3b | P1 | Backend: word-order gap in urgent patterns ("pads soaked") | Proposed (backend, coordinate with `fix/hindi-urgent-safety`) |
| 4 | P1 | Explain why the birthday is asked | **Done** |
| 5 | P1 | Shared urgent-phrase fixture tested in both repos | Proposed |
| 6 | P2 | Privacy-safe funnel events (onboarding, first log, booking) | Proposed (roadmap) |
| 7 | P2 | Product feedback with rating + category in Help & support | Proposed |
| 8 | P2 | Doctor-visit prep: editable questions list attached to a booking, user picks what's shared | Proposed |
| 9 | P2 | Unified timeline (read-only, paged, user vs AI labelled) | Proposed |
| 10 | P2 | Quiet hours for all pushes | Proposed (backend) |
| 11 | P3 | Install referrer for deferred deep links; `FeatureGate` / `usePaginatedList` cleanups | Later |

Details (problem, evidence, files, effort, risk, tests) are in `docs/improvement-roadmap.md`.
