# API Reference (Frontend ⇄ Backend)

Every endpoint the app calls, grouped by the `xApi` object in `lib/api/`
that wraps it — a friendlier index than reading the backend's
`API_DOCUMENTATION.md` route-by-route. This lists *what the frontend
actually uses*; staff-only routes (`/api/admin/*`, `/api/cms/*`,
`/api/doctor/*`) belong to the Admin Workspace and the CMS, not this app.
Checked against `lib/api/` on 2026-09-30.

**Conventions:** all paths are relative to `EXPO_PUBLIC_API_BASE_URL`. Every
request carries `Authorization: Bearer <jwt>` automatically unless the
frontend call passes `skipAuth: true` (the token comes from the OS keystore,
`lib/sessionStore.ts`). Every request also sends `X-App-Version` and `X-Timezone-Offset` (minutes, `Date#getTimezoneOffset`; cycle endpoints count "today" from it), and
`/api/auth/*` requests send `X-Device-Id` so the backend can list devices.
Every response is
`{ data, error, message, ... }`; `apiRequest` unwraps `.data` for you,
`apiEnvelopeRequest` returns the whole envelope (used where `token`/`user`
are needed alongside `data`, i.e. auth flows). See `lib/api/`'s top for
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
| PUT | `/api/auth/profile` | Update profile fields (`profileApi` wraps this and `GET` above) |
| POST | `/api/auth/fcm-token` | Register a push-notification device token |
| POST | `/api/auth/change-password` | Change password (signs out every other device) |
| DELETE | `/api/auth/delete-account` | Delete account: signed out and hidden at once, erased 30 days later |
| GET | `/api/auth/dashboard` | Streak/wallet/summary — the single source `useUserStats.ts` fetches once and shares |
| POST | `/api/auth/logout` | End this device's session |
| POST | `/api/logout` | Legacy logout alias; also clears the push token |
| POST | `/api/auth/logout-all` | Sign out everywhere |
| GET | `/api/auth/sessions` | Signed-in devices |
| DELETE | `/api/auth/sessions/:id` | Sign one device out |
| GET | `/api/auth/privacy` | AI consent and privacy settings |
| PUT | `/api/auth/privacy/settings` | `hideNotificationDetails`, `newSignInAlerts`, `aiChatRetentionDays` |
| PUT | `/api/auth/privacy/ai-consent` | Turn AI features on/off (AI endpoints answer 403 `AI_CONSENT_REQUIRED` while off) |
| GET | `/api/auth/home-layout` | This person's Home layout (`order`, `hidden`, `shortcuts`, `shortcutStyles`, `blocks`; null = default) |
| PUT | `/api/auth/home-layout` | Replace it (Profile → Customize Home) |
| GET | `/api/auth/export-data` | "Download my data" (once per 5 minutes) |

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
| GET | `/api/habits/suggestions` | Today's personalized suggestions (AI or rules, made once per local day and stored) |
| POST | `/api/habits/suggestions/:key/dismiss` | "Not for me": hide a suggestion today and for the next 14 days |
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
| PATCH | `/api/consultation/:id/cancel` | Cancel, until the slot starts (paid or active); only the doctor or the server completes a session |
| POST | `/api/consultation/:id/call/decline` | Decline the "your doctor is in the video room" ring (the doctor is told) |
| POST | `/api/consultation/:id/video/join` | Short-lived Jitsi token for this booking's room (booked patient, paid, inside the join window); refusals carry `code` (`JOIN_WINDOW_NOT_OPEN` + `opensAt`, `JOIN_WINDOW_CLOSED`, `CONSULTATION_NOT_LIVE`, `PAYMENT_REQUIRED`), `503` when Jitsi is off |
| POST | `/api/consultation/:id/video/attendance` | `{ event: "joined" \| "left" }`, informational only, never changes the session |

Consultations from `/api/consultation/my` carry `videoCall` (`{ available, joinOpensAt, joinClosesAt, canJoinNow }` or `null`), which drives **Join Consultation** (`components/JitsiCall`). Every video call runs on the self-hosted Jitsi server; there is no other video path.

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
| GET | `/api/partner/notifications?page=&limit=` | In-app notification list, paged, with `unreadCount` on the envelope (lives here for historical reasons) |
| POST | `/api/partner/notifications/:id/read` | Mark a notification read |
| POST | `/api/partner/notifications/read-all` | Mark all read |

## `buddyApi` — anonymous peer support

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/buddies/matches?search=` | Discovery list |
| GET | `/api/buddies/active` | My active match |
| POST | `/api/buddies/:matchId/nominate` | Nominate a buddy |
| GET | `/api/buddies/messages` | Buddy chat history |
| POST | `/api/buddies/message` | Send a buddy chat message |
| DELETE | `/api/buddies/active` | Leave the current match |
| POST | `/api/buddies/video/join` | Short-lived Jitsi token for my active pairing's room (`404` no pairing, `409` buddy unavailable, `503` video off); rings the buddy |

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
| GET | `/api/reels` | List, with `isLiked`/`isSaved`/`likeCount`/`commentCount`/`saveCount`/`viewCount` (`getReels`) |
| GET | `/api/reels/saved` | My saved reels (`getSaved`) |
| GET | `/api/reels/:id` | One reel, for deep links (no longer counts a view) (`getReelById`) |
| PATCH | `/api/reels/:id/view` | Count a view after ~2 s of playback (`recordView`) |
| PATCH | `/api/reels/:id/follow` | Toggle following the creator (`toggleFollowCreator`) |
| POST | `/api/reels/:id/vote` | Vote on the reel's poll (`votePoll`) |
| POST | `/api/reels/:id/like` | Set like `{ liked }`, idempotent (`setLike`) |
| POST | `/api/reels/:id/save` | Set save `{ saved }`, idempotent (`setSaved`) |
| GET | `/api/reels/:id/comments?cursor=&limit=` | Comments, newest first (`getComments`) |
| POST | `/api/reels/:id/comments` | Add a comment `{ text }`, ≤ 500 chars (`addComment`) |
| DELETE | `/api/reels/:id/comments/:commentId` | Delete my comment (`deleteComment`) |
| POST | `/api/reels/:id/comments/:commentId/report` | Report a comment (`reportComment`) |

## `healthIssuesApi`, `wellbeingApi`

Browse/search content endpoints for Health Concerns and Hygiene/Sexual
Wellbeing (`GET` list + `GET :id` + `POST track-view`), following the same
shape as blogs — admin-authored content, read-only from the app.
`wellbeingApi` additionally has `GET /api/wellbeing/games?deck=` and
`POST /api/wellbeing/games/:deck/draw` for the wellness card-draw game.

Blogs, reels, Q&As, health issues and wellbeing resources carry the
medical-review stamp (`MedicalReview` in `lib/api/`): `medicallyReviewed`,
`reviewedBy` (reviewer's name) and `reviewedAt`, set by the backend when a
Content Super Admin reviews the item. The blog article and the wellbeing /
health-issue detail views show it with `components/MedicalReviewBadge.tsx`.

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
| POST | `/api/voice-agent/checkin-call` | Trigger an outbound "call me now" (no longer called from the UI) |
| GET | `/api/voice-agent/checkin-call/schedule` | Get the recurring-call schedule |
| PUT | `/api/voice-agent/checkin-call/schedule` | Save the recurring-call schedule |
| GET | `/api/voice-agent/checkin-call/history?limit=` | Past check-in calls |

## `uploadApi`, `documentApi`, `speechApi`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/upload` | Generic image upload (avatars, etc.) — raw `FormData`, not `apiRequest` |
| POST | `/api/documents` | Upload a medical document (OCR runs fire-and-forget after) |
| GET | `/api/documents` | List my documents (paged) |
| GET | `/api/documents/:id` | One document with a fresh 10-minute signed `fileUrl` (fetched again on every open) |
| DELETE | `/api/documents/:id` | Delete a document |
| POST | `/api/documents/:id/retry-extraction` | Re-run text extraction |
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

## `appConfigApi` — remote layout from the CMS

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/app-config` | Per-viewer layout, features, launch states, banners, theme, app settings. Sent with `X-Device-Id` and `X-Nura-Launch: 1`; the token is attached by hand under `skipAuth` so a stale one can't sign anyone out |
| POST | `/api/app-config/launch/:key/notify` | "Notify me" on a Coming-soon feature |
| POST | `/api/app-config/launch/:key/tap` | Count a tap on a locked tile (not sent for under-18s) |
| POST | `/api/app-config/usage` | Batched feature opens/taps (every 15 s, 20 events or on background) |
| POST | `/api/app-config/banners/:id/click` | Banner click |
| POST | `/api/app-config/banners/impressions` | Banner impressions, once per session |

## `genzApi`, `circlesApi` — Gen Z pack

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/genz/wrapped?period=month\|year&value=&tz=` | Cycle Wrapped story data (`value` is `YYYY-MM` or `YYYY`) |
| GET | `/api/genz/era` | Today's "era" (404 when there are no cycle settings) |
| GET | `/api/genz/badges` | Streak and badges |
| GET | `/api/circles` | My Bestie Circles |
| POST | `/api/circles` | Create a circle |
| POST | `/api/circles/join` | Join with an invite code |
| GET | `/api/circles/:id` | One circle: members, vibes, reactions |
| PATCH | `/api/circles/:id` | Rename |
| POST | `/api/circles/:id/invite-code` | New invite code |
| DELETE | `/api/circles/:id/members/:userId` | Remove a member / leave |
| POST | `/api/circles/:id/vibes` | Post a vibe |
| DELETE | `/api/circles/:id/vibes/:vibeId` | Delete a vibe |
| POST | `/api/circles/:id/vibes/:vibeId/react` | React to a vibe |
| POST | `/api/circles/:id/hype/:userId` | Hype a member |

## `supportApi` — Help & support tickets

Profile → Help & support (`components/SupportTicketSheet.tsx`) and My tickets (`app/(app)/support-tickets.tsx`, `support-ticket.tsx`).

| Method | Path | Used for |
|---|---|---|
| POST | `/api/support/tickets` | Raise a ticket (category, subject, message, optional app info); returns its `NURA-000123` number |
| GET | `/api/support/tickets` | My tickets (paged, `?status=`) with `unreadCount` |
| GET | `/api/support/tickets/:id` | One ticket and its reply thread (marks support's replies read) |
| POST | `/api/support/tickets/:id/reply` | Reply (re-opens a resolved ticket; closed tickets refuse) |

## `healthApi`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Liveness check (outside `/api`) |

---

## Realtime (WebSocket)

Not part of `lib/api/`'s REST helpers — a separate persistent connection
via `getWebSocketUrl()` (auth token as a query param) and
`hooks/useRealtimeSocket.ts`, which multiplexes one physical socket across
every screen that needs one. Rooms in use: `community`, `partner_<id>`,
`buddy_<roomKey>`, `consultation_<id>`, plus an auto-joined personal
`user_<userId>` room the backend uses to push notifications and document-
extraction completion events.

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — how this fits into the whole system.
- Backend `API_DOCUMENTATION.md` — the backend's own request/response body
  reference, if you need exact payload shapes beyond what `lib/api/`'s
  TypeScript types already show.
