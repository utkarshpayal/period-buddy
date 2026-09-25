# The Nura App — UI/UX, Architecture & Bug Review

Full-app review covering UI/UX, information architecture, feature placement,
architecture, and bugs — including the 3 files currently staged
(`components/DayDetailsModal.tsx`, `components/subscription/PaywallModal.tsx`,
`components/ui-tokens.ts`). Findings are grouped by priority. Each item lists
the file/line, the problem, the concrete impact, and a suggested fix.

---

## 0. Critical — fix before committing the pending changes

### 0.1 Selected Mood/Skin chip icon becomes unreadable in light mode
**Files:** `components/DayDetailsModal.tsx:401,411`, `components/ui-tokens.ts:135,142`

The new `tint.fill` (used for a selected chip's circle background) was set to
`colors.accent` for `mood`/`skin`, but the icon drawn *inside* that circle
still uses `colors.buttonText` (white in light mode) for contrast. `accent`
is a ~1.6:1 pale mint wash — the same ratio the surrounding code already
documents elsewhere as unreadable. Result: white icon on near-white circle.

- **Repro:** open the day-log modal in light mode → tap any Mood option
  (e.g. "Calm") or any Skin option → the icon inside the selected chip is
  effectively invisible.
- **Root cause:** the new code comment's reasoning ("a filled circle isn't a
  contrast problem") is wrong for this pair specifically, because an icon
  *is* rendered on top of the fill — that's exactly why `color` uses
  `accentText` for these two categories in the first place.
- **Fix:** either give `mood`/`skin` a `fill` that keeps sufficient contrast
  against `buttonText` (e.g. reuse `accentText` for `fill` too, or a
  mid-tone accent), or change the icon color to something legible against
  `colors.accent` when `isSelected` is true for these two categories
  specifically. All other 9 categories are unaffected (`fill === color`).

### 0.2 CLAUDE.md documents features that no longer exist in the repo
**File:** `CLAUDE.md` ("Health Connect (Android)" section, "Partner-view" section)

- The entire "Health Connect (Android)" section describes
  `lib/health.ts`, `hooks/useHealthAutoSync.ts`, `app/(app)/health-connect.tsx`,
  and `healthConnectApi` in detail — **none of these exist** in the tree
  (verified via `git ls-files`/grep). `lib/api.ts` only has the unrelated
  liveness-check `healthApi`.
- CLAUDE.md also references `RazorpayCheckoutModal`/`RazorpayCheckoutModal.web.tsx`
  — the payment provider has been fully migrated to **Cashfree**
  (`components/CashfreeCheckoutModal.tsx`/`.web.tsx`,
  `components/CashfreeUpiCollectModal.tsx`, `lib/cashfreeUpi.ts`); no Razorpay
  code remains anywhere.
- The Partner-view section names routes `home`/`chat`/`ai-chat`/`community`/`profile`
  and a state file at `app/(app)/(partner-view)/_state.tsx`. Actual files are
  `overview.tsx`/`chat.tsx`/`voice.tsx`/`forum.tsx`/`account.tsx`, and the
  provider lives in `components/partner-view-state.tsx` — a code comment in
  `_layout.tsx` even says the names are "deliberately distinct" from the
  dashboard's, directly contradicting the doc.

**Impact:** CLAUDE.md explicitly states "This file must stay in sync with the
codebase" — anyone (human or agent) trusting these sections will build against
fictitious files. **Fix:** delete the Health Connect section (or restore the
feature if it was meant to ship), replace Razorpay references with Cashfree,
and correct the partner-view file names/state-file path.

---

## 1. Architecture & performance

### 1.1 Home fires two duplicate dashboard fetches on every mount
**File:** `app/(app)/(dashboard)/home.tsx:182,191`

`useUserStats()` already calls `authApi.getDashboard()` internally
(`hooks/useUserStats.ts:47-68`), but `home.tsx`'s own `loadHome()` calls
`Promise.all([authApi.getDashboard(), cycleApi.getPredictions()])` again on
the same mount. **Fix:** have `loadHome()` reuse the data `useUserStats()`
already fetched instead of re-requesting it.

### 1.2 No shared cache for `useUserStats`/`useSubscriptionAccess`
**Files:** `hooks/useUserStats.ts`, `hooks/useSubscriptionAccess.ts`

Both are plain `useState`/`useEffect`, refetched from zero on every mount.
Since they're consumed by ~13 different stack screens (which unmount on
navigate-away, unlike tabs), every visit re-fires `GET /api/auth/dashboard`
or `GET /api/subscriptions/me`. **Fix:** lift these into a small context/cache
(similar to how `auth-context.tsx` already syncs streak/wallet) with a short
staleness window, so repeat visits within a session don't refetch.

### 1.3 Auth token re-read/re-parsed from AsyncStorage on every API call
**File:** `lib/api.ts` (`getToken()`, ~line 886)

No in-memory cache of the parsed token — every request pays an AsyncStorage
round trip + `JSON.parse`. Compounds with 1.2 and 1.4 (many concurrent
requests per screen). **Fix:** cache the parsed token in memory, invalidated
on login/logout/401.

### 1.4 Tracker fires 12 concurrent month-log requests plus a duplicate dashboard load
**File:** `app/(app)/(dashboard)/tracker.tsx:555,724-726`

`loadYearLogs` issues 12 simultaneous `cycleApi.getMonthLogs()` calls (one per
calendar month) every mount/year-change, and `loadDashboard` separately
re-fetches `authApi.getDashboard()`/`cycleApi.getPredictions()` — the same
data Home already loaded. **Fix:** batch month-logs server-side if possible
(single "year logs" endpoint), or at minimum share the dashboard/predictions
fetch via the same cache proposed in 1.2.

### 1.5 Duplicate WebSocket connections to the `community` room
**Files:** `app/(app)/(dashboard)/_layout.tsx:141-215`, `components/screens/CommunityScreen.tsx:571-700`

Confirmed both independently open a `new WebSocket(...)` and join
`room: "community"` — the dashboard layout keeps one open for the whole tab
group's lifetime already; `CommunityScreen` opens a second one on top of it
while the tab is active. The same hand-rolled connect/reconnect/backoff
pattern is duplicated again in `app/(app)/partner.tsx`,
`app/(app)/buddy-nomination.tsx`, and `app/(app)/consultation.tsx` (5 copies
total). **Fix:** extract one shared `useRealtimeSocket()`/service that
screens subscribe to by room name, instead of each screen owning its own
socket lifecycle.

### 1.6 Debug `console.log`s left in production realtime paths
**Files:** `app/(app)/(dashboard)/_layout.tsx:150,189`, `app/(app)/partner.tsx:144,203`,
`app/(app)/buddy-nomination.tsx:262,334`, `components/screens/CommunityScreen.tsx:579,680`,
`app/(app)/consultation.tsx:237,269` (74 `console.*` hits repo-wide)

Fire on every WebSocket connect/disconnect/retry in shipped builds. None leak
tokens directly, but it's noisy and untrimmed. **Fix:** gate behind `__DEV__`
or remove.

---

## 2. Navigation & information architecture (placement/usability)

### 2.1 Dead orphaned onboarding screen
**File:** `app/(tabs)/home.tsx`

Duplicates onboarding/logout UI, but `signup.tsx`/`login.tsx`/`partner-connect.tsx`
never route here (`router.replace(destination)` always computes a different
target). Unreachable dead code that will silently drift from the real
onboarding path. **Fix:** delete it, or confirm nothing deep-links here first.

### 2.2 Dead-end search results in Tracker
**File:** `app/(app)/(dashboard)/tracker.tsx:1949-1956, 1975-1982`

"Cycle trend" and "Next period prediction" search results only call
`setSearchVisible(false)` — no navigation happens, so tapping them just
closes search with no visible effect. **Fix:** route to `/(app)/predictions`
(and/or `/(app)/graphs-reports`), matching the other search entries.

### 2.3 "Ask Nura AI" has three inconsistent landing experiences
**Files:** `app/(app)/(dashboard)/_layout.tsx` (center tab), `app/(app)/wellness-hub.tsx:29-35`,
`app/(app)/(dashboard)/tracker.tsx:2012-2020`, `app/(app)/(partner-view)/overview.tsx:33`

The tab-bar center avatar (and partner-view's voice tab) push
`/(app)/qa?voiceMode=1` (straight into chat), while the wellness-hub tile,
tracker search result, and partner-view's knowledge links push bare
`/(app)/qa`, which redirects to the chat-history list instead. Same feature
label, three different behaviors depending on entry point. **Fix:**
standardize — pass `?new=1` from every "start a chat" entry point, and only
label true "browse past chats" entries as history.

### 2.4 Government Schemes & Benefits is buried in Profile instead of Explore
**File:** `app/(app)/(dashboard)/profile.tsx:484-504`

It's a browse/discovery feature (like Blogs) but sits as a flat settings row
between "App Lock" and account rows, rather than in `explore-hub.tsx`'s grid
where it fits both by nature and by the stated hub principle. **Fix:** add a
tile to `explore-hub.tsx`; drop or de-emphasize the Profile row.

### 2.5 Documents split from its sibling report features
**Files:** `app/(app)/(dashboard)/profile.tsx:411-438`, `app/(app)/care-hub.tsx:53-60`

Documents/document-chat are reachable only via a buried Profile row, while
the closely related Graphs & Reports and PDF-report flow live in
`care-hub.tsx` — which cross-links into Documents for one flow but has no
Documents tile itself. **Fix:** add a Documents tile to `care-hub.tsx`
alongside Graphs & Reports.

### 2.6 Graphs & Reports listed twice (Profile row + care-hub tile)
**Files:** `app/(app)/care-hub.tsx:53-60`, `app/(app)/(dashboard)/profile.tsx:440-460`

The only hub feature also independently duplicated in Profile — an
inconsistency with every other hub item. **Fix:** keep one canonical entry
(care-hub) and remove the Profile row, or make the duplication intentional
and consistent for other high-value features too.

### 2.7 No visual hierarchy inside Wellness & Support hub
**File:** `app/(app)/wellness-hub.tsx:19-60`

All 5 tiles (Health Concerns, Nura AI, Hygiene, Sexual Wellbeing, Check-in
Call) render identically, giving a rarely-used setup action (Check-in Call)
the same prominence as daily-use items — contrary to the "most-used in
front" principle. **Fix:** mirror `care-hub.tsx`'s highlighted-CTA-row
pattern, or reorder by expected frequency.

### 2.8 Partner-view hand-rolls its own duplicate tile list
**File:** `app/(app)/(partner-view)/overview.tsx:29-36` (`KNOWLEDGE_LINKS`)

Duplicates Blogs/Videos/Health Concerns/Q&A/Hygiene/Sexual Wellbeing already
defined in `care-hub.tsx`/`wellness-hub.tsx`/`explore-hub.tsx`, with no shared
source of truth — will drift as owner-side hubs gain destinations. **Fix:**
extract a shared tile-list config both the owner hubs and partner overview
consume.

---

## 3. UI consistency

### 3.1 Language-picker bottom sheet duplicated three times
**Files:** `app/(app)/qa.tsx:1100`, `app/(app)/blogs.tsx:1133`, `app/(app)/document-chat.tsx:483`

Three near-identical hand-rolled `<Modal>` bottom sheets for picking
chat/translate language — exactly the ad hoc-modal pattern CLAUDE.md says
should route through `AppModalHost`/`lib/modal-host.ts`, or at minimum be one
shared component. Already drifting (different copy per screen, same
underlying logic). **Fix:** extract one `LanguagePickerSheet` component.

### 3.2 Page-level loaders bypass the branded `Loader`
**Files:** `app/(app)/reels.tsx:729`, `app/(app)/(partner-view)/overview.tsx:243`, `app/(app)/blogs.tsx:1024`

Use bare `<ActivityIndicator>` for full-screen/page-level loading instead of
`components/Loader.tsx` (`<Loader fullscreen />`), inconsistent with sibling
screens (`insights.tsx`, `graphs-reports.tsx`) that already use it — most
visible on Reels (a top-level Explore-hub destination) and partner-view home.

### 3.3 `health-issues.tsx` has no error state at all
**File:** `app/(app)/health-issues.tsx` (~line 300)

No `LoadingErrorState`/`useAsyncLoad` import; only a hand-rolled skeleton for
loading, with no fallback branch if the fetch fails — a failed load just
looks empty forever. **Fix:** adopt `useAsyncLoad` + `LoadingErrorState` per
the `graphs-reports.tsx`/`insights.tsx` pattern.

### 3.4 Hygiene resource fetch failures are fully silent
**File:** `app/(app)/hygiene.tsx:160-163`

`catch { setApiHygieneTips([]); }` always falls back to static content with
no error surfaced and no `useAsyncLoad`/offline state — a persistent network
failure is invisible to the user (and to debugging). Likely intentional as a
graceful fallback, but worth an explicit low-key "showing offline tips" note.

### 3.5 Hardcoded hex colors on the most-used screen
**File:** `app/(app)/(dashboard)/home.tsx:613,664`

`"#E3E7ED"`/`"#E8EDF3"` used directly for progress-ring/bar tracks in light
mode (only dark mode branches to a theme color). **Fix:** add a token to
`ui-tokens.ts`/`ThemeColors` (e.g. a soft track color) and use it for both
modes.

---

## 4. UX flow issues

### 4.1 Paywall's "payment pending" state is a dead end
**File:** `components/subscription/PaywallModal.tsx:213-217`

When `verifyPayment` returns pending after a reported-successful checkout,
the user sees "check back shortly" with no retry button, no polling, and no
other place in the app to re-check that order. **Fix:** keep the modal open
with an explicit "Check payment status" action, or auto-poll a few times
before giving up.

### 4.2 Check-in call schedule toggle doesn't revert on generic failure
**File:** `app/(app)/checkin-call.tsx:161-192,320-325`

The switch is set optimistically before the save call; only the
`isFeatureLockedError` catch branch reverts it — any other error (offline,
5xx) leaves the switch visually ON while nothing was actually saved. **Fix:**
revert `scheduleEnabled` in the generic-error branch too.

### 4.3 "Quick Log" silently discards other selections in the day-log modal
**File:** `components/DayDetailsModal.tsx:332-337`

If a user fills in flow/mood/digestion/exercise etc. and taps "Quick Log"
(same visual weight as "Save Log", sitting right next to it), only
`selectedSymptoms[0] ?? "general"` is persisted — everything else is
silently thrown away. **Fix:** disable/relabel "Quick Log" once other
sections have selections, or warn before discarding.

### 4.4 No unsaved-changes guard on the day-log modal
**File:** `components/DayDetailsModal.tsx:440-451,506-513`

Backdrop tap and header close both call `onClose()` unconditionally,
regardless of how much the user has filled in — an accidental tap outside
the sheet loses everything with no confirmation. **Fix:** track dirty state
and confirm before discarding.

### 4.5 Day-log save doesn't await/verify success before closing
**File:** `components/DayDetailsModal.tsx:293-330`

`handleSave` doesn't await `onSaveEntry` and closes immediately regardless of
outcome — a failed save is invisible to the user since the modal is already
gone. **Fix:** await the save, show a saving/disabled state, only close on
success (surface failure via `lib/alert.ts` and keep the sheet open).

### 4.6 No visual distinction between single-select and multi-select chip groups
**File:** `components/DayDetailsModal.tsx:367-426`

Menstrual flow/Discharge/Energy (single-select) and Mood/Skin/Digestion/
Symptoms/Activity (multi-select) render with identical chip styling — users
can't tell whether picking a second option replaces or adds to the first.
**Fix:** give single-select groups a distinct affordance (radio-style bullet
vs. checkmark).

### 4.7 Voice-mode failure alert can be visually stacked/hidden and mic re-arms before it's read
**Files:** `hooks/useVoiceInput.ts:85,88`, `components/VoiceModeOverlay.tsx`, `app/(app)/qa.tsx:135-141`

Failure alerts render as a second native `<Modal>` on top of the
already-modal `VoiceModeOverlay` — the same double-Modal unreliability
pattern already documented/guarded against elsewhere in this codebase
(PaywallModal/CashfreeCheckoutModal) — and `qa.tsx`'s auto re-arm effect
restarts the mic ~450ms after transcription fails, likely before the user
has seen/dismissed the error. **Fix:** delay mic re-arm until any pending
alert is dismissed, or surface the error inline in the overlay instead of a
second Modal.

---

## 5. Accessibility

### 5.1 Several icon-only controls have no `accessibilityLabel`/`accessibilityRole`
- `components/VoiceOrb.tsx:103-108` — mic button (used in qa.tsx/document-chat.tsx voice mode)
- `app/(app)/qa.tsx:1056-1072` — footer mic button (adjacent send button already has one)
- `app/(app)/documents.tsx:852-862` — preview modal's delete/close buttons
- `components/DayDetailsModal.tsx:705-737,747-778` — sleep/water +/- steppers (labeled only "-"/"+", also no `hitSlop` on the ~40×40 targets)

**Fix:** add `accessibilityRole="button"` + a descriptive `accessibilityLabel`
to each (e.g. "Stop recording", "Delete document", "Decrease sleep hours").

### 5.2 Inconsistent `accessibilityRole` on Home's quick actions
**File:** `app/(app)/(dashboard)/home.tsx:534-562`

Log period/Symptoms/Mood buttons lack `accessibilityRole="button"` while
neighboring controls on the same screen (bell, flow-log button) set it.
**Fix:** add for consistency.

### 5.3 Documents' in-app preview has no web fallback
**File:** `app/(app)/documents.tsx:874`

`<WebView>` PDF/document preview has no `Platform.OS === "web"` guard, so web
users hit react-native-webview's built-in "doesn't support this platform"
dead end with no alternative. `reels.tsx` already solved the equivalent
problem with a real web-native player — documents.tsx is the one screen
still unfixed. **Fix:** on web, offer "View in browser"
(`Linking.openURL`/Google Docs viewer URL) instead of the WebView.

---

## 6. Payment / checkout flow — not professional enough

The order→checkout→verify plumbing itself is solid (see 4.1 above for its one
real dead-end bug), but the *experience* reads as a rough utility flow, not a
paid product's checkout. Files: `components/subscription/PaywallModal.tsx`,
`app/(app)/subscription.tsx`, `components/CashfreeCheckoutModal.tsx`,
`components/CashfreeUpiCollectModal.tsx`, `lib/cashfreeUpi.ts`,
`components/subscription/CouponField.tsx`, `app/(app)/consultation.tsx`.

### 6.1 Raw UPI-ID text entry is the *default* payment surface
**File:** `components/CashfreeUpiCollectModal.tsx`

The first thing a paying user sees is a bare "type your UPI ID (name@bank)"
text field — a "collect" flow more typical of an internal admin tool than a
storefront. Cards/wallets/netbanking are demoted behind a small "Pay another
way" text link. **Fix:** lead with the branded hosted checkout (cards, UPI
apps, netbanking, wallets, saved methods) as the primary, visually prominent
option — offer UPI-ID collect as one method inside it, not as the entry
surface. This also removes the need for the "Pay another way" hop entirely
for most users.

### 6.2 No order summary before money moves
**Files:** `components/subscription/PaywallModal.tsx`, `app/(app)/subscription.tsx`

The user goes from "Buy — ₹X" straight into payment with no confirmation
screen showing what they're buying, the plan/feature name, duration/validity,
any discount applied, and the final total — standard on every reputable
checkout (Stripe, Play Store, Flo). **Fix:** insert a lightweight "Confirm
your purchase" summary card (item, coupon discount if any, total, what's
included) between tapping Buy and `createOrder()` firing.

### 6.3 Coupon UX is inconsistent between the two purchase surfaces
**Files:** `components/subscription/CouponField.tsx`, `app/(app)/subscription.tsx`

`PaywallModal` previews a coupon (`applyCoupon`) before purchase and shows the
discount inline; `subscription.tsx` applies the raw code only at
`createOrder` time with no preview — a user typing a code on "My
Subscription" gets no feedback on whether it's valid until after starting
checkout. **Fix:** route both surfaces through the same preview-then-apply
flow so coupon behavior doesn't differ by entry point.

### 6.4 No visible security/trust signals on a real-money screen
**Files:** `components/subscription/PaywallModal.tsx`, `app/(app)/subscription.tsx`

No "secured by Cashfree", lock icon, accepted-payment-method logos, or
refund/cancellation policy link anywhere in the purchase UI — first-time
payers have no visual reassurance before entering payment details. **Fix:**
add a small trust footer (processor badge + a link to refund/terms) near the
Buy button and on the checkout sheet.

### 6.5 Generic, unbranded loading/waiting states
**Files:** `components/CashfreeUpiCollectModal.tsx`, `components/subscription/PaywallModal.tsx`

The UPI "waiting for approval" step is a bare spinner + one line of text for
up to 120s with no progress indication (elapsed/remaining time, or at least
an animated state change), and `purchasingKey`'s inline `ActivityIndicator`
on the Buy button is the only feedback while the order is created. **Fix:**
use the app's branded `Loader` (bear mascot) instead of a bare spinner for
the UPI wait step, and show a lightweight countdown or step indicator
("Waiting for your bank... this can take up to 2 minutes").

### 6.6 Success/failure feedback is a native OS alert, not in-app UI
**Files:** `components/subscription/PaywallModal.tsx` (`finalizeUnlocked`, `showAlert` calls)

Purchase success/failure/"almost there" all surface via `lib/alert.ts`'s
native `Alert` — a plain OS dialog with no receipt, no branding, and no
persistent record the user can glance back at outside "Purchase history".
**Fix:** replace with an in-app success/failure state inside the modal
(checkmark animation, "You've unlocked X", a "View receipt" link into
Purchase history) before closing, matching the polish of the rest of the
app's themed UI.

### 6.7 Same order→checkout→verify logic duplicated three times
**Files:** `components/subscription/PaywallModal.tsx`, `app/(app)/subscription.tsx`, `app/(app)/consultation.tsx`

Each screen re-implements `createOrder` → free-coupon short-circuit →
`CashfreeUpiCollectModal`/`CashfreeCheckoutModal` → `verifyPayment` →
pending/success/failure handling independently, with the double-Modal
visibility guard (see 4.1's sibling note) copy-pasted too. **Fix:** extract
one `usePaymentCheckout()` hook (or a `<PaymentCheckoutFlow>` component) that
owns this state machine once — this is also what makes 6.1–6.6 above cheap to
apply consistently instead of three times over.

---

## Suggested priority order

1. **0.1** (live visual bug in pending diff) — fix before merging.
2. **0.2** (CLAUDE.md drift) — quick doc fix, prevents future misdirected work.
3. **1.1, 1.5** (duplicate dashboard fetch, duplicate WebSocket) — clear, contained perf wins.
4. **4.1–4.5** (paywall/day-log UX gaps) — real user-facing data-loss/confusion risks.
5. **6.1–6.7** (payment/checkout polish) — real-money screen, directly affects revenue and trust; do before the next payments-related release.
6. **2.1–2.8** (navigation/IA) — no urgency, but cheap, high-leverage discoverability wins.
7. **3.x, 5.x** (consistency/accessibility) — polish pass.
