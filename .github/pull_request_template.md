<!--
Title: <type>(<scope>): <summary>   type = feat | fix | refactor | perf | docs | chore | test | ci | revert
       imperative, lowercase, no trailing period, ≤ 72 chars. Release PRs (staging → main): "release: <yyyy-mm-dd> — <theme>"
Feature PRs target `staging`. Flow: https://github.com/utkarshpayal/period-buddy/blob/main/docs/WORKFLOW.md
Delete what doesn't apply.
-->

## Summary

<!-- What and why, in 1–3 sentences. -->

## Changes

-

## Impact

<!-- "None" where nothing applies. -->

- **Backend changes needed / merged first:**
- **New or changed env vars** (EAS, every environment):
- **Needs a new native build** (native module, permission, plugin, icon, font):
- **Version bump needed** (only when releasing):
- **Cross-repo contract touched** (WORKFLOW.md §7):

## How to test

1.

## Checklist

- [ ] Targets `staging` (or is a `staging` → `main` release / hotfix)
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Tested on a device or emulator against the stage backend
- [ ] Dark mode and a small screen (360px) checked for UI changes
- [ ] `CLAUDE.md` / `docs/API_REFERENCE.md` updated if architecture or API calls changed
- [ ] No secrets, `.env*` or credentials committed
