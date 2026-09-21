# API Reference (Frontend ⇄ Backend)

Every endpoint the app calls, grouped by the `xApi` object in `lib/api.ts`
that wraps it — a friendlier index than reading the backend's
`API_DOCUMENTATION.md` route-by-route. This lists *what the frontend
actually uses*; the backend may expose a couple of admin-only routes not
listed here (those go through the separate Content Studio portal, not this
app).

**Conventions:** all paths are relative to `EXPO_PUBLIC_API_BASE_URL`. Every
request carries `Authorization: Bearer <jwt>` automatically unless the
frontend call passes `skipAuth: true`. Every response is
`{ data, error, message, ... }`; `apiRequest` unwraps `.data` for you,
`apiEnvelopeRequest` returns the whole envelope (used where `token`/`user`
are needed alongside `data`, i.e. auth flows). See `lib/api.ts`'s top for
the shared `ApiError` shape (`kind`: `network`/`timeout`/`server`/
`notFound`/`unauthorized`/`unknown`) every failure throws.

---

## `authApi` — authentication & profile

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/signup` | Start registration, emails an OTP |
| POST | `/api/auth/verify-otp` | Verify OTP, creates the account |
| POST | `/api/auth/resend-otp` | Resend the signup OTP |
| POST | `/api/auth/google` | Google Sign-In (ID token) |
| POST | `/api/auth/onboarding` | Save cycle length/last period/goals after signup |
| GET | `/api/auth/profile` | Get the current user |
| PATCH | `/api/auth/profile` | Update profile fields |
| POST | `/api/auth/fcm-token` | Register a push-notification device token |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/delete-account` | Delete account (OTP-confirmed) |
| GET | `/api/auth/dashboard` | Streak/wallet/summary — the single source `useUserStats.ts` fetches once and shares |
| POST | `/api/auth/logout` | Invalidate the session server-side |

## `cycleApi` — cycle tracking

| Method | Endpoint | Purpose |
|---|---|---|
| PUT | `/api/cycle/settings` | Save cycle length/period length/tracking goal/reminders |
| GET | `/api/cycle/settings` | Get cycle settings |
| GET | `/api/cycle/predictions` | Next period/ovulation/fertile window, confidence-banded |
| GET | `/api/cycle/symptom-predictions` | Per-symptom likelihood by cycle phase (frequency-based, not AI) |
| POST | `/api/cycle/log` | Upsert a day's log (flow, symptoms, mood, etc.) |
| GET | `/api/cycle/logs?month=` | A month's logs |
| GET | `/api/cycle/log/:dateKey` | One day's log |
| GET | `/api/cycle/stats` | Aggregate stats (days logged, top symptoms, period days) |

## `habitsApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/habits` | List habits |
| POST | `/api/habits` | Create a habit |
| PATCH | `/api/habits/:id/toggle` | Toggle today's completion (race-safe token award) |
| DELETE | `/api/habits/:id` | Soft-delete a habit |

## `forestApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/forest/status` | Current tree growth stage/health |
| POST | `/api/forest/care` | Log care for today (race-safe "new day" bonus) |
| GET | `/api/forest/logs` | Cycle Tree Logs history |

## `consultationApi` — doctor booking

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/consultation/doctors?search=` | Browse/search doctors |
| GET | `/api/consultation/doctors/:id/availability` | A doctor's open slots |
| POST | `/api/consultation/order` | Create a Cashfree order + pending booking |
| POST | `/api/consultation/verify` | Verify payment, activate the booking |
| GET | `/api/consultation/my` | My bookings |
| GET | `/api/consultation/:id/messages` | Consultation chat history |
| POST | `/api/consultation/:id/message` | Send a consultation chat message |
| POST | `/api/consultation/:id/complete` | Mark complete |
| POST | `/api/consultation/:id/cancel` | Cancel |

## `subscriptionApi` — paywall

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/subscriptions/plans` | Active bundles (public) |
| GET | `/api/subscriptions/features` | Feature prices/free-or-premium status (public) |
| GET | `/api/subscriptions/me` | My current entitlements |
| GET | `/api/subscriptions/history` | Purchase history |
| POST | `/api/subscriptions/coupons/apply` | Preview a coupon's discount |
| POST | `/api/subscriptions/order` | Create an order (or instant-activate on a 100%-off coupon) |
| POST | `/api/subscriptions/verify` | Verify payment, activate the entitlement |

A `402 FEATURE_LOCKED` response from *any* endpoint (not just these) parses
into `ApiError.kind === "featureLocked"` with a `.lock` payload — see
`hooks/useSubscriptionAccess.ts` and `components/subscription/FeatureGate.tsx`.

## `partnerApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/partner` | My partner connection/profile |
| POST | `/api/partner/invite` | Generate an invite code |
| POST | `/api/partner/connect` | Redeem an invite code |
| PATCH | `/api/partner/permissions` | Update what the partner can see |
| GET | `/api/partner/shared-data` | Data shared with the connected partner |
| GET | `/api/partner/messages` | Partner chat history |
| POST | `/api/partner/message` | Send a partner chat message |
| DELETE | `/api/partner/disconnect` | Disconnect the pairing |
| GET | `/api/partner/notifications` | In-app notification list (lives here for historical reasons) |
| PATCH | `/api/partner/notifications/:id/read` | Mark a notification read |

## `buddyApi` — anonymous peer support

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/buddies/matches?search=` | Discovery list |
| GET | `/api/buddies/active` | My active match |
| POST | `/api/buddies/:matchId/nominate` | Nominate a buddy |
| GET | `/api/buddies/messages` | Buddy chat history |
| POST | `/api/buddies/message` | Send a buddy chat message |
| DELETE | `/api/buddies/active` | Leave the current match |

## `nominationsApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/nominations` | Nominations I've sent |
| GET | `/api/nominations/incoming` | Nominations sent to me |
| POST | `/api/nominations` | Create a nomination |
| PATCH | `/api/nominations/:id/respond` | Accept/decline |

## `communityApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/community` | Feed (filterable, paginated) |
| POST | `/api/community` | Create a post (text/poll/photo, optional anonymity) |
| PATCH | `/api/community/:id/poll/vote` | Vote on a poll |
| GET | `/api/community/:id` | One post |
| PATCH | `/api/community/:id/like` | Toggle like (atomic, self-like blocked) |
| PATCH | `/api/community/:id/save` | Toggle save |
| POST | `/api/community/:id/report` | Report a post (auto-hides past a threshold) |
| POST | `/api/community/:id/comment` | Add a comment |
| DELETE | `/api/community/:id` | Delete own post |
| DELETE | `/api/community/:postId/comment/:commentId` | Delete own comment |

## `blogsApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/blogs` | List (admin-authored) |
| GET | `/api/blogs/feed` | Reader feed |
| GET | `/api/blogs/:slug` | One blog |
| PATCH | `/api/blogs/:id/like` | Toggle like |
| GET | `/api/blogs/:slug/translate` | Machine-translated title+body (Sarvam) |
| PATCH | `/api/blogs/:id/bookmark` | Toggle bookmark |
| GET | `/api/blogs/bookmarks` | My bookmarks |
| POST | `/api/blogs/:id/track-view` | View-count tracking |

## `reelsApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/reels` | List |
| GET | `/api/reels/:id` | One reel |
| POST | `/api/reels/:id/view` | View tracking |
| PATCH | `/api/reels/:id/follow` | Follow the creator |
| PATCH | `/api/reels/:id/vote` | Vote (if it's a poll-style reel) |

## `healthIssuesApi`, `wellbeingApi`

Browse/search content endpoints for Health Concerns and Hygiene/Sexual
Wellbeing (`GET` list + `GET :id` + `POST track-view`), following the same
shape as blogs — admin-authored content, read-only from the app.
`wellbeingApi` additionally has `GET /api/wellbeing/games?deck=` and
`POST /api/wellbeing/games/:deck/draw` for the wellness card-draw game.

## `questionAnswerApi` — Nura AI

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/questions` | Anonymous-friendly knowledge-base browse |
| POST | `/api/questions/ask` | Stateless one-off question (no login required) |
| GET | `/api/questions/:idOrSlug` | One Q&A entry |
| POST | `/api/questions/sessions` | Start a persisted, optionally topic-scoped chat session (login required) |
| GET | `/api/questions/sessions` | List my chat sessions |
| GET | `/api/questions/sessions/:id` | One session + full history |
| POST | `/api/questions/sessions/:id/messages` | Send a message in a session |
| DELETE | `/api/questions/sessions/:id` | Delete a session |

Full pipeline (urgent-safety check → topic classifier → knowledge-base
match → AI → fallback) documented in the backend's `AI_ML_OVERVIEW.md`.

## `voiceAgentApi`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/voice-agent/converse` | One turn of the in-app voice/text agent (structured JSON reply) |
| POST | `/api/voice-agent/checkin-call` | Trigger an outbound "call me now" |
| GET | `/api/voice-agent/checkin-call/schedule` | Get the recurring-call schedule |
| PUT | `/api/voice-agent/checkin-call/schedule` | Save the recurring-call schedule |

## `uploadApi`, `documentApi`, `speechApi`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/upload` | Generic image upload (avatars, etc.) — raw `FormData`, not `apiRequest` |
| POST | `/api/documents` | Upload a medical document (OCR runs fire-and-forget after) |
| GET | `/api/documents` | List my documents |
| DELETE | `/api/documents/:id` | Delete a document |
| POST | `/api/documents/summarize` | AI summary of documents in a date range |
| GET | `/api/documents/chat` | Document-chat history |
| POST | `/api/documents/chat` | Ask a question about my documents (AI) |
| GET | `/api/speech/languages` | Supported language list |
| POST | `/api/speech/transcribe` | Speech-to-text |
| POST | `/api/speech/synthesize` | Text-to-speech |

## `reportApi`, `insightsApi`, `screeningApi`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/reports/health-report` | Full health report (stats + documents + optional AI analysis) for a date range |
| GET | `/api/insights/daily` | Today's personalized hormone/mood/energy/skin insight (rule-based, not AI) |
| GET | `/api/screening/questions?condition=` | Symptom-checker question set |
| POST | `/api/screening/assess` | Submit answers, get a deterministic weighted-sum result |
| GET | `/api/screening/history` | Past assessments |

## `schemesApi`, `schemeApplicationsApi` — government benefits

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/schemes` | List/search/filter schemes |
| GET | `/api/schemes/:idOrSlug` | One scheme's detail |
| GET | `/api/schemes/recommended` | Personalized recommendations |
| GET | `/api/schemes/categories` | Category metadata |
| GET | `/api/schemes/:idOrSlug/eligibility` | Eligibility check ("may be eligible," never a guarantee) |
| POST | `/api/scheme-applications` | Start tracking an application |
| GET | `/api/scheme-applications` | My applications |
| GET/PATCH | `/api/scheme-applications/:id` | One application |

---

## Realtime (WebSocket)

Not part of `lib/api.ts`'s REST helpers — a separate persistent connection
via `getWebSocketUrl()` (auth token as a query param) and
`hooks/useRealtimeSocket.ts`, which multiplexes one physical socket across
every screen that needs one. Rooms in use: `community`, `partner_<id>`,
`buddy_<roomKey>`, `consultation_<id>`, plus an auto-joined personal
`user_<userId>` room the backend uses to push notifications and document-
extraction completion events.

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how this fits into the whole system.
- Backend `API_DOCUMENTATION.md` — the backend's own request/response body
  reference, if you need exact payload shapes beyond what `lib/api.ts`'s
  TypeScript types already show.
