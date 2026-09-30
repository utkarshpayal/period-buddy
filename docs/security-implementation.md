# Security implementation

Every security, privacy and safety feature The Nura has today, across all four repos:

- **App**: this repo, the Expo mobile app.
- **Backend**: `The-Nura-Backend`, `period-buddy-be`.
- **Admin**: `The-Nura-Admin-Website`, the Admin Workspace and clinician portal.
- **CMS**: `The-Nura-CMS`, the App CMS.

The app holds special-category health data: cycles, symptoms, sexual health, medical documents and AI chats. Everything below exists to protect it.

Related docs:
- `The-Nura-Backend/docs/SECURITY.md`: deploy steps, key rotation and the breach runbook.
- `The-Nura-Backend/docs/SECURITY_BACKLOG.md`: what's still to do.

Last updated: 30 September 2026.

---

## 1. At a glance

| Area | What protects it |
|---|---|
| Passwords | bcrypt hashing, strength rules, per-account lockout, IP rate limits |
| Sign-in | Revocable sessions, short staff sessions, an emailed code for staff and doctors, new-device email |
| Tokens | OS keystore on the phone; optional httpOnly cookie for staff in the browser |
| Health data in the database | AES-256-GCM field encryption of free text and screening answers |
| Medical documents | Private S3 folder, S3 server-side encryption, 10-minute signed links, opened on the device only |
| AI | An explicit consent switch; nothing is sent to the AI provider when it's off |
| Notifications | Neutral lock-screen text by default |
| On the phone | App lock, screenshot blocking, app-switcher blur, health drafts in the keystore |
| Staff | Role-based permissions, approval workflow, audit log, no access to health records |
| User rights | Download my data, delete account (erased after 30 days), sign out devices |
| Retention | Automatic deletion of old notifications, audit logs, usage data and (per person) AI chats |
| Logs | Secrets removed, emails and phones masked, health text never logged |
| Engineering | Security CI (audit, gitleaks, CodeQL), refusal to start with missing or weak keys |

---

## 2. Accounts and sign-in

### 2.1 Passwords
- **Hashing:** bcrypt with a salt per password, `BCRYPT_ROUNDS` (default 10). Backend: `utils/password.js`.
- **Never returned:** `User.password` is `select: false` and `toJSON()` strips it too.
- **Strength rule:** at least 8 characters, with a lowercase letter, an uppercase letter, a digit and a symbol (any non-alphanumeric character).
  - The backend enforces it: `validatePasswordStrength`.
  - The app's signup screen mirrors it as a live checklist: `lib/password.ts`.
- **Google-only accounts** have no password. A password login for one gets a clear "use Google" message instead of an error.
- **Changing the password** needs the current password. It then signs out every other device; this device gets a fresh session.

### 2.2 Signup and email verification
- No account exists until the email is verified. Signup data waits in `PendingSignup` with a hashed 6-digit code.
  - The code is generated with `crypto.randomInt` and hashed with bcrypt.
  - It expires after 10 minutes (`OTP_EXPIRY_MINUTES`).
  - At most 5 attempts per code, and a 30-second wait before a resend.
- **Roles at signup** are limited to `user` or `partner`. Staff, doctor and admin roles can't be self-assigned: `schemas/authSchema.js` checks this, and Google sign-up does too.
- Signup shows the "By continuing…" consent line with links to the Terms and Privacy Policy.

### 2.3 Google sign-in
- The Google ID token is verified server-side against the app's registered client IDs (`utils/googleAuth.js`).
- An existing local account with the same email is linked, not duplicated.
- Suspended accounts are refused. This is checked only after the token verifies.
- Staff and doctors can't use Google sign-in while two-step sign-in is on, because it would skip the code (§2.6).

### 2.4 Brute-force protection
- **IP rate limits** (`middleware/rateLimiters.js`, on by default in production):
  - General API: 500 requests per 15 minutes per IP.
  - Sensitive auth endpoints (login, signup, codes, deletion codes, the 2FA endpoints): 20 per 15 minutes per IP. Successful requests don't count.
  - Codes: also 20 per 15 minutes **per target email**, so changing IP doesn't help.
  - Every limit can be tuned by environment variable.
- **Per-account lockout** (`utils/loginSecurity.js`):
  - After `LOGIN_MAX_FAILURES` (5) wrong passwords in a row, the account is locked for `LOGIN_LOCK_MINUTES` (15).
  - During the lock, login answers `429` with the minutes left, and the password isn't even checked.
  - A correct password resets the counter.
- **No account probing:** a suspended account is only revealed after the correct password. A wrong email and a wrong password get the same "invalid credentials" answer.

### 2.5 Sessions
- **Revocable sessions** (`utils/sessions.js`):
  - Every login creates a `UserSession` row, and the JWT carries its id (`sid`).
  - Only a SHA-256 hash of the id is stored.
  - Each request checks that the session still exists, isn't revoked, isn't expired and belongs to the user.
- **Session length:** app sessions last `JWT_EXPIRE` (7 days). Staff sessions last `STAFF_SESSION_TTL` (12 hours), because staff can see other people's data.
- **Ended by:**
  - Logout (this device).
  - "Sign out" on one device from the privacy screen.
  - "Sign out everywhere".
  - Password change.
  - Account deletion.
  - Suspension.
- **Older tokens** (from before sessions existed) are cut off by the user's `sessionsRevokedAt`: any token issued before it is refused.
- **WebSockets** use the same session check. A signed-out token can't open a socket, and ending all sessions also disconnects live sockets.
- **Device list:** the app sends `X-Device-Id` (a random id per install) and `X-App-Version` on auth requests, so the privacy screen can show each device, when it was last active, and "this device".
- **Logout** also removes this phone's push token from the account, so a signed-out phone stops getting that account's notifications. Uploading a token also removes it from any other account that had it.
- **Expired rows** are removed automatically (a TTL index on `expiresAt`).
- **JWT secret:** the server refuses to start with a missing or short `JWT_SECRET` (under 32 characters).
- **Scoped call tokens:** the tokens handed to the voice-call provider for check-in calls carry a `scope` (`utils/samvaadClient.js`).
  - The call token only works for `POST /api/cycle/log`.
  - The webhook token only for the call webhook.
  - Neither can sign in, open a socket or read anything else (`scopeAllows` in `middleware/authMiddleware.js`).
- **Token lookups:** the app only uses a keystore token while a session is stored, so a token left behind by a failed sign-out can't keep working.

### 2.6 Two-step sign-in for staff and doctors
Staff and doctors can see other people's data, so a leaked password is the biggest risk. After the password, they enter a second code before any session starts.
- **Authenticator app (TOTP)**, the stronger option:
  - Set up from Account & Settings (staff) or My profile (doctors) with Google Authenticator, Microsoft Authenticator, 1Password and similar apps: scan a QR code, enter the first code to turn it on.
  - Standard RFC 6238 codes (6 digits, 30 seconds, one step of clock drift allowed), checked against the published test vectors. `utils/totp.js` has no dependencies.
  - **Each code works only once.** The last used time step is stored and claimed with a conditional update, so even two requests racing with the same code can't both succeed.
  - **The secret is encrypted in the database** with the same AES-256-GCM field encryption, and never returned after setup.
  - **8 recovery codes** for a lost phone. Shown once, stored as SHA-256 hashes, and each works once; the person can replace them (password needed).
  - Turning the app off needs the password.
  - Setting one up turns the second step on for that person even while it's off for everyone else.
  - **Lost phone and codes:** a Super Admin (`staff.manage`) resets it from Team & Access, or whoever holds `doctors.manage` from the Doctors page. Every enable, disable and reset is audit-logged.
- **Email code**, for everyone else when `STAFF_2FA_ENABLED=true`:
  - The server emails a 6-digit code instead of starting a session.
  - The response carries a one-time `challengeToken` and the masked email (e.g. `an***@thenura.care`).
- **Challenge storage:** the challenge token (SHA-256) and any emailed code (bcrypt) are stored hashed in `LoginChallenge`, which expires after 10 minutes.
- **Limits:**
  - 5 wrong codes end the challenge; the person signs in again.
  - An email resend needs a 30-second gap and replaces the code.
  - Starting a new sign-in deletes older pending challenges.
- **Suspension** is checked again when the code is verified.
- **Google sign-in** is refused for these accounts, since it would skip the second step.
- **Screens:** the Admin and the CMS both have a code screen after the password. With an authenticator it says so and accepts recovery codes.
- Endpoints: `POST /api/auth/login/verify-code`, `/resend-code`, and `/api/auth/2fa/*`.

### 2.7 New sign-in alerts
- When an account signs in on a device it has never had a session on, an email says which device and when, and what to do if it wasn't them.
- Devices are matched by `X-Device-Id` for the app and by user agent for the web.
- Accounts with no session history (older accounts) aren't emailed, to avoid a flood after deploy.
- **User can turn it off:** Privacy → "New sign-in alerts".
- Fire and forget: an email failure never blocks the sign-in.

### 2.8 Suspended and deleted accounts
- An admin suspension (`isActive: false`) signs the person out everywhere.
  - Requests answer `code: ACCOUNT_SUSPENDED`, and the app shows one "Account suspended" message and signs out.
  - A sign-in attempt emails a suspension notice, at most once per 24 hours.
- A deleted account has its email rewritten (`deleted_<id>_<email>`) and can't be reactivated.

---

## 3. Tokens on devices and in browsers

### 3.1 Mobile app (`lib/sessionStore.ts`)
- The token lives in the **OS keystore** (iOS Keychain / Android Keystore via `expo-secure-store`):
  - `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, readable only by this app;
  - never restored from a backup onto another phone.
- Only the non-secret profile is in AsyncStorage.
- Tokens saved by older builds are moved into the keystore the first time they're read.
- Sent as `Authorization: Bearer`.
- **Global 401 handling:**
  - A `401` clears the session.
  - It only fires when the rejected token is still the current one, so a slow request from before a re-login can't sign the new account out.
- **On account switch** (sign-out or a different user), per-account caches are cleared: dashboard/subscription caches and saved-post state.

### 3.2 Admin and CMS
- Staff tokens are checked for expiry before use. Any `401` signs the browser out.
- Logout also ends the session on the server.
- **httpOnly cookie sessions** (`utils/sessionCookie.js`; on when `STAFF_COOKIE_AUTH=true`):
  - A staff login that sends `X-Session-Mode: cookie` gets the session as an `HttpOnly; Secure; SameSite=Strict` cookie (`nura_staff_session`, path `/api`). Page scripts, and so any cross-site-scripting bug, can't read it.
  - The site then checks the browser really sends the cookie back. Only then does it drop the token and keep a marker in localStorage.
  - Where the cookie doesn't work (another domain, e.g. a preview deploy), it quietly keeps the old token behaviour.
  - **CSRF protection:** a cookie-authenticated request that changes something must come from an origin in `ALLOWED_ORIGINS`. A Bearer header always wins over the cookie.
  - Logout, and "sign out everywhere", clear the cookie. A password change swaps in the new session.
- A build-time API token (`VITE_API_TOKEN`) is honoured only in local development, so a real token can never be baked into a production bundle.

---

## 4. Data protection

### 4.1 Encryption in the database (`utils/fieldEncryption.js`)
- **Algorithm:** AES-256-GCM with a random 12-byte IV per value and an authentication tag, so tampering is detected.
- **Encrypted fields:**
  - Nura AI chats: title and every message (`QaChatSession`).
  - Doctor consultation messages.
  - Document-chat messages.
  - Partner and buddy messages.
  - Text read from uploaded documents (`Document.extractedText`).
  - Screening summaries and doctor-discussion summaries.
  - **Screening answers** (the whole answer set, stored as encrypted JSON).
  - Cycle-log notes.
  - Check-in call summaries.
- **Left plain on purpose:** dates, flow, symptom and mood tags. Predictions, trends and reports need to query them.
- **Keys:** `DATA_ENCRYPTION_KEYS=k1:<base64 32 bytes>[,k0:…]`.
  - The first key encrypts; every listed key can decrypt, so keys can be rotated.
  - Production refuses to start without a key, and a malformed key stops startup with a clear message.
- **Old data:** rows stored in plain text before encryption are still read correctly. `src/scripts/encryptExistingData.js --apply` rewrites them, and also re-encrypts after a key rotation.
- **Size limits** are checked against the plain text, not the ciphertext.
- Encrypted values are never searched, sorted or aggregated.

### 4.2 Medical documents
- Stored under the `medical-documents/` prefix. The bucket policy only makes listed public prefixes (`PUBLIC_PREFIXES`) public, never this one.
- **Encrypted by S3:** SSE-KMS when `AWS_S3_KMS_KEY_ID` is set, otherwise SSE-S3 (AES-256).
- **Links:**
  - Clients only get **10-minute signed view links** (and 5-minute download links).
  - The storage key never leaves the server.
  - The app fetches a fresh link each time a document is opened.
- **Opening a PDF:**
  - iOS: in an in-app WebView.
  - Android: downloaded to the app cache, handed to the phone's own PDF app, then **deleted** once the preview closes or the Documents screen opens again (`lib/tempFiles.ts`). It isn't deleted the instant it's shared, because the PDF app may still be reading it.
  - A document link is never sent to an online viewer.
- **Ownership:** every document query is filtered by the signed-in user.
- **Upload checks:**
  - Documents: 15 MB, images or PDF only.
  - Content checked by magic bytes, not just the declared type (`utils/fileValidation.js`).
- Documents are shared with a partner only if the owner turns on the separate "share reports" option (§6).

### 4.3 Other uploads
- **Size limits:** community media 50 MB, speech audio 15 MB, admin reels 300 MB.
- Every upload's type is checked by its actual bytes (magic numbers), since the client-declared type can lie.
- HR letters (salaries) are stored in MongoDB, not the public-read bucket.

### 4.4 In transit
- HTTPS to the API (Caddy in front of the Node server in production), and TLS to MongoDB Atlas (`mongodb+srv`).
- **Helmet** security headers on every response.
- **CORS:** production allows only `ALLOWED_ORIGINS`. Credentials are allowed only for those origins.
- **Request bodies** are capped at 10 MB. Every app request times out after 20 seconds.
- **Behind the proxy:** `trust proxy` is set, so rate limits see the real client IP.

### 4.5 On the phone
- **App lock** (`components/AppLock.tsx`):
  - Optional (Profile → App lock).
  - Uses the phone's own lock (fingerprint, Face ID, PIN or pattern) through the OS prompt. The app never stores a PIN.
  - Locks on launch and every time the app returns from the background.
- **Block screenshots** (`lib/screenPrivacy.ts`, `expo-screen-capture`; per phone, on by default):
  - Screenshots and screen recordings come out blank on sensitive screens: documents, Nura AI home and chat, document chat, tracker, calendar, the day-log sheet, symptom report, doctor consultation, partner screen, and partner chat and overview.
  - On Android this also blanks the app in the recent-apps list.
- **Blur in app switcher** (iOS; per phone, on by default): the app is blurred in the app switcher.
- **Health data in the keystore** (`lib/secureStorage.ts`):
  - The onboarding answers (last period date, period and cycle length, birthday, goals) are saved in the OS keystore, not AsyncStorage, and moved there from older builds on first read.
  - Day logs and notes are never persisted on the phone; the server is the source of truth.
- **Nothing health-related is left in AsyncStorage.** It holds only preferences (theme, Gen Z mode, app-lock on/off, screen-privacy switches), the public CMS config cache, the install's device id and seen-badge keys.
- **Android:**
  - `SYSTEM_ALERT_WINDOW` (drawing over other apps) is blocked.
  - Only the permissions features need are requested: camera, microphone, biometrics.
  - Microphone and photos are asked the first time a feature needs them, not at install.
- **Old builds** without the new native modules skip these features quietly instead of crashing.

---

## 5. AI and third parties

- **AI consent** (`utils/privacy.js`; Privacy → "Use AI features"):
  - When it's off, nothing is sent to the AI provider (Sarvam AI, India).
  - AI endpoints answer `403 AI_CONSENT_REQUIRED`; uploads are stored without text extraction; health reports come without the AI analysis.
  - Scheduled check-in calls and partner care suggestions respect the data owner's choice.
  - The consent version is recorded (`AI_CONSENT_VERSION`), so the app can ask again when what's shared changes.
  - `AI_CONSENT_ENFORCED=true` makes never-asked accounts count as "off".
- **Anonymous questions:** a question asked in Nura AI while signed out isn't tied to anyone.
- **Topic scope:**
  - A chat pinned to a topic is checked by a separate on-topic classification before any answer is generated.
  - Off-topic questions get a fixed reply.
- **Age gate:**
  - "Sex & Intimacy" chats need age 18+. The server checks this from the profile's date of birth, not just the app.
  - Onboarding asks for a birthday and requires 13+.
- **No tracking of children** (`lib/analyticsConsent.ts`): for anyone under 18 (by profile birthday) the app never sends feature-usage, Coming soon tap, or banner impression/click beacons. There are no ads.
- **Push notifications:** sent with Firebase Admin straight to the device's own FCM/APNs token. Push text is neutral by default (§7).
- **Payments:** Cashfree checkout.
  - An order is only honoured after the server checks Cashfree's own order status (`PAID`). The app's word is never trusted.
  - Coupons are re-checked when redeemed; a preview is never enough.
- **Paywall:** premium features are enforced server-side by one registry (`config/subscriptionRouteRegistry.js`) ahead of every route. The app's check is only a cache.

---

## 6. Sharing and people

- **Partner sharing:**
  - Connecting needs an invite code that expires.
  - The owner chooses exactly what's shared, each separately:
    - cycle phase (on by default);
    - symptoms (off);
    - intimacy log (off);
    - alerts (on);
    - reports and documents (off; a separate opt-in because they're more sensitive).
  - The partner's view is read-only.
  - Either side can disconnect at any time. The other side is told at once (WebSocket event plus a push).
- **Chat rooms:** a socket can only join a room it's proven to belong to, such as its own partner link or its own consultation. Messages only go to rooms the socket joined.
- **Community:** anonymous mode is on by default, so posts and comments show no name. The author still sees "your post". Five reports from different people hide a post automatically.
- **Bestie Circles:**
  - Small private groups joined by invite code.
  - Sharing your phase emoji is opt-in each time, and so is "I could use some love" (the only option that notifies the circle).
- **Doctors** see only their own consultations' patients, as allowed by the consultation.
- **Deep links:**
  - Only a fixed list of in-app routes (`SHAREABLE_ROUTES`) can be opened from a link.
  - Links to anything else just open the app.
  - Shared content only opens after sign-in (except the partner invite).
  - Notification taps only follow in-app paths (`resolveNotificationTarget`).
- **CMS-controlled links:** tiles that open a website or another app block dangerous schemes (`javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, `about:`). An unsafe action falls back to "no action".

---

## 7. Notifications

- **Hide notification details** (`models/Notification.js`; Privacy screen; **on by default**):
  - Every per-person push (period and fertile-window reminders, partner and circle updates, messages, consultation updates, the daily nudge) shows "The Nura: You have a new update. Open the app to see it." on the lock screen.
  - Banner images are dropped too.
  - The full text stays inside the app's notification list.
  - Tapping still opens the right screen.
- **Admin broadcasts** are written for everyone, so they keep their text.
- **Notifications toggle:** Profile → Notifications switches pushes off completely. The in-app list still fills.
- Suspended and deleted accounts never get pushes, and dead device tokens are removed.

---

## 8. Staff, admins and the CMS

- **Permission-based access** (`config/permissions.js`, `middleware/rbac.js`):
  - Routes check permissions such as `content.publish`, `users.manage` or `cms.manage`, never role names.
  - Roles: Super Admin, Content Super Admin / Admin, App Super Admin / Admin, Clinical Admin. Doctors use the separate clinician portal.
  - The Admin site only shows the tools a role has.
- **Approval workflow** (`middleware/approvalGate.js`):
  - Lower-tier staff can prepare changes (content, pushes, subscriptions) but not apply them. Their change becomes a request that an approver applies.
  - It is re-applied as the requester, and refused if they were since removed, suspended or re-roled.
- **No health records for staff:** admins see a person's profile and record counts, never their health data. Opening someone's account is audit-logged.
- **Audit log** (`utils/auditLog.js`):
  - Covers every privileged change: user status, account views and deletions, doctors, content, schemes, company files, subscriptions and coupons, pushes and schedules, CMS changes (features, layouts, theme, banners, tips, settings, restores, launches), and HR records.
  - Stores references and small metadata, never health content.
  - Readable only with `audit.read`.
- **Invites:** staff and doctor invites are one-time set-password links. The token is hashed in the database and expires after 48 hours.
- **HR e-signing links:** the token is hashed (SHA-256), opens only that one document, and can be revoked or expire.
- **CMS safety:**
  - Writes need `cms.manage`, reads `cms.read`.
  - Every publish is versioned with a history of 50 revisions, and restores are re-validated.
  - Required app sections can't be hidden.
  - Unknown or unsafe config values fall back to defaults in the app.
  - Launch states are resolved per viewer on the server.
- **Swagger docs** are off in production unless `SWAGGER_ENABLED=true`.

---

## 9. Your rights and your data

- **Download my data** (Privacy → Download my data, `GET /api/auth/export-data`):
  - Everything stored about the person, as one JSON file, with documents as one-hour links.
  - The phone's temporary copy is deleted the next time the Privacy screen opens (`lib/tempFiles.ts`).
  - At most once every 5 minutes, and never cached.
- **Delete account** (Profile → Delete account):
  - Signs out everywhere at once.
  - Hides the person from others straight away: posts hidden, comments, likes and votes removed, partner and buddy links ended (both sides told), nominations removed, open consultations cancelled.
  - The account and all its data are **erased for good 30 days later** (`ACCOUNT_PURGE_AFTER_DAYS`, `accountPurgeRunner`), or right away through the public "delete my data" page.
  - That page needs a code emailed to the account (hashed, expiring, limited attempts).
  - Payment records and audit logs are kept, without personal content.
- **Signed-in devices:** see every device, sign one out, or sign out everywhere.
- **Retention** (`utils/retentionRunner.js`, every 6 hours; 0 = keep):
  - Notifications: 90 days (`NOTIFICATION_RETENTION_DAYS`).
  - Audit logs: 730 days (`AUDIT_LOG_RETENTION_DAYS`).
  - Feature usage counts: 400 days (`USAGE_RETENTION_DAYS`). Per-device usage rows expire after 100 days.
  - **AI chats, the person's choice:** Privacy → "Keep AI chats": keep, 30 days, 90 days or 1 year. It applies to Nura AI and document chats, and the app confirms before deleting.
  - Sign-in codes, pending signups and sessions expire on their own.

---

## 10. Every switch a user controls

| Setting | Where | Default | Stored |
|---|---|---|---|
| Use AI features | Privacy | Asked | Account |
| Hide notification details | Privacy | On | Account |
| New sign-in alerts | Privacy | On | Account |
| Keep AI chats | Privacy | Keep | Account |
| Block screenshots | Privacy | On | This phone |
| Blur in app switcher (iOS) | Privacy | On | This phone |
| App lock | Profile → App lock | Off | This phone |
| Notifications | Profile | On | Account |
| Anonymous community mode | Profile | On | Account |
| Partner sharing (phase, symptoms, intimacy, alerts, reports) | Partner screen | See §6 | Account |
| Signed-in devices / sign out everywhere | Privacy | — | Account |

---

## 11. Logs and monitoring

- **Log redaction** (`utils/logger.js`) applies to every log line, in the console, in files and in CloudWatch:
  - Secrets become `[redacted]`: passwords, codes, tokens, the Authorization header, API keys.
  - Emails are masked (`a***@x.com`) and phone numbers too (`•••42`).
  - Message, note, answer and document text is replaced by its length.
- **Rejected tokens** log only the reason, never the token. Clients always get the same generic message.
- **Log files** are size-capped (10 MB × 5).
- **Startup crashes** print the real reason (e.g. a bad key) instead of `undefined`.
- **Security events are logged:** account lockouts, sessions revoked, consent changes, privacy-setting changes, data exports, retention runs.

---

## 12. Engineering safeguards

- **Security CI** on every PR, every push to `main` and weekly, in all four repos (`.github/workflows/security.yml`):
  - A **blocking** dependency audit on production dependencies at high severity and above.
    - The app uses `audit-ci` with two reviewed, documented exceptions (`audit-ci.jsonc`).
    - postcss and brace-expansion are patched through npm `overrides`.
  - **gitleaks** secret scanning. Firebase client configs are allowlisted, since they are public by design.
  - **CodeQL** code analysis.
- **Normal CI:** lint and tests.
- **Pre-commit hook** (Backend): lint and format.
- **Secrets stay out of git:** `.env` files are gitignored everywhere, and only `.env.example` is committed.
- **Refuses to start** in production without a strong `JWT_SECRET` or a valid `DATA_ENCRYPTION_KEYS`.
- **Lint** is clean (no warnings) in the backend and the app.
- **Tests** for encryption, sessions and logout tokens, lockout and 2FA helpers, TOTP (RFC 6238 vectors) and recovery codes, the under-18 check, the cookie and CSRF checks, retention, log redaction, file validation and permissions.

---

## 13. Settings for operators (backend `.env`)

| Key | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | — | Token signing; at least 32 characters |
| `JWT_EXPIRE` | `7d` | App session length |
| `STAFF_SESSION_TTL` | `12h` | Staff session length |
| `DATA_ENCRYPTION_KEYS` | — | Field encryption keys (required in production) |
| `AWS_S3_KMS_KEY_ID` | — | Use KMS for document encryption |
| `AI_CONSENT_ENFORCED` | `false` | Treat never-asked accounts as AI "off" |
| `STAFF_2FA_ENABLED` | `false` | Emailed code for staff and doctors |
| `STAFF_COOKIE_AUTH` | `false` | httpOnly cookie sessions for Admin and CMS |
| `LOGIN_MAX_FAILURES` / `LOGIN_LOCK_MINUTES` | `5` / `15` | Account lockout |
| `RATE_LIMIT_*`, `AUTH_RATE_LIMIT_*`, `OTP_EMAIL_RATE_LIMIT_*` | See `.env.example` | Rate limits |
| `ALLOWED_ORIGINS` | — | CORS and cookie CSRF allowlist |
| `ACCOUNT_PURGE_AFTER_DAYS` | `30` | Grace period before erasure |
| `NOTIFICATION_RETENTION_DAYS` / `AUDIT_LOG_RETENTION_DAYS` / `USAGE_RETENTION_DAYS` | `90` / `730` / `400` | Retention |
| `SWAGGER_ENABLED` | off in production | API docs |

---

## 14. Known gaps

The details are in `SECURITY_BACKLOG.md`.

- **Not yet switched on in production:** emailed codes for everyone (`STAFF_2FA_ENABLED`) and cookie sessions. Authenticator apps work as soon as the backend and Admin are deployed. Turn them on after the new Admin and CMS builds are deployed. The screenshot and app-switcher features need the next store build.
- **Users under 18:** tracking is already off for them. Whether to require verified parental consent, or raise the minimum age to 18, is a legal decision (onboarding allows 13+).
- **Databases:** separate development and production databases, with Atlas network limits.
- **Secrets:** move them into a secrets manager, and rotate any that have been on laptops.
- **Policy and vendors:** vendor data agreements, retention periods in the privacy policy, and recording which policy version each person accepted.
- **Accepted dependency findings:** two, documented in `audit-ci.jsonc`.
  - image-size, inside Expo's bundler (build time only); cleared by an Expo SDK upgrade.
  - linkify-it, inside the markdown renderer (trusted text only); cleared by replacing react-native-markdown-display.
- **External penetration test.**
