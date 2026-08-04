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
- `(app)/` — authenticated app, one screen per top-level feature (tracker, habits, forest, consultation, community, blogs, reels, documents, document-chat, qa, health-issues, hygiene, sexual-wellbeing, buddy-nomination, partner, app-lock, ...).
  - `(app)/(dashboard)/` — the main tab bar: `home`, `tracker`, `community`, `profile`.
  - `(app)/(partner-view)/` — shown when the signed-in user is a connected partner "viewer" rather than the data owner (see `AuthUser.partnerRole`). Has its own floating tab bar (`_layout.tsx`) matching `(dashboard)/_layout.tsx`'s look exactly (same sizes/colors/center-avatar treatment): `home` (read-only shared overview), `chat` (owner↔partner messaging), `ai-chat` (center avatar, same mic-permission-gated voice assistant), `community` (identical UI to the owner's — both re-export `components/screens/CommunityScreen.tsx`), `profile` (partner's own account: notifications, app lock, disconnect, logout). Cross-tab state (profile, notifications, live chat messages, the one WebSocket connection) lives in `_state.tsx`'s `PartnerViewStateProvider`/`usePartnerViewState()`, since Tabs screens are siblings and would otherwise each re-fetch/reconnect independently.

### Data layer (`lib/api.ts`)

All backend access goes through one file: typed request helpers (`apiRequest`, `apiEnvelopeRequest`) plus one `xApi` object per domain (`authApi`, `cycleApi`, `habitsApi`, `forestApi`, `consultationApi`, `partnerApi`, `buddyApi`, `nominationsApi`, `communityApi`, `blogsApi`, `reelsApi`, `healthIssuesApi`, `wellbeingApi`, `questionAnswerApi`, `uploadApi`, `documentApi`, `speechApi`, `reportApi`, `insightsApi`, `screeningApi`). Every response envelope is `{ data, error, message, ... }`; `apiRequest` unwraps `.data`, `apiEnvelopeRequest` returns the raw envelope (used for auth flows that need `token`/`user`/`isProfileComplete` alongside data).

- `cycleApi.getSymptomPredictions()` — `GET /api/cycle/symptom-predictions`, per-symptom likelihood by cycle phase derived from the user's own logged history; powers `app/(app)/symptom-predictions.tsx`.
- `insightsApi.getDaily()` — `GET /api/insights/daily`, personalized daily hormone/mood/energy/skin insight plus exercise/nutrition/sleep/wellness suggestion lists; powers `app/(app)/insights.tsx`.
- `screeningApi` (`getQuestions`, `submitAssessment`, `getHistory`) — `/api/screening/*`, the PCOS/endometriosis/fibroid/thyroid symptom checker flow; powers `app/(app)/symptom-checker.tsx`.

- `lib/cycle.ts` is the canonical source for the `CyclePhase` type and `getCyclePhase(cycleDay, periodLength, cycleLength)` — import it instead of re-deriving cycle phase locally (tracker, forest, symptom predictions, and `DayEntry.phase` in `lib/api.ts` all use it).
- `hooks/useUserStats.ts` is the canonical source for streak/wallet numbers (`{ streakCount, walletBalance }`); it fetches the dashboard once and syncs it into auth-context. Screens should consume this hook instead of reading `user.streakCount`/`user.walletBalance`/`user.tokenEarned` directly, so streak/points never drift between screens.
- Auth token is stored in AsyncStorage under `period-buddy.auth-session` (`AUTH_SESSION_KEY`) and attached as `Authorization: Bearer` automatically; pass `skipAuth: true` for public endpoints.
- A 401 triggers a global `onUnauthorized` handler registered by `AuthProvider`, which clears the local session — don't hand-roll 401 handling per screen.
- Several types carry `@deprecated` fields kept for backend backward-compat (e.g. `tokenEarned` → `walletBalance`, `likes` → `likeCount`, `views`/`viewsCount` → `viewCount`) — use the non-deprecated field in new code.
- File uploads (`uploadApi.uploadImage`, `documentApi.upload`, `speechApi.transcribe`) bypass the JSON helpers and build `FormData` directly, with a web-vs-native branch (web needs a real `Blob`, native uses the RN `{uri,name,type}` shape).
- Realtime (buddy chat, video call signaling) goes over a WebSocket at `WS_BASE_URL` — construct the URL via `getWebSocketUrl()` so the auth token query param is attached consistently.

### Sharing & deep links

`lib/share.ts` (`shareWithAppLink`, used via `components/AppState.tsx`'s `sharePost` or directly) is the one way to share anything that should reopen in-app: it wraps an in-app path (e.g. `"community?postId=abc123"`) into `https://thenura.care/app?deeplink=<path>`, which falls back to the Play Store listing if the app isn't installed (`Marketing website/src/pages/AppRedirect.jsx`, separate repo). Don't call `Share.share` directly for shareable in-app content — use `shareWithAppLink` so the link actually reopens the right screen instead of just launching the app cold. Screens that can be deep-linked into read their target id from `useLocalSearchParams` (see `community.tsx`'s `postId`, `blogs.tsx`'s `slug`, `partner-connect.tsx`'s `code`) and resolve it themselves after mount.

Two link shapes can arrive: the bare custom scheme (`thenura://community?postId=abc123`), which expo-router routes automatically, and the `https://thenura.care/app?deeplink=...` wrapper above, which needs one extra unwrap — done in `app/_layout.tsx` via `lib/deeplink.ts#resolveDeepLink`, listening on `Linking.getInitialURL()`/`addEventListener("url", ...)`. For the https form to open the app directly instead of the browser (true one-tap open), `app.json`'s `ios.associatedDomains` / `android.intentFilters` need matching `apple-app-site-association`/`assetlinks.json` files hosted on the marketing site — that verification file is out of this repo.

### Styling

NativeWind (Tailwind for RN) via `tailwind.config.js` / `global.css`, plus `components/theme.tsx` (light/dark, hydrated before first paint) and `components/ui-tokens.ts` for shared design tokens (including `getSeverityColor` for danger/warning/success by numeric threshold).

**Fonts:** exactly two typefaces app-wide — Manrope (`fonts.heading`/`fonts.body`) for all headings and body copy, IBM Plex Mono (`fonts.mono`/`fonts.monoSemiBold`) for numeric/code-like content (streaks, OTPs, stats). Both are loaded once in `app/_layout.tsx` via `useFonts`; don't add other font families without updating `ThemeFonts` there too. Since NativeWind's `font-*` classes only set `fontWeight` (no `fontFamily` in `tailwind.config.js`), `app/_layout.tsx` also sets `Text`/`TextInput` `defaultProps.style` to Manrope so anything that omits an explicit `fontFamily: fonts.body` still renders consistently instead of falling back to the OS default — explicit `fontFamily` on a component still overrides this default.

### Shared screen scaffolding

`components/ScreenHeader.tsx` (back button + title) and `components/LoadingErrorState.tsx` (full-screen loading/error-with-retry) cover the common shape of simple detail screens; `hooks/useAsyncLoad.ts` collapses the load-on-mount + pull-to-refresh + error-state boilerplate around a single fetcher. `lib/format.ts` holds small shared date formatters like `formatShortDate`. Prefer these over re-implementing the same screen shell.

A full screen shared verbatim across route groups (not just scaffolding) lives in `components/screens/` — e.g. `CommunityScreen.tsx`, re-exported by both `(dashboard)/community.tsx` and `(partner-view)/forum.tsx` — so the two roles can never visually drift apart on a screen that should look identical for both.

### Voice input

`hooks/useVoiceInput.ts` wraps `expo-audio` recording (with metering enabled) behind `{ handleMicPress, isRecording, isTranscribing, level }`: tap-to-start/tap-to-stop always works, and when `voiceMode` is true it also auto-stops and transcribes after ~3s of on-device silence (via live dB metering), calling `onTranscript`. `components/VoiceOrb.tsx` is the reusable animated mic (Reanimated pulsing rings driven by `level`, themed via `colors.primary`/`colors.accent`/`colors.danger`). `components/VoiceModeOverlay.tsx` is a full-screen `Modal` — centered large `VoiceOrb`, rotating sci-fi sweep rings, and a status line (listening/thinking/speaking) — that `app/(app)/qa.tsx` and `app/(app)/document-chat.tsx` render whenever `voiceMode` is true; both screens also run a small effect that auto re-arms the mic (`handleMicPress`) whenever voice mode is idle (not recording/transcribing/replying/speaking), so the mic opens automatically on entering voice mode and after each spoken reply, Assistant-style.

### Platform-specific files

Some components have a `.web.tsx` variant (e.g. `components/BuddyVideoCall.tsx` / `.web.tsx`) for APIs that differ between native and web (WebRTC).

## Notes

- Expo SDK has changed significantly — check `https://docs.expo.dev/versions/v54.0.0/` before writing Expo API code rather than relying on older training data.
- Sensitive local files present but gitignored/untracked in normal flow: `.env`, `.env.local`, `assets/GoogleService-Info.plist`, `assets/google-services.json` — never print or commit their contents.
