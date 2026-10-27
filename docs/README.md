# Documentation — Mobile app (`period-buddy`)

All of this repo's docs live in this folder. `README.md`, `CLAUDE.md` and
`AGENTS.md` stay at the repo root because GitHub and coding tools look for them
there.

## Start here

| Doc | For |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | **The system-wide picture**: all five repos, the API, database, AWS, roles, deploys. The only copy; other repos link here. |
| [WORKFLOW.md](./WORKFLOW.md) | **How changes move** in every repo: environments, branches, PRs, checks, secrets, releases, cross-repo contracts, and the rules for Claude Code. |
| [SETUP.md](./SETUP.md) | Run the app and backend locally; every environment variable. |
| [API_REFERENCE.md](./API_REFERENCE.md) | Every backend endpoint the app calls, grouped by `lib/api/` object. |
| [BODY_MAP.md](./BODY_MAP.md) | The Body Map: data sources, the CC0 3D model and how to regenerate it, rendering, safety. |
| [security-implementation.md](./security-implementation.md) | How the app side of security and privacy works (keystore, screen privacy, sessions, AI consent, exports). |
| [../CLAUDE.md](../CLAUDE.md) | The most detailed, always-current technical notes for this repo. |

## Product

| Doc | For |
|---|---|
| [PRD.md](./PRD.md) | Product requirements: problem, goals, scope, risks. |
| [FEATURES.md](./FEATURES.md) | Every screen, what it does, how to use it. |
| [PAGE-BY-PAGE-FEATURES.md](./PAGE-BY-PAGE-FEATURES.md) | Screen-by-screen breakdown. |
| [FEATURES-AND-PITCH.md](./FEATURES-AND-PITCH.md) | The feature list written as a pitch. |
| [FEATURES.html](./FEATURES.html) | Printable export of the product guide (from 2026-09-21; FEATURES.md is newer). |

## History

| Doc | For |
|---|---|
| [fixes.md](./fixes.md) | Code-review findings and their status. Code comments cite its sections (e.g. "see docs/fixes.md §2"). |

## Where assets live

| Folder | Contents |
|---|---|
| `assets/images/brand/` | `app-icon.png` (app/adaptive/notification icon, favicon), `logo-full.png` (splash), `logo-mark.png` (in-app logo), adaptive icon layers |
| `assets/images/brand/source/` | Original logo files, kept for design work, not used by the app |
| `assets/images/illustrations/` | In-app illustrations (`nura-avatar.png`: tab-bar centre / Q&A avatar) |
| `assets/sounds/` | `notification.wav`: custom push sound |
| `assets/fonts/` | Manrope (embedded natively) + IBM Plex Mono |
| `assets/*.json`, `*.plist` | Firebase client configs used by EAS builds (public by design) |

## All Nura repos

| Repo | What | Its docs |
|---|---|---|
| [period-buddy](https://github.com/utkarshpayal/period-buddy) (`The-Nura-App`) | Mobile app | [docs/](https://github.com/utkarshpayal/period-buddy/tree/main/docs), including the system [ARCHITECTURE.md](https://github.com/utkarshpayal/period-buddy/blob/main/docs/ARCHITECTURE.md) |
| [period-buddy-be](https://github.com/utkarshpayal/period-buddy-be) (`The-Nura-Backend`) | API | [docs/](https://github.com/utkarshpayal/period-buddy-be/tree/main/docs), including [SECURITY.md](https://github.com/utkarshpayal/period-buddy-be/blob/main/docs/SECURITY.md) and [INFRASTRUCTURE.md](https://github.com/utkarshpayal/period-buddy-be/blob/main/docs/INFRASTRUCTURE.md) |
| [period-buddy-content](https://github.com/utkarshpayal/period-buddy-content) (`The-Nura-Admin-Website`) | Admin Workspace, clinician portal | [docs/](https://github.com/utkarshpayal/period-buddy-content/tree/main/docs) |
| [the-nura-care-cms](https://github.com/utkarshpayal/the-nura-care-cms) (`The-Nura-CMS`) | App CMS | [docs/](https://github.com/utkarshpayal/the-nura-care-cms/tree/main/docs) |
| [The-Nura-website](https://github.com/utkarshpayal/The-Nura-website) (`The-Nura-Marketing-Website`) | Marketing site | [docs/](https://github.com/utkarshpayal/The-Nura-website/tree/main/docs) |

Keeping docs current: a change to architecture, routes, the API surface,
deploys or security updates the matching doc in the same PR.
