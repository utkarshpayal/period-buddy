# Setup & Contributing Guide

How to get both repos running locally, what each environment variable
does, and the conventions this project follows.

## Prerequisites

- Node.js (LTS) and npm
- A MongoDB connection string (Atlas free tier works fine for local dev)
- Expo CLI comes via `npx expo` — no global install needed
- For native builds: an [EAS](https://expo.dev) account (`eas build`); not
  needed for web-only dev

## 1. Backend (`period-buddy-be` / `The-Nura-Backend`)

```bash
cd The-Nura-Backend
npm install
cp .env.example .env    # then fill in the values below
npm run dev              # nodemon index.js — auto-restarts on change
```

Runs on `http://localhost:5000` by default (`PORT` in `.env`); the app's dev build looks for it on 5001, so set `PORT=5001`.

### Required to boot at all

| Variable | What it's for |
|---|---|
| `MONGODB_URI` | Your MongoDB connection string. Use a **development** database, never the production one: a laptop should not be able to reach real health data. |
| `JWT_SECRET` | Signs/verifies auth tokens. Must be ≥32 characters — the server refuses to start in production with a short/missing one (validated at boot in `utils/jwt.js`); in dev it only warns. |

Everything else below is **optional** — each integration degrades
gracefully (logs a warning, returns 503, or skips the feature) rather than
crashing the server when its keys are absent. Fill in only what you
actually need to test.

### Auth & security

- `JWT_EXPIRE` (default `7d`), `BCRYPT_ROUNDS`, `LOG_LEVEL`
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist in production; ignored
  (all origins reflected) outside production
- `RATE_LIMIT_ENABLED` / `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS`
  — the general `/api` limiter; auto-on in production
- `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` — the stricter limiter
  on login/signup/OTP endpoints
- `DATA_ENCRYPTION_KEYS` — field-level encryption key(s), `<id>:<base64 of 32
  bytes>`. Optional in dev, **required in production** (the server won't
  start without it). Generate one with
  `node -e "console.log('k1:' + require('crypto').randomBytes(32).toString('base64'))"`.
  Never reuse the production key locally.
- `AI_CONSENT_ENFORCED`, `STAFF_2FA_ENABLED`, `STAFF_COOKIE_AUTH`,
  `STAFF_SESSION_TTL`, `LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`,
  `ACCOUNT_PURGE_AFTER_DAYS` and the `*_RETENTION_DAYS` keys — see the
  backend's `docs/SECURITY.md`; the defaults are fine for local work.

Production doesn't use a `.env` file: its values live in AWS Secrets Manager
(`nura/api/env`, see the backend's `docs/INFRASTRUCTURE.md` §7).

### Email (OTP, newsletter, contact form)

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
  `CONTACT_RECEIVER_EMAIL` — leave blank in dev; emails are logged to the
  console instead of actually sent when SMTP isn't configured
- `OTP_EXPIRY_MINUTES` (default 10)

### Google Sign-In

- `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`,
  `GOOGLE_EXPO_CLIENT_ID` — OAuth client IDs from the
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials);
  only fill in the ones for platforms you're actually building for. The
  frontend has matching `EXPO_PUBLIC_GOOGLE_*` values that must correspond
  to the same OAuth clients.

### File uploads (AWS S3)

- `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `AWS_S3_PUBLIC_URL_BASE` — optional, only if serving the bucket through a
  CDN/custom domain

### AI (Sarvam)

- `SARVAM_API_KEY` — unlocks Nura AI chat, document OCR/summarize/chat,
  speech-to-text/text-to-speech, blog translation, health-report analysis,
  partner care suggestions. Get one at
  [dashboard.sarvam.ai](https://dashboard.sarvam.ai). Without it, every one
  of those features silently falls back to its non-AI path (see the
  backend's `AI_ML_OVERVIEW.md`).
- `SARVAM_CHAT_MODEL` / `SARVAM_TTS_MODEL` / `SARVAM_STT_MODEL` — model
  overrides, sensible defaults ship if unset.
- `SARVAM_TTS_SPEAKER` — the spoken-reply voice; always a female speaker
  (default `priya` on `bulbul:v3`). The app has no on-device TTS: all voice
  replies come from the backend's `/api/speech/synthesize`.
- Outbound check-in calls need a **separate** product/credentials:
  `SARVAM_OUTBOUND_API_KEY`, `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID`,
  `SARVAM_APP_ID`, `SARVAM_APP_VERSION`, `SARVAM_CONNECTION_ID`,
  `SARVAM_AGENT_PHONE_NUMBER` — plus `API_BASE_URL` set to a **public**
  HTTPS URL (Sarvam POSTs the call result to it; localhost won't work —
  use a tunnel like ngrok for local testing of this one feature).
- `SAMVAAD_CALL_TOKEN_TTL` (default 30m)

### Scheduled jobs (recurring check-in calls, daily reminders)

- `ENABLE_IN_PROCESS_SCHEDULER` (default `true`) — the backend ticks both
  jobs itself via an in-process interval, which just works for local dev
  and a single-instance deployment. Set to `false` only once you've wired
  up an external scheduler (see the backend `README.md`'s "Scheduled jobs"
  section) — required before scaling to more than one instance, or every
  instance will double-fire the same call/notification.
- `CHECKIN_CALL_SCHEDULER_SECRET` / `NOTIFICATION_SCHEDULER_SECRET` — only
  needed if `ENABLE_IN_PROCESS_SCHEDULER=false`.

### Payments (Cashfree)

- `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox` or
  `production`) — without these, `isPaymentConfigured()` returns false and
  purchase endpoints respond 503 rather than erroring unpredictably.

### Misc

- `ADMIN_APP_URL` — where the Content Studio admin portal lives (used in a
  couple of generated links).
- `API_BASE_URL` — this backend's own public URL; required for the Sarvam
  webhook and any external scheduler callback to reach it.

## 2. Frontend (`The-Nura-App`)

```bash
cd The-Nura-App
npm install
cp .env.example .env    # then fill in the values below
npx expo start           # press w for web, a for Android, i for iOS
```

| Variable | What it's for |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Which backend to use. On a phone, `localhost` is the phone itself, so use `http://<your computer's LAN IP>:5001` for a local backend, or leave it out: in `__DEV__` without it, `lib/api/` derives the host from the Expo dev server's own address on port 5001. Overrides `EXPO_PUBLIC_APP_ENV`. |
| `EXPO_PUBLIC_APP_ENV` | `prod` or `stage`: picks the backend from `app.json` → `extra.apiBaseUrls`. Unset: prod in a release build, the local backend in `__DEV__`. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID` / `_ANDROID_CLIENT_ID` / `_EXPO_CLIENT_ID` | Google sign-in OAuth client IDs; must match the backend's `GOOGLE_*_CLIENT_ID`. Optional: without them the app uses `app.json` → `extra.googleClientIds` (the real, public IDs; also in `.env.example` and `eas.json`). |

Two native config files (tracked in git; EAS builds use them) are needed for push notifications /
Google Sign-In on native builds, not for `web`/Expo Go dev:
`assets/google-services.json` (Android) and
`assets/GoogleService-Info.plist` (iOS) — see `CLAUDE.md`'s app-identity
section for how EAS Build sources these in the cloud.

## Running both together

Start the backend first (`npm run dev` in `The-Nura-Backend`), confirm it's
up (`curl http://localhost:5001/health`), then start the frontend
(`npx expo start` in `The-Nura-App`) pointed at it via
`EXPO_PUBLIC_API_BASE_URL=http://localhost:5001`. Web (`w`) is the fastest
loop for UI work; native builds are only needed when testing something
platform-specific (camera, biometrics, push notifications, native modules).

## Linting, formatting, and tests

```bash
# Backend
npm run lint            # eslint .
npm run lint:fix
npm run format           # prettier --write .
npm test                 # node --test src/**/__tests__/*.test.js

# Frontend
npm run lint             # expo lint
npx tsc --noEmit          # type-check (no dedicated script, run directly)
```

Both repos use a pre-commit hook (husky) — don't bypass it with
`--no-verify` unless you have a specific reason and say so in the commit.

## Conventions

- **Commit messages** — short, present-tense, describe the *why* over the
  *what* where it isn't obvious from the diff.
- **CLAUDE.md stays in sync** — both repos' `CLAUDE.md` files are living
  architecture docs; if a change touches routes, the API surface
  (`lib/api/`), providers, or the commands in this file, update the
  relevant `CLAUDE.md` section in the same change, not as a follow-up.
- **One file owns the API surface** — all frontend→backend calls go through
  `lib/api/`; don't `fetch()` the backend directly from a screen/component.
- **Feature gating goes through the registry** — a new premium backend
  route is added to `config/subscriptionRouteRegistry.js`, not an inline
  `requireFeatureAccess()` scattered per-route.
- **No new abstractions for a one-off change** — match the existing
  patterns in a file/domain rather than introducing a new pattern for a
  single call site.
- **Every AI call has a fallback** — if you add a new Sarvam-backed
  feature, it must degrade (not crash) when `SARVAM_API_KEY` is unset or
  the call fails; follow the pattern in `utils/sarvamClient.js`'s existing
  callers (`isAiConfigured()` gate + try/catch around the call).

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how the pieces fit together.
- [API_REFERENCE.md](./API_REFERENCE.md) — every endpoint the frontend calls.
- [FEATURES.md](./FEATURES.md) — what the product does.
- Backend `README.md` — deeper detail on scheduled jobs, FCM setup, and
  database indexes.
