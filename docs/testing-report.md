# Testing report: 2026-10-24

Everything below was actually run on macOS in this repo, on branch `docs/product-audit`.

## Run and passed

| Check | Command | Before change | After change |
|---|---|---|---|
| Unit tests | `npm test` | exit 0 | **236 / 236 pass**, exit 0 |
| Lint (same as CI) | `npm run lint` | exit 0 | exit 0, no warnings |
| Type check | `npx tsc --noEmit -p .` | exit 0 | exit 0 |

New tests are in `lib/__tests__/urgentSafety.test.ts` (6 tests, all pass):

- English medical red flags: hourly pad, fainting, pregnancy with cramps or spotting, bleeding after sex or menopause, fever with pelvic pain, sudden severe pain, can't stand.
- Hindi and Hinglish red flags, in Latin script and Devanagari.
- Self-harm, in English and Hindi.
- **Not urgent:** brown blood, ordinary cramps, dizziness on its own, "can I get pregnant on my period", menstrual cup, empty input.
- Hindi reply for Devanagari questions; both replies contain 112 and 14416.
- The offline fallback now escalates phrases the old keywords missed, and still answers ordinary questions.

The existing `lib/__tests__/qaFallback.test.ts` passes unchanged, so every old urgent trigger still escalates.

## Not run (blocked or out of scope)

| Check | Why | How to run it |
|---|---|---|
| On-device UI check of the call buttons | No emulator or device in this session | See "Manual check" below |
| Android release build | Needs EAS credentials and the local keystore | `eas build --platform android --profile preview` |
| Backend tests | Backend not changed; it has a colleague's uncommitted work | `cd ../period-buddy-be && npm test` |
| Navigation, auth, payment, upload E2E | The project has no E2E or component test harness | — |

## Manual check (staging)

1. Make sure your local `.env` has `EXPO_PUBLIC_APP_ENV=stage`. Don't set `EXPO_PUBLIC_API_BASE_URL`, which would override it. Then run `npx expo start` and open the app on an Android dev build or Expo Go.
2. Sign in with a staging account and open Nura AI → Ask anything.
3. Send "I fainted and I'm bleeding a lot".
   - Expected: a red "Please get care soon" reply with **Call 112** and **Tele-MANAS 14416** buttons.
   - Tap each one: the dialer should open with the number filled in, and nothing is dialled automatically.
4. Turn on airplane mode, start a new chat and send "sex ke baad khoon aa raha hai". Expected: the same red reply offline, labelled "Offline answer · not saved", with the buttons.
5. Still offline, send "Is brown blood normal?" Expected: the ordinary brown-blood answer with no red card.
6. Sign up a new staging account. Expected: the birthday step shows "So Nura's advice and answers fit your age." under the title.
7. Repeat steps 3 and 6 in dark mode and at the largest system font size. Check the buttons wrap instead of overflowing.
