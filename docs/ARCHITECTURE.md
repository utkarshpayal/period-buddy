# The Nura App — Architecture Overview

A high-level map of how the whole product fits together: two repos, one
database, one AI vendor. For per-file implementation detail, see each
repo's `CLAUDE.md` (kept in sync with the code on every architectural
change) — this doc is the "how the pieces connect" picture that sits above
that detail.

## System diagram

```
┌─────────────────────────────┐        ┌──────────────────────────────────┐
│   The-Nura-App (frontend)    │        │   The-Nura-Backend (backend)      │
│   Expo Router / React Native │  HTTPS │   Node.js + Express                │
│   iOS · Android · Web        │───────▶│   period-buddy-be                  │
│                               │◀───────│                                    │
│  lib/api.ts — the ONE file   │  WS    │  routes/ → controllers/ → models/  │
│  that talks to the backend   │───────▶│  One WebSocket server shares the   │
└───────────────┬───────────────┘        │  same HTTP server                 │
                │                        └──────────────┬─────────────────────┘
                │ push (FCM)                             │
                ▼                                        ▼
        ┌───────────────┐                        ┌───────────────┐
        │ Firebase Cloud │                        │   MongoDB      │
        │ Messaging      │                        │  (Mongoose)    │
        └───────────────┘                        └───────┬───────┘
                                                            │
                        ┌───────────────────────────────────┼───────────────────────┐
                        │                                   │                       │
                        ▼                                   ▼                       ▼
                ┌───────────────┐                  ┌────────────────┐     ┌──────────────────┐
                │  Sarvam AI     │                  │  Cashfree        │     │  AWS S3            │
                │  api.sarvam.ai │                  │  payments        │     │  file uploads       │
                │  (chat/STT/TTS/│                  │  (subscriptions, │     │  (avatars, docs,    │
                │  translate/OCR)│                  │  consultations)  │     │  reels, blogs)      │
                └───────────────┘                  └────────────────┘     └──────────────────┘
                        │
                        ▼
                ┌───────────────────┐
                │ apps.sarvam.ai     │
                │ Instant Outbound   │
                │ ("Samvaad") — real │
                │ phone calls        │
                └───────────────────┘
```

Two separate git repositories, two separate deployments, one shared
MongoDB. The frontend never talks to MongoDB, Sarvam, Cashfree, S3, or FCM
directly — every one of those goes through the backend's `/api/*` surface.
(FCM is the one exception in the diagram: the backend sends the push, but
the frontend registers its own device token and receives the push directly
from Firebase, not through the backend.)

## The two repos

### `The-Nura-App` (this repo) — frontend

- **Stack:** Expo Router v6 (file-based routing), React Native, NativeWind
  (Tailwind for RN), TypeScript.
- **Targets:** iOS, Android, and Web from one codebase — builds go through
  EAS (`eas build`), not a local Xcode/Android Studio pipeline.
- **Data layer:** exactly one file, `lib/api.ts`, owns every HTTP call to
  the backend. See [API_REFERENCE.md](./API_REFERENCE.md) for the full
  endpoint list it wraps.
- **State:** React Context providers (`ThemeProvider`, `AuthProvider`,
  `AppLockProvider`, `GenZModeProvider`, `AppStateProvider`,
  `PartnerViewStateProvider`) rather than Redux/Zustand — see `app/_layout.tsx`
  for the exact nesting order.
- **Realtime:** a single shared WebSocket connection (`hooks/useRealtimeSocket.ts`),
  reference-counted per "room" so multiple screens subscribing to the same
  room (e.g. `community`) share one socket instead of opening duplicates.
- **No local ML, no local persistence beyond AsyncStorage** (auth session,
  theme, app-lock PIN hash, a few cosmetic preferences) — everything else
  is a live fetch from the backend.

### `period-buddy-be` / `The-Nura-Backend` — backend

- **Stack:** Node.js, Express 4, Mongoose/MongoDB, plain JS (not TypeScript).
- **Layering:** `routes/` (Express routers, one per domain) → `controllers/`
  (request handling) → `models/` (Mongoose schemas). `schemas/` holds
  express-validator request validation where it exists.
- **Auth:** JWT bearer tokens, verified per-request in `middleware/authMiddleware.js`.
  A global feature-gate middleware (`middleware/subscriptionMiddleware.js` +
  `config/subscriptionRouteRegistry.js`) enforces the paywall before a
  request ever reaches its controller, driven by one registry file rather
  than scattered inline checks.
- **Realtime:** one WebSocket server (`config/websocket.js`) sharing the
  same HTTP server the REST API runs on. Every authenticated connection is
  auto-joined to a personal `user_<userId>` room; feature-specific rooms
  (`community`, `partner_<id>`, `buddy_<roomKey>`, `consultation_<id>`) are
  joined/left explicitly by clients.
- **Scheduled jobs:** two recurring features (auto check-in calls, daily
  reminders) are driven by a tick endpoint, fired either by an in-process
  interval (`utils/inProcessScheduler.js`, the default — fine for one
  running instance) or an external scheduler (AWS EventBridge) hitting a
  shared-secret-authenticated HTTP endpoint once the deployment scales past
  one instance. See the backend's `README.md` → "Scheduled jobs".
- **AI:** every AI/ML feature is one vendor, Sarvam AI, wrapped by
  `utils/sarvamClient.js`. Full breakdown in `AI_ML_OVERVIEW.md`.
- **Payments:** Cashfree (orders → checkout → webhook verify), used for
  both subscription purchases and doctor consultation bookings, sharing the
  same order-creation/verification shape in `utils/cashfreeClient.js`.

### Where content is authored

A **third** system, `period-buddy-content` (the "Content Studio," not in
this workspace), is the admin web portal where non-engineers manage blogs,
reels, Q&A knowledge-base entries, subscription pricing, coupons, and
government schemes. It writes to the same MongoDB the backend reads from —
the mobile/web app is read-only over that content.

## Data flow: a typical request

```
User taps "Log period" on Home
  → DayDetailsModal collects flow/symptoms/mood/etc.
  → cycleApi.saveLog(payload)                         (lib/api.ts)
  → POST /api/cycle/log  { Authorization: Bearer <jwt> }
  → authMiddleware verifies the JWT
  → globalFeatureGate checks subscriptionRouteRegistry.js (this route isn't gated — free)
  → cycleController.upsertCycleLog()
      - derives cycleDay/phase via computeCyclePredictions (utils/cycle.js)
      - atomically upserts the CycleLog document
      - credits wallet tokens only on a truly new day's log (race-safe)
      - recomputes the tracking streak
  → response: { cycleLog, tokensEarned, isNewLog, phase }
  → frontend updates local state, shows the new streak/tokens
```

## Data flow: an AI feature (Nura AI chat)

```
User sends a message in a topic-scoped chat
  → questionAnswerApi.sendSessionMessage()
  → POST /api/questions/sessions/:id/messages
  → chatSessionController → companionChat.js#generateCompanionAnswer()
      1. urgent-safety regex check
      2. topic-scope classifier (separate LLM call, YES/NO only)
      3. knowledge-base keyword match (MongoDB, no AI)
      4. LLM answer, personalized with the asker's own cycle data
      5. local fallback if the LLM call itself fails
  → Sarvam AI (api.sarvam.ai/v1/chat/completions) — only reached if step 3 found nothing
  → response persisted to the ChatSession, returned to the client
```

Full detail on every AI-touching flow (voice agent, document OCR, outbound
calls, translation, health-report analysis) is in the backend's
`AI_ML_OVERVIEW.md`.

## Deployment

- **Frontend:** EAS Build profiles (`eas.json`) produce installable
  Android/iOS builds; `EXPO_PUBLIC_API_BASE_URL` is baked in at build time
  per profile (dev/preview/production each point at a different backend
  URL). Web is served as a static Expo web export. `app.json` is the source
  of truth for app identity/config.
- **Backend:** a standard Node HTTP server (`index.js`), deployed behind
  whatever reverse proxy/host terminates TLS in front of it (`API_BASE_URL`
  must be a public HTTPS URL for Sarvam's outbound-call webhook and
  EventBridge scheduler callbacks to reach it). Graceful shutdown drains
  WebSocket clients and in-flight HTTP requests before closing the DB
  connection.
- **Database:** one MongoDB instance/cluster shared by the backend and the
  Content Studio admin portal.

## Related docs

- [FEATURES.md](./FEATURES.md) — what the product does, screen by screen.
- [SETUP.md](./SETUP.md) — get both repos running locally.
- [API_REFERENCE.md](./API_REFERENCE.md) — every endpoint the frontend calls.
- Backend `AI_ML_OVERVIEW.md` — every AI/ML flow in detail.
- Backend `API_DOCUMENTATION.md` — the backend's own endpoint reference.
- Each repo's `CLAUDE.md` — the living, most-detailed technical doc; if
  anything here ever disagrees with a `CLAUDE.md`, trust `CLAUDE.md`.
