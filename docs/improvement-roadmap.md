# Improvement roadmap

Backlog from `docs/product-audit.md`, highest value and lowest risk first. Effort: S ≤ 1 day, M 2–4 days, L a week or more. "App" = this repo, "BE" = `period-buddy-be`.

None of the outcome figures below are measured yet. There are no baseline metrics, so each item names what to measure once the funnel events (R5) exist.

## Done in this change

- **R1 (P0) Call buttons on urgent AI replies**: see `docs/implementation-report.md`.
- **R2 (P0) Offline urgent detection matches the backend, incl. Hindi**: see `docs/implementation-report.md`.
- **R4a (P1) Say why onboarding asks for a birthday**: see `docs/implementation-report.md`.

## Next

### R3 (P1) Call buttons in voice mode and document chat
- **Problem:** the backend flags urgent voice replies (`replyType: "urgent_safety"`) and prefixes urgent text to document-chat replies, but the voice overlay only speaks them and document chat shows plain text.
- **Evidence:**
  - `lib/api/ai.ts` has no `replyType`.
  - `components/VoiceModeOverlay.tsx` and `app/(app)/document-chat.tsx` don't check for urgency.
- **Solution:**
  - Type `replyType` on the converse result.
  - When it's urgent, show the same two buttons in `VoiceModeOverlay` and stop re-arming the mic.
  - In document chat, use `isUrgentQuestion(userMessage)` from `lib/urgentSafety.ts`, since that reply has no flag.
- **Files:** `lib/api/ai.ts`, `hooks/useVoiceChat.ts`, `components/VoiceModeOverlay.tsx`, `app/(app)/document-chat.tsx`. Move the two buttons into a small shared `components/EmergencyCallButtons.tsx`.
- **Effort / risk:** S / low (additive UI).
- **Test plan:** unit-test the "should show buttons" helper. Manual test: in voice mode, say "I fainted and I'm bleeding a lot" and check the buttons show and the mic stays closed.
- **Outcome:** an urgent case shows a call option on every AI surface.

### R3b (P1, BE) Urgent pattern gaps
- **Problem:** the patterns miss reversed word order ("my pads are soaked through every hour").
- **Solution:** add `pad…soak` and `tampon…soak` patterns with an hourly qualifier, plus tests, then mirror them in `lib/urgentSafety.ts`. Coordinate with the open `fix/hindi-urgent-safety` branch, which is editing the same file.
- **Effort / risk:** S / low.

### R4 (P1) Shared urgent-phrase fixture
- **Problem:** the patterns live in two repos and can drift.
- **Solution:** a JSON list of `{ text, urgent }` phrases, checked into both repos and tested by both. A cheap drift alarm, with no shared package.
- **Effort:** S.

### R5 (P2) Privacy-safe product funnel events
- **Problem:** there's no activation or retention measurement. `lib/usage.ts` only counts feature opens and taps.
- **Solution:** reuse the existing `POST /api/app-config/usage` batcher with new event kinds, no new provider:
  - `onboarding_started`, `onboarding_completed`
  - `first_log`
  - `ai_chat_started`
  - `doc_upload_ok` / `doc_upload_failed`
  - `booking_started` / `booking_paid`
  - `feedback_sent`

  Event names only, never content. Gated by `analyticsAllowed()` (no under-18s).
- **Files:** app `lib/usage.ts` and call sites; BE `utils/featureUsage.js` (accept the new kinds) and the CMS dashboard.
- **Dashboard:** activation (onboarding completed → first log within 24 h), week-1 and week-4 return, AI and booking adoption, booking conversion, upload failure rate.
- **Effort / risk:** M / low; needs the BE change first.

### R6 (P2) Product feedback with rating
- **Problem:** Help & support handles tickets, but there's no quick "how's the app?" rating or category.
- **Solution:**
  - Add a `feedback` category and an optional 1–5 rating to the existing ticket sheet (`components/SupportTicketSheet.tsx`, BE `utils/supportTicket.js`).
  - Add a note that it's not for medical help, with a link to Nura AI or a consult.
  - Screenshot attachment: optional, asking for consent first, using the existing upload API.
- **Effort / risk:** M / low.

### R7 (P2) Doctor-visit preparation
- **Problem:** before a consult there's no place to list questions or choose what the doctor sees.
- **Solution:** on a live booking card, add "Prepare for your visit": symptoms picked from the person's own logs (counts from `reportApi.getHealthReport`) plus free-text questions. They review it, then send it as one consultation chat message. Nothing is sent automatically.
- **Effort / risk:** M / low (reuses the chat).

### R8 (P2) Unified timeline
- **Solution:** a read-only, paged screen merging day logs, documents, AI summaries and consultations, each labelled "You logged" or "AI summary" by source. Needs a BE endpoint (`GET /api/timeline?cursor=`) scoped to `req.userId`, so it can't stitch together several unscoped lists client-side.
- **Effort / risk:** L / medium.

### R9 (P2, BE) Quiet hours for every push
- **Solution:** reuse `checkinCall.js`'s quiet-hours window in `dailyNotificationScheduler.js` and the broadcast worker, using the stored timezone offset.
- **Effort / risk:** M / medium (scheduling).

## Later (P3)

- Install-referrer reader for deferred deep links.
- Move the five hand-rolled paywall screens to `FeatureGate`.
- Move hand-rolled paged lists to `usePaginatedList`.
- Weekly summary push (after R5 shows enough people log weekly).
- Remove the unused `voiceAgentApi.checkinCall()` if "Call me now" isn't coming back.
