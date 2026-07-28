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
  - `(app)/(partner-view)/` — separate `home` shown when the signed-in user is a connected partner "viewer" rather than the data owner (see `AuthUser.partnerRole`).

### Data layer (`lib/api.ts`)

All backend access goes through one file: typed request helpers (`apiRequest`, `apiEnvelopeRequest`) plus one `xApi` object per domain (`authApi`, `cycleApi`, `habitsApi`, `forestApi`, `consultationApi`, `partnerApi`, `buddyApi`, `nominationsApi`, `communityApi`, `blogsApi`, `reelsApi`, `healthIssuesApi`, `wellbeingApi`, `questionAnswerApi`, `uploadApi`, `documentApi`, `speechApi`, `reportApi`). Every response envelope is `{ data, error, message, ... }`; `apiRequest` unwraps `.data`, `apiEnvelopeRequest` returns the raw envelope (used for auth flows that need `token`/`user`/`isProfileComplete` alongside data).

- Auth token is stored in AsyncStorage under `period-buddy.auth-session` (`AUTH_SESSION_KEY`) and attached as `Authorization: Bearer` automatically; pass `skipAuth: true` for public endpoints.
- A 401 triggers a global `onUnauthorized` handler registered by `AuthProvider`, which clears the local session — don't hand-roll 401 handling per screen.
- Several types carry `@deprecated` fields kept for backend backward-compat (e.g. `tokenEarned` → `walletBalance`, `likes` → `likeCount`, `views`/`viewsCount` → `viewCount`) — use the non-deprecated field in new code.
- File uploads (`uploadApi.uploadImage`, `documentApi.upload`, `speechApi.transcribe`) bypass the JSON helpers and build `FormData` directly, with a web-vs-native branch (web needs a real `Blob`, native uses the RN `{uri,name,type}` shape).
- Realtime (buddy chat, video call signaling) goes over a WebSocket at `WS_BASE_URL` — construct the URL via `getWebSocketUrl()` so the auth token query param is attached consistently.

### Styling

NativeWind (Tailwind for RN) via `tailwind.config.js` / `global.css`, plus `components/theme.tsx` (light/dark, hydrated before first paint) and `components/ui-tokens.ts` for shared design tokens.

### Platform-specific files

Some components have a `.web.tsx` variant (e.g. `components/BuddyVideoCall.tsx` / `.web.tsx`) for APIs that differ between native and web (WebRTC).

## Notes

- Expo SDK has changed significantly — check `https://docs.expo.dev/versions/v54.0.0/` before writing Expo API code rather than relying on older training data.
- Sensitive local files present but gitignored/untracked in normal flow: `.env`, `.env.local`, `assets/GoogleService-Info.plist`, `assets/google-services.json` — never print or commit their contents.
