# Implementation report: 2026-10-24

Branch `docs/product-audit` (from `origin/staging`, v1.1.7). App only: no backend, config, database or production changes.

## Completed

### 1. One-tap emergency calls on urgent Nura AI replies (P0)
- **Before:** an urgent reply (`source: "urgent_safety"`, from the backend's deterministic check or the offline fallback) showed "call 112 now" as plain text.
- **Now:** the reply bubble has a red **Call 112** button and a **Tele-MANAS 14416** button. Both open the phone's dialer with the number filled in (`tel:`); nothing is dialled automatically. Each has a full accessibility label.
- **File:** `components/qa/QaMessageBubble.tsx`.

### 2. Offline urgent detection matches the backend (P0)
- **New:** `lib/urgentSafety.ts`, pure and tested. It mirrors the backend's urgent patterns in `companionChat.js`: English plus the Hindi/Hinglish set on the open `fix/hindi-urgent-safety` branch. It has:
  - `isUrgentQuestion(text)`
  - `mentionsSelfHarm(text)`
  - the backend's urgent reply in English and Hindi (`urgentReplyFor` picks Hindi for Devanagari text)
  - `TELE_MANAS_NUMBER` (`EMERGENCY_NUMBER` is re-exported from `lib/redFlagScreen.ts`)
- **Changed:** `lib/qaFallback.ts#matchLocalAnswer` checks the backend patterns first, then the existing keywords. The urgent reply text now matches the backend's, which adds bleeding after sex and after menopause. Offline mode is never less cautious than before: every old trigger still escalates.

### 3. Onboarding explains why it asks for a birthday (P1)
- **Change:** a one-line subtitle on the birthday step: "So Nura's advice and answers fit your age."
- **Why that wording:** it's accurate. The date of birth drives the backend's age-banded AI answers, the 18+ chat topic and no tracking for under-18s.
- **File:** `components/onboarding/OnboardingFlow.tsx`.

### 4. Docs
- `docs/product-audit.md`, `docs/improvement-roadmap.md`, this report and `docs/testing-report.md`.
- Indexed in `docs/README.md`.
- `CLAUDE.md` updated: Nura AI urgent handling.

## Files changed

```
components/qa/QaMessageBubble.tsx         call buttons on urgent replies
components/onboarding/OnboardingFlow.tsx  birthday subtitle
lib/urgentSafety.ts                       new: red-flag detection (mirror of backend)
lib/qaFallback.ts                         offline fallback uses it first
lib/__tests__/urgentSafety.test.ts        new: 6 tests
docs/*.md, CLAUDE.md                      audit, roadmap, reports, docs sync
```

## Not done, and why

| Item | State | Reason |
|---|---|---|
| Call buttons in voice mode and document chat | Proposed, next task (roadmap R3) | Kept this change small |
| Backend pattern gap ("pads soaked through") | Proposed | The backend has a colleague's uncommitted work in the same file; not touched |
| Making the birthday skippable | Needs a product decision | Tied to the 13+ gate and minor safety rules |
| Funnel analytics, feedback rating, visit prep, timeline, quiet hours | Proposed (R5–R9) | Each needs backend work or a product call |

## Deployment

- JS-only change: no native modules, no new dependencies, no env vars.
- The project has no `expo-updates`, so it reaches phones only with the next EAS build (nothing native changed).
- Backend: none needed.
