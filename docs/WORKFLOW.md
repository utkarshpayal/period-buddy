# How we work — all Nura repos

One flow for every repo, for people and for Claude Code. Each repo's
`CLAUDE.md` starts with a short "Working rules" block that points here, and a
guard hook (`.claude/hooks/guard.mjs`) enforces the parts that must never be
skipped. System design lives in [ARCHITECTURE.md](./ARCHITECTURE.md); this doc
is about how changes move.

## 1. Repos and environments

| Repo | What | Staging | Production |
|---|---|---|---|
| `period-buddy` | Mobile app (Expo) | EAS `preview` / `development` builds → stage backend | EAS `production` build → Play Store |
| `period-buddy-be` | Backend API | `staging` branch → pipeline `nura-stage-api` → `https://stage.backend.thenura.care` | `main` → pipeline `the-nura-care-be` → `https://www.backend.thenura.care` |
| `period-buddy-content` | Admin Workspace | `staging` branch → `https://staging.admin.thenura.care` | `main` → `https://admin.thenura.care` |
| `the-nura-care-cms` | App CMS | `staging` branch → `https://staging.cms.thenura.care` | `main` → `https://cms.thenura.care` |
| `The-Nura-website` | Marketing site | `staging` branch → Vercel preview | `main` → `https://thenura.care` |

Video calls run on the Jitsi host `meet.thenura.care` (Lightsail `nura-meeting`),
shared by both environments. AWS (account `740726746628`, ap-south-1) holds
both backends, so an AWS command can hit production even from a staging task.

**Staging must never touch production data:** its own database, uploads
bucket, `JWT_SECRET`, `DATA_ENCRYPTION_KEYS` and `CASHFREE_ENV=sandbox`, and
the staging sites call only the stage backend (the prod backend's CORS refuses them).

## 2. Branches

```
feat/<name> ─┐
fix/<name>  ─┼─ PR ─▶ staging ── test on staging ── PR ─▶ main ─▶ production
chore/<name>─┘                                     (release)
```

- `main` = what's live. It changes **only** through a reviewed PR from
  `staging` (a release) or a hotfix PR. Nobody pushes to it directly.
- `staging` = the next release, deployed to the staging environment on every
  push. It changes through PRs from feature branches.
- Work happens on short-lived branches cut from `origin/staging`:
  `feat/…`, `fix/…`, `chore/…`, `docs/…`, `refactor/…`.
- Never force-push `main` or `staging`. On your own branch use
  `--force-with-lease`.
- **Hotfix:** branch `fix/<name>` from `origin/main`, PR to `main`, then merge
  `main` back into `staging` so the fix isn't lost on the next release.
- After a release, `staging` and `main` should hold the same code. If `main`
  has commits `staging` lacks (a hotfix, a merge commit), merge `main` into
  `staging`.

## 3. Commits and PRs

- Commit and PR titles: `<type>(<scope>): <summary>`. Type is one of
  `feat | fix | refactor | perf | docs | chore | test | ci | revert`; the
  summary is imperative, lowercase and ≤ 72 characters.
  Release PRs (`staging` → `main`): `release: <yyyy-mm-dd> — <theme>`.
- One topic per PR. Each repo has a PR template: fill in its checklist.
- A PR is mergeable when its CI is green (lint/test/build plus the security
  workflow: npm audit, secret scan, CodeQL) and someone other than the author
  has reviewed it. Turn this on in GitHub → Settings → Branches for `main`
  and `staging` (require a PR, require status checks).

## 4. Checks before "done"

Run the repo's checks locally before you push or report a task as done. They
are the same checks CI runs.

| Repo | Checks |
|---|---|
| `period-buddy` | `npm run lint` · `npm test` |
| `period-buddy-be` | `npm run lint` · `npm test` (plus `npm run swagger:generate` after route changes) |
| `period-buddy-content` | `npm run build` (type-check + build) |
| `the-nura-care-cms` | `npm run build` (type-check + build) |
| `The-Nura-website` | `npm run lint` · `npm run build` |
| any repo | `node --test .claude/hooks/guard.test.mjs` after changing the guard |

If a check fails, say so with the output. Don't report work as done that wasn't verified.

## 5. Secrets and environment variables

- Real values live only in AWS Secrets Manager (`nura/api/env`,
  `nura-stage/api/env`), EAS environment variables and Vercel project
  settings. Never in git, chat, logs, docs or screenshots.
- Local `.env*` files are gitignored. Don't read, print or copy them;
  `.env.example` lists the key names.
- **Adding a variable:** add it to `.env.example` with a comment, then to
  the prod **and** stage secret (backend) or to Vercel/EAS for every
  environment, then redeploy. The secret is only read at deploy time.
- Frontend `VITE_*` / `EXPO_PUBLIC_*` values are baked in at build time and are
  public. Never put a secret in one.
- A leaked secret is rotated, not just deleted from git history.

## 6. Releasing

| Repo | How it ships | After merging to `main` |
|---|---|---|
| Backend | CodePipeline builds, tests, deploys and health-checks; a failed deploy rolls back | Check `https://www.backend.thenura.care/health/ready` and the pipeline |
| Admin / CMS / Website | Vercel builds `main` | Open the site; hard-refresh |
| Mobile app | `eas build --profile production`, then submit in Play Console | Bump the version first (see the app's `CLAUDE.md`, "Versioning") |

Order when a change spans repos: **backend first** (new fields optional,
nothing removed), then the frontends and the app, then clean-up of old fields
once no shipped app version needs them. The app can't be rolled back on
people's phones, so the backend must keep answering older app versions.

## 7. Cross-repo contracts

Change both sides in the same piece of work, or the other side silently ignores it:

| Change | Also update |
|---|---|
| Backend endpoint added/changed | App `lib/api/` + `docs/API_REFERENCE.md`; backend `docs/API_DOCUMENTATION.md` + Swagger |
| Feature key (`FEATURE_REGISTRY`) | Backend `constants/appCatalog.js` (same key, route, placement) |
| Chat topics | App `lib/chatTopics.ts` ↔ backend `utils/companionChat.js#CHAT_TOPICS` |
| Admin notification icons | App `ADMIN_NOTIFICATION_ICONS` ↔ backend `NOTIFICATION_ICONS` |
| Support categories/limits | App `lib/support.ts` ↔ backend `utils/supportTicket.js` |
| Password rules | App `lib/password.ts` ↔ backend `validatePasswordStrength` |
| Pricing rules and copy | Backend `utils/pricing.js` (rules, `PRICING_2026`) ↔ app `lib/pricing.ts` ↔ website `src/lib/pricing.js` (fallback prices). Live prices are database rows; the website and app read `GET /api/subscriptions/pricing` |
| A new site/origin | Backend `ALLOWED_ORIGINS` in the matching secret |
| System shape (repo, service, AWS) | `docs/ARCHITECTURE.md` (here) and backend `docs/INFRASTRUCTURE.md` |
| Security behaviour | Backend `docs/SECURITY.md` and the website's `/security` page |

## 8. Rules for Claude Code

These are in every repo's `CLAUDE.md`. The guard hook blocks the ones marked 🔒.

1. **Branch first.** New work goes on `<type>/<name>` from `origin/staging`.
   🔒 No commits on `main`.
2. 🔒 **Never push to `main`** and never force-push `main`/`staging`. Push your
   branch only when asked, then say a PR to `staging` is needed (or open one if
   `gh` is available).
3. **Don't touch other people's work.** If the tree has uncommitted changes you
   didn't make, leave them: don't commit, stash, reset or discard them. Use a
   `git worktree` from `origin/staging` instead.
4. 🔒 **Secrets:** never read, print, copy or commit `.env*` (except
   `.env.example`), keystores or credentials, and never read secret values from
   AWS. Say which key needs what value and let the person set it.
5. 🔒 **Production is opt-in.** Read-only checks (health URLs, `describe`/`list`,
   logs) are fine. Anything that changes AWS, Vercel, EAS production or live
   data needs the person's explicit go-ahead in that conversation. The hook asks
   every time. Prefer doing and testing it on staging first.
6. **Verify before done:** run the checks in §4 and report results honestly.
7. **Docs in the same change:** update `CLAUDE.md`, the API docs and the
   contracts in §7 together with the code. Keep each repo's `CLAUDE.md` current.
8. **Stay in scope.** Do what was asked; list other problems you notice
   instead of fixing them unasked.
9. **Work inline.** Don't spawn subagents unless asked: they're slower and cost more.
10. **Versioning** (app only) follows `staging`'s version and is bumped only when asked.

## 9. The guard hook

`.claude/hooks/guard.mjs` is identical in all five repos and wired in each
repo's `.claude/settings.json`:

- **SessionStart:** tells Claude the current branch, whether there are
  uncommitted changes (someone else's work) and how far behind `origin/staging` it is.
- **PreToolUse (deny):** pushes to `main`, force-pushes to `main`/`staging`,
  `--force` without lease, commits/merges on `main`, committing secret files,
  reading or editing `.env*`/keystores/credentials, `aws secretsmanager
  get-secret-value`, and `rm -rf` of the root, home or repo.
- **PreToolUse (ask):** AWS calls that aren't read-only, SSM commands on
  servers, `eas build --profile production`, `eas submit`, production
  `eas update`, EAS env changes, and Vercel production/env/domain commands.

Changing it: edit the copy in one repo, run `node --test .claude/hooks/guard.test.mjs`,
then copy both files to the other four repos in the same change.
Personal overrides go in `.claude/settings.local.json` (gitignored), never in the shared file.
