# The Nura Care — Mobile App

Period and women's-health companion app for Android and iOS: cycle tracking,
predictions and insights, an AI assistant (text + voice), partner view, the
Period Buddy community with chat and video calls, gynaecologist consultations,
document Q&A, habits, reels and government schemes.

Expo SDK 54 · React Native 0.81 · React 19 · Expo Router (file-based routing) ·
NativeWind (Tailwind) · TypeScript.

| | |
|---|---|
| App ID (Android + iOS) | `com.uvin124.thenura` |
| Deep-link schemes | `thenura://`, `com.uvin124.thenura://` |
| Backend (production) | `https://www.backend.thenura.care` ([period-buddy-be](https://github.com/utkarshpayal/period-buddy-be)) |
| Builds | [EAS](https://expo.dev), owner `utkarsh-payal` |

---

## Quick start

Requirements: Node.js 20 and npm. To run on a device you also need an installed
development build (see below), or Android Studio / Xcode.

```bash
npm install
cp .env.example .env
npx expo start
```

- **API URL:** in dev, if `EXPO_PUBLIC_API_BASE_URL` is empty, the app calls a
  backend on your computer (`http://<dev-server-host>:5000`). Either run the backend repo
  with `npm run dev`, or set the variable to `https://www.backend.thenura.care` to use production.
- **Use a development build, not Expo Go.** The app uses native modules that Expo Go
  doesn't include (WebRTC video/voice calls, among others). Build one once with
  `eas build --profile development --platform android` (or `ios`), install it, and
  `npx expo start` connects to it.

### Environment variables (`.env`)

| Key | Purpose |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend URL (see above) |
| `EXPO_PUBLIC_GOOGLE_{WEB,IOS,ANDROID,EXPO}_CLIENT_ID` | Google Sign-In OAuth client IDs (must match the backend's) |

`EXPO_PUBLIC_*` values are **bundled into the app** and readable by anyone, so never
put secrets in them. EAS builds take these values from `eas.json` (`base` profile), not from `.env`.
Full list: [docs/SETUP.md](docs/SETUP.md).

---

## Scripts

| Command | What it does |
|---|---|
| `npx expo start` / `npm start` | Metro dev server |
| `npm run android` / `npm run ios` | Start and open on an emulator/simulator |
| `npm run lint` | ESLint (`expo lint`), also run in CI |
| `npx tsc --noEmit` | Type-check |

## Building releases (EAS)

```bash
eas build --platform android --profile preview        # installable APK for testing
eas build --platform ios --profile preview_ios        # iOS simulator build
eas build --platform android --profile production     # Play Store build (auto version bump)
eas build --platform ios --profile production         # App Store build
```

Profiles live in [`eas.json`](eas.json). Every profile extends `base`, which sets the
production API URL and Google client IDs. Android signing uses **local credentials**
(`credentials.json` + a `.jks` keystore). They're gitignored, so keep a secure backup:
without the keystore, the Play Store listing can't be updated.

---

## Project structure

```
app/                     Screens (Expo Router: file path = route)
├── index.tsx            Launch / auth redirect
├── (tabs)/              Signed-out: login, signup, partner-connect
└── (app)/               Signed-in
    ├── (dashboard)/     Bottom tabs: home, tracker, ai-chat, community, profile
    ├── (partner-view)/  What a linked partner sees
    └── *.tsx            Feature screens (consultation, documents, habits, reels, …)
components/              Shared UI: theme, auth context, paywall/subscription,
                         video calls, Cashfree checkout, modals, …
hooks/                   Data loading, pagination, payments, subscription access,
                         realtime socket, voice input
lib/                     Non-UI logic: API client (api.ts), cycle maths, notifications,
                         deep links, health reports, Cashfree UPI, …
assets/
├── images/brand/        App icon, splash logo, in-app logo (+ source/ originals)
├── images/illustrations/
├── sounds/              Custom notification sound
├── fonts/               Manrope, IBM Plex Mono
└── google-services.json, GoogleService-Info.plist   Firebase client configs
docs/                    Product and technical documentation (see below)
scripts/                 Local helper scripts that inspect the database (read MONGODB_URI from .env.local)
app.json, app.config.js  Expo config (app.config.js lets EAS override the Firebase files)
eas.json                 EAS build profiles
```

---

## Documentation

| Doc | Read it for |
|---|---|
| [docs/README.md](docs/README.md) | Index of every doc, plus where each asset lives |
| [docs/SETUP.md](docs/SETUP.md) | Full local setup for app + backend, every env var |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How app, backend, database and AI vendors fit together |
| [docs/FEATURES.md](docs/FEATURES.md) | Every screen and how it works |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Backend endpoints the app calls |
| [docs/PRD.md](docs/PRD.md) | Product requirements |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | Detailed architecture notes (for AI assistants and humans) |

## Contributing

1. Branch from `main`, open a PR. CI runs `npm ci` + `npm run lint`.
2. Run `npx tsc --noEmit` before pushing.
3. New screen? Add a file under `app/`; the route follows the path.
4. Never commit `.env*`, `credentials.json`, `credentials/` or `*.jks` (they're gitignored).
