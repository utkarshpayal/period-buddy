# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Keeping this file current

This file must stay in sync with the codebase. After any change that affects architecture, routes, API surface (`lib/api.ts`), providers, or commands below, update the relevant section in the same session — don't wait to be asked.

## Commands

```bash
npm install              # install deps
npx expo start            # start dev server (scan QR / press a,i,w)
npm run android            # start + open Android
npm run ios                # start + open iOS
npm run web                 # start + open web
npm run lint                 # expo lint (eslint.config.js, eslint-config-expo)
npm run reset-project          # moves starter code to app-example/, blanks app/
```

No test runner is configured in package.json. There is no `build` script — production builds go through EAS:

```bash
eas build --platform android --profile preview
eas build --platform ios --profile preview_ios
```

`EXPO_PUBLIC_API_BASE_URL` must point at a reachable backend for installed builds (see `.env.example`); EAS profiles in `eas.json` bake this in at build time. In `__DEV__` without that env var, `lib/api.ts` derives the API host from the Expo dev server's `hostUri` on port 5000.

## Architecture

This is an Expo Router (v6, file-based routing) app — **frontend only**; the backend (`period-buddy-be`) lives in a separate repo/service and is consumed entirely through `lib/api.ts`.

### Provider stack (`app/_layout.tsx`)

```
ThemeProvider (components/theme.tsx)
  AuthProvider (components/auth-context.tsx)  — hydrates session from AsyncStorage before children render
    AppLockProvider (components/AppLock.tsx)  — PIN/biometric app lock, renders AppLockScreen overlay
      AppShell — waits for theme hydration, hides splash screen, renders <Stack/> + AppModalHost
```

`app/(app)/_layout.tsx` additionally wraps its subtree in `AppStateProvider` (`components/AppState.tsx`).

Modals are centralized: `components/modals/AppModalHost.tsx` is a single host rendered at the root, driven by `lib/modal-host.ts`. Prefer routing new modal UI through that host instead of ad hoc `Modal` components.

### Route groups (`app/`)

- `(tabs)/` — pre-auth flow: `login`, `signup`, `partner-connect`, and a `home` shown before onboarding.
- `(app)/` — authenticated app, one screen per top-level feature (tracker, habits, forest, consultation, community, blogs, reels, documents, document-chat, qa, health-issues, hygiene, sexual-wellbeing, buddy-nomination, partner, app-lock, government-schemes, government-scheme-detail, scheme-applications, graphs-reports, symptom-report, ...).
  - `(app)/(dashboard)/` — the main tab bar: `home`, `tracker`, `community`, `profile`.
  - `(app)/(partner-view)/` — shown when the signed-in user is a connected partner "viewer" rather than the data owner (see `AuthUser.partnerRole`). Has its own floating tab bar (`_layout.tsx`) matching `(dashboard)/_layout.tsx`'s look exactly (same sizes/colors/center-avatar treatment): `home` (read-only shared overview), `chat` (owner↔partner messaging), `ai-chat` (center avatar, same mic-permission-gated voice assistant), `community` (identical UI to the owner's — both re-export `components/screens/CommunityScreen.tsx`), `profile` (partner's own account: notifications, app lock, disconnect, logout). `home`'s notification bell pushes to the shared `(app)/notifications.tsx` screen — the same one the owner dashboard's bell opens — instead of its own bottom-sheet drawer, so the two roles see byte-identical notification UI; on focus it re-syncs `usePartnerViewState()`'s notifications so the bell's unread badge stays accurate after reading/marking things there. Cross-tab state (profile, notifications, live chat messages, the one WebSocket connection) lives in `_state.tsx`'s `PartnerViewStateProvider`/`usePartnerViewState()`, since Tabs screens are siblings and would otherwise each re-fetch/reconnect independently.

### Data layer (`lib/api.ts`)

All backend access goes through one file: typed request helpers (`apiRequest`, `apiEnvelopeRequest`) plus one `xApi` object per domain (`authApi`, `cycleApi`, `habitsApi`, `forestApi`, `consultationApi`, `partnerApi`, `buddyApi`, `nominationsApi`, `communityApi`, `blogsApi`, `reelsApi`, `healthIssuesApi`, `wellbeingApi`, `questionAnswerApi`, `uploadApi`, `documentApi`, `speechApi`, `reportApi`, `insightsApi`, `screeningApi`, `schemesApi`, `schemeApplicationsApi`). Every response envelope is `{ data, error, message, ... }`; `apiRequest` unwraps `.data`, `apiEnvelopeRequest` returns the raw envelope (used for auth flows that need `token`/`user`/`isProfileComplete` alongside data).

- `cycleApi.getSymptomPredictions()` — `GET /api/cycle/symptom-predictions`, per-symptom likelihood by cycle phase derived from the user's own logged history; powers `app/(app)/symptom-predictions.tsx`.
- `insightsApi.getDaily()` — `GET /api/insights/daily`, personalized daily hormone/mood/energy/skin insight plus exercise/nutrition/sleep/wellness suggestion lists; powers `app/(app)/insights.tsx`.
- `screeningApi` (`getQuestions`, `submitAssessment`, `getHistory`) — `/api/screening/*`, the PCOS/endometriosis/fibroid/thyroid symptom checker flow; powers `app/(app)/symptom-checker.tsx`.
- `schemesApi` / `schemeApplicationsApi` — `/api/schemes/*` and `/api/scheme-applications/*`, the Government Schemes & Benefits feature (women's reproductive & menstrual health schemes; Central + Rajasthan, state-independent architecture). Powers `app/(app)/government-schemes.tsx` (listing/search/category & Central-Rajasthan filters/recommended), `government-scheme-detail.tsx` (detail + eligibility checker + action buttons keyed by `actionType`: `APPLY`/`CHECK_ELIGIBILITY`/`FIND_FACILITY`/`LEARN_MORE`/`EXTERNAL_APPLICATION` — not every scheme is an "apply"), and `scheme-applications.tsx` (My Applications). Reached from Profile → Government Schemes & Benefits. Pure display/logic helpers live in `lib/schemeHelpers.ts` (unit-tested in `lib/__tests__/`). Eligibility never claims a guarantee — only "You may be eligible". A `FIND_FACILITY` scheme's primary CTA opens a Google Maps government-hospital search (`schemeHelpers.governmentHospitalMapsUrl(user.state)`) — **not** the scheme's `officialUrl`, which is an info page and stays on the secondary "Official Website" button. Admins create/edit/delete schemes from the separate `period-buddy-content` web portal (Content Studio), not the mobile app; the app is read-only over `/api/schemes/*`.
- `app/(app)/graphs-reports.tsx` (Profile → Graphs & Reports) is a colorful gradient-card dashboard — Cycle length (last 3 lengths from `cycleApi.getPredictions().analyticsData` as proportional pill bars), Weight and Basal body temperature (latest logged value, derived client-side from `cycleApi.getMonthLogs()` over the last 3 months — there's no backend aggregate for these two yet), and Water intake / Sleep (90-day averages from `reportApi.getHealthReport(...).cycle.averages`) — plus a Reports section linking to `symptom-report.tsx` and to Documents' existing "Download doctor report" flow (`router.push({ pathname: "/documents", params: { openReport: "1" } })`, which `documents.tsx` reads via `useLocalSearchParams` to auto-open its report modal pre-filled to the last 90 days). `app/(app)/symptom-report.tsx` renders `reportApi.getHealthReport(...).cycle`'s `symptomCounts`/`moodCounts`/`flowCounts` as ranked bar lists plus the sleep/water/stress averages — a read-only "review your symptoms and cycle" view, distinct from the downloadable PDF.

- `lib/cycle.ts` is the canonical source for the `CyclePhase` type and `getCyclePhase(cycleDay, periodLength, cycleLength)` — import it instead of re-deriving cycle phase locally (tracker, forest, symptom predictions, and `DayEntry.phase` in `lib/api.ts` all use it).
- `hooks/useUserStats.ts` is the canonical source for streak/wallet numbers (`{ streakCount, walletBalance }`); it fetches the dashboard once and syncs it into auth-context. Screens should consume this hook instead of reading `user.streakCount`/`user.walletBalance`/`user.tokenEarned` directly, so streak/points never drift between screens.
- Auth token is stored in AsyncStorage under `period-buddy.auth-session` (`AUTH_SESSION_KEY`) and attached as `Authorization: Bearer` automatically; pass `skipAuth: true` for public endpoints.
- A 401 triggers a global `onUnauthorized` handler registered by `AuthProvider`, which clears the local session — don't hand-roll 401 handling per screen.
- Every request is aborted after `DEFAULT_TIMEOUT_MS` (20s; override per-call with `timeoutMs`, `0` disables) and every failure throws a typed `ApiError` carrying `kind` (`network`/`timeout`/`server`/`notFound`/`unauthorized`/`unknown`) and `status`. Use the exported `isNetworkError(err)` and `getFriendlyErrorMessage(err)` helpers to branch on connectivity vs. show copy — don't string-match `.message`. `useAsyncLoad` already exposes an `offline` boolean derived from these; `LoadingErrorState` and `EmptyState` take an `offline`/`wifi-off` variant.
- Several types carry `@deprecated` fields kept for backend backward-compat (e.g. `tokenEarned` → `walletBalance`, `likes` → `likeCount`, `views`/`viewsCount` → `viewCount`) — use the non-deprecated field in new code.
- File uploads (`uploadApi.uploadImage`, `documentApi.upload`, `speechApi.transcribe`) bypass the JSON helpers and build `FormData` directly, with a web-vs-native branch (web needs a real `Blob`, native uses the RN `{uri,name,type}` shape).
- Realtime (buddy chat, video call signaling) goes over a WebSocket at `WS_BASE_URL` — construct the URL via `getWebSocketUrl()` so the auth token query param is attached consistently.

### Sharing & deep links

`lib/share.ts` (`shareWithAppLink`, used via `components/AppState.tsx`'s `sharePost` or directly) is the one way to share anything that should reopen in-app: it wraps an in-app path (e.g. `"community?postId=abc123"`) into `https://thenura.care/app?deeplink=<path>`, which falls back to the Play Store listing if the app isn't installed (`Marketing website/src/pages/AppRedirect.jsx`, separate repo). Don't call `Share.share` directly for shareable in-app content — use `shareWithAppLink` so the link actually reopens the right screen instead of just launching the app cold. Screens that can be deep-linked into read their target id from `useLocalSearchParams` (see `community.tsx`'s `postId`, `blogs.tsx`'s `slug`, `partner-connect.tsx`'s `code`) and resolve it themselves after mount.

Two link shapes can arrive: the bare custom scheme (`thenura://community?postId=abc123`), which expo-router routes automatically, and the `https://thenura.care/app?deeplink=...` wrapper above, which needs one extra unwrap — done in `app/_layout.tsx` via `lib/deeplink.ts#resolveDeepLink`, listening on `Linking.getInitialURL()`/`addEventListener("url", ...)`. For the https form to open the app directly instead of the browser (true one-tap open), `app.json`'s `ios.associatedDomains` / `android.intentFilters` need matching `apple-app-site-association`/`assetlinks.json` files hosted on the marketing site — that verification file is out of this repo.

### Styling

NativeWind (Tailwind for RN) via `tailwind.config.js` / `global.css`, plus `components/theme.tsx` (light/dark, hydrated before first paint) and `components/ui-tokens.ts` for shared design tokens (including `getSeverityColor` for danger/warning/success by numeric threshold). `ThemeColors` has two extra category accents beyond the rose/lavender/mint trio — `sky` (blue) and `gold` — added for the day-log modal and Graphs & Reports; `getSoftTints`/`getLogCategoryTints` (`ui-tokens.ts`) expose them alongside the rest as pale-bg/solid-fg pairs.

**Fonts:** exactly two typefaces app-wide — Manrope (`fonts.heading`/`fonts.body`) for all headings and body copy, IBM Plex Mono (`fonts.mono`/`fonts.monoSemiBold`) for numeric/code-like content (streaks, OTPs, stats). Both are loaded once in `app/_layout.tsx` via `useFonts`; don't add other font families without updating `ThemeFonts` there too. Since NativeWind's `font-*` classes only set `fontWeight` (no `fontFamily` in `tailwind.config.js`), `app/_layout.tsx` also sets `Text`/`TextInput` `defaultProps.style` to Manrope so anything that omits an explicit `fontFamily: fonts.body` still renders consistently instead of falling back to the OS default — explicit `fontFamily` on a component still overrides this default.

### Shared screen scaffolding

`components/ScreenHeader.tsx` (back button + title) and `components/LoadingErrorState.tsx` (full-screen loading/error-with-retry) cover the common shape of simple detail screens; its default loading state is the branded `components/Loader.tsx` (bear mascot inside a pulsing/rotating themed ring — use it, or `<Loader fullscreen />`, instead of a bare `ActivityIndicator` for page-level waits); `hooks/useAsyncLoad.ts` collapses the load-on-mount + pull-to-refresh + error-state boilerplate around a single fetcher. `components/EmptyState.tsx` is the shared placeholder for lists/sections that loaded fine but came back empty (distinct from an error; supports a `compact` in-list variant and an optional action button) — use it instead of ad hoc empty copy. `lib/format.ts` holds small shared date formatters like `formatShortDate`. Prefer these over re-implementing the same screen shell.

A full screen shared verbatim across route groups (not just scaffolding) lives in `components/screens/` — e.g. `CommunityScreen.tsx`, re-exported by both `(dashboard)/community.tsx` and `(partner-view)/forum.tsx` — so the two roles can never visually drift apart on a screen that should look identical for both.

### Day-log modal (`components/DayDetailsModal.tsx`)

Opened from the tracker calendar (and Home's Log period/Symptoms/Mood quick actions, via `focusSection`). Every option chip renders as an icon-in-a-colored-circle pill via `renderOption`'s `tint` param, one `getLogCategoryTints()` color per section (Menstrual flow=rose, Ovulation symptoms=success, Sex and sex drive=danger, Mood=accent, Physical symptoms=warning, Vaginal discharge=sky, Digestion and stool=secondary, Pregnancy test=gold, Physical activity=success) — selected state fills the icon circle solid and washes the pill background with the same tint. Categories that already have a typed, backend-owned `DayEntry` field (`flow`, `discharge`, `digestion`, `mood`/`moods`, `skin`, `exercise`) keep using it; categories the backend has no field for (Ovulation symptoms, Sex and sex drive, Pregnancy test, "Blood clots", four extra discharge descriptors, "Nausea") are logged as plain tags into the existing free-form `DayEntry.symptoms: string[]`, so none of that needed a backend change. `MOOD_OPTIONS` (`ui-tokens.ts`) covers the full mood grid, including several `MoodValue`s newer than what `period-buddy-be` (a separate repo, not in this workspace) may validate — if that service enforces `mood`/`moods` as a strict enum, it needs the new values (`frisky`, `moodSwings`, `depressed`, `guilty`, `obsessive`, `lowEnergy`, `apathetic`, `confused`, `selfCritical`) added server-side too.

### Wellness Forest (`app/(app)/forest.tsx`)

`components/ForestScene.tsx` is the ambient sky/hills/weather backdrop (ported from the marketing site, mood set by `CyclePhase`). `components/GrowthTree.tsx` is the actual personal-progress visual: a single tree whose growth stage (`seed → sprout → sapling → tree → bloom`, via `getGrowthStage(health)`) and color vitality are driven entirely by `ForestStatus.currentHealth` (0–100) from `forestApi.getStatus()` — grows a stage with a bounce when care is logged (`isWatering`), droops/dulls when `!todayCareLogged` (`isThirsty`), and reverses smoothly in either direction since it's one continuous scale, not separate "grew"/"wilted" states. `forest.tsx` passes it into `ForestScene`'s `centerpiece` prop, which swaps out the scene's generic 4-species decoration for "your tree in your forest," and reuses the same component (smaller, no thirst) to render each past cycle in the Cycle Tree Logs history list, so live and historical tree states share one visual language.

### Voice input

`hooks/useVoiceInput.ts` wraps `expo-audio` recording (with metering enabled) behind `{ handleMicPress, isRecording, isTranscribing, level }`: tap-to-start/tap-to-stop always works, and when `voiceMode` is true it also auto-stops and transcribes after ~3s of on-device silence (via live dB metering), calling `onTranscript`. `components/VoiceOrb.tsx` is the reusable animated mic (Reanimated pulsing rings driven by `level`, themed via `colors.primary`/`colors.accent`/`colors.danger`). `components/VoiceModeOverlay.tsx` is a full-screen `Modal` — centered large `VoiceOrb`, rotating sci-fi sweep rings, and a status line (listening/thinking/speaking) — that `app/(app)/qa.tsx` and `app/(app)/document-chat.tsx` render whenever `voiceMode` is true; both screens also run a small effect that auto re-arms the mic (`handleMicPress`) whenever voice mode is idle (not recording/transcribing/replying/speaking), so the mic opens automatically on entering voice mode and after each spoken reply, Assistant-style.

### Platform-specific files

Some components have a `.web.tsx` variant (e.g. `components/BuddyVideoCall.tsx` / `.web.tsx`) for APIs that differ between native and web (WebRTC).

## Notes

- Expo SDK has changed significantly — check `https://docs.expo.dev/versions/v54.0.0/` before writing Expo API code rather than relying on older training data.
- Sensitive local files present but gitignored/untracked in normal flow: `.env`, `.env.local`, `assets/GoogleService-Info.plist`, `assets/google-services.json` — never print or commit their contents.
