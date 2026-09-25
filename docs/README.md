# Documentation Index

| Doc | For |
|---|---|
| [PRD.md](./PRD.md) | Product requirements — problem, goals, scope, functional/non-functional requirements, risks. |
| [FEATURES.md](./FEATURES.md) | Product guide — every screen, what it does, how to use it. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the frontend, backend, database, and AI vendor fit together. |
| [SETUP.md](./SETUP.md) | Get both repos running locally; every environment variable explained; contribution conventions. |
| [API_REFERENCE.md](./API_REFERENCE.md) | Every backend endpoint the frontend calls, grouped by feature. |
| [PAGE-BY-PAGE-FEATURES.md](./PAGE-BY-PAGE-FEATURES.md) | Screen-by-screen feature breakdown. |
| [FEATURES-AND-PITCH.md](./FEATURES-AND-PITCH.md) | Feature list written as a product pitch. |
| [FEATURES.html](./FEATURES.html) | Printable/shareable HTML version of the product guide. |
| [fixes.md](./fixes.md) | Code review findings and their status. Code comments cite its sections (e.g. "see docs/fixes.md §2"). |

## Where assets live

| Folder | Contents |
|---|---|
| `assets/images/brand/` | `app-icon.png` (app/adaptive/notification icon, favicon), `logo-full.png` (splash), `logo-mark.png` (in-app logo) |
| `assets/images/brand/source/` | Original logo files with backgrounds, not used by the app, kept for design work |
| `assets/images/illustrations/` | In-app illustrations (`nura-avatar.png`: tab-bar centre / Q&A avatar) |
| `assets/sounds/` | `notification.wav`: custom push sound (registered in `app.json` → expo-notifications) |
| `assets/fonts/` | Manrope + IBM Plex Mono, loaded in `app/_layout.tsx` |
| `assets/*.json`, `*.plist` | Firebase client configs used by EAS builds (`app.json`) |

For deeper technical detail than these give, see:

- `/CLAUDE.md` (project root) — the living, most-detailed architecture doc
  for this repo, kept in sync with the code on every change.
- Backend repo's `CLAUDE.md`, `README.md`, and `docs/` (`API_DOCUMENTATION.md`,
  `INFRASTRUCTURE.md`, `AI_ML_OVERVIEW.md`).
