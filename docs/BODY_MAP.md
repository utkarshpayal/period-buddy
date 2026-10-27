# Body Map

The **On your body** tab of **Symptom Trends** (`app/(app)/symptom-predictions.tsx`, Care & Insights → Symptom Trends), drawn by `components/body-map/BodyMapSection.tsx`. It has no screen or tile of its own: one screen answers "what's going on with my symptoms", with two tabs so only one thing shows at a time: **Through your cycle** (when) and **On your body** (where).

## What it shows (and what it leaves to the trends)

- **Range:** a "Last 30 days" pill on the card steps through 7, 30 and 90 days. One button turns the body round (front/back); drag and pinch do the rest. The colour key sits inside the card.
- **Pain dots:** one per spot, coloured by how often it was logged, measured per week so the ranges compare (`intensityFor`: amber now and then, orange often, red very often). They pulse, faster when logged today or yesterday. Tender breasts mark both sides.
- **Spot chips** under the body: a quick, accessible way to each spot. Tapping one turns the body to face it.
- **Spot panel** (`SymptomDetailSheet`): the symptoms logged there with how often, the check-with-a-doctor card when `escalationFor()` applies, an **Ask Nura** row (`AskNuraRow`: Nura's avatar, a real first question per symptom, the round send button) and that area's "get help now" line (`urgentAdviceFor`).
- **Not repeated here:** day counts, cycle-phase splits, symptoms logged together, notes, insight cards and whole-body symptoms (fatigue, sleep, cravings). The trends below and the tracker already show them. There's also no "log" button: logging happens in the tracker.

Everything comes from the tracker's day logs; nothing is entered here. Day-log tags used: cramps, abdominal pain, nausea, tender breasts, headache, acne (tag or skin), backache, vaginal itching and dryness, unusual / clumpy white / gray discharge, blood clots, and digestion (bloated, constipated, diarrhea). Add a new body-related tag to `SYMPTOMS`.

Region ids are stable keys, the same as `period-buddy-be`'s `utils/symptomRecord.js#BODY_REGIONS` (a unit test compares them).

## The 3D model

- **File:** `assets/models/female-body.glb` (≈ 650 KB, 13,380 vertices, 26,756 triangles, no textures), plus `female-body-front.png` / `-back.png` for the 2D view.
- **Source:** the [MakeHuman](https://github.com/makehumancommunity/makehuman) base mesh (`makehuman/data/3dobjs/base.obj`) with the `african-`, `asian-` and `caucasian-female-young` macro targets mixed a third each.
- **License:** **CC0 1.0** (public domain). MakeHuman's `LICENSE.md` §C releases every bundled asset under CC0, and §D says the project claims nothing over output made from them.
- **What the script adds:**
  - Only the `body` group is kept.
  - Eyeballs with irises.
  - Short hair painted onto the scalp with a soft hairline (vertex colours), plus a little volume.
  - Ray-traced ambient occlusion baked into the vertex colours (creases read as real).
  - Nipple and groin detail smoothed into a mannequin surface (the app is used from 13+).
- **Regenerate:**

  ```bash
  B=https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data
  mkdir -p /tmp/mh && cd /tmp/mh
  curl -LO $B/3dobjs/base.obj
  for r in african asian caucasian; do curl -LO $B/targets/macrodetails/$r-female-young.target; done
  cd - && node scripts/generate-body-model.mjs /tmp/mh
  ```

  This rewrites the GLB, both PNGs and `lib/bodyModel.generated.ts` (region anchors snapped to the skin, and where each shows on the 2D views). Then run `npm test`.

## How it renders

- `components/body-map/BodyViewer3D.tsx`:
  - **Renderer:** React Three Fiber (`@react-three/fiber/native` on `expo-gl`, `@react-three/fiber` on web via `FiberCanvas(.web).tsx`), with skin in `meshPhysicalMaterial` (sheen) over the baked colours, four lights, ACES tone mapping, a soft contact shadow and a transparent canvas over the card's gradient.
  - **Model loading:** the GLB is read by `lib/glb.ts`, which needs no loader and no TextDecoder.
  - **Camera:** our own. One finger rotates, two fingers pinch-zoom and pan, and there are buttons; Front/Back/Left/Right animate; `focus(key)` flies to a spot. On first show it turns into place.
  - **Taps:** hit-tested in screen space, dots first (only ones facing the camera), then the body (nearest region).
  - **Render loop:** runs only while the screen is focused, the app is active and no sheet is open; it's still under reduced motion.
- `components/body-map/BodyViewer2D.tsx` is the fallback, with the same dots (Reanimated ripple). It shows when `expo-gl` isn't in the build (`glSupport.ts`), the browser has no WebGL (`glSupport.web.ts`), the model fails or throws (error boundary), or the person picks 2D.

## Medical safety

- The copy says "what you logged" and "patterns, not a diagnosis"; the footer says it isn't a substitute for a doctor and to call 112 for sudden or severe symptoms.
- `escalationFor()` (unit-tested) suggests a doctor for blood clots, discharge that looks different, recurring itching, or pain logged on ≥ 8 days a month. `urgentAdviceFor()` gives each region's "get help now" line.
- No educational articles are written here: the panel has Ask Nura, and a "Talk to a gynaecologist" link inside the check-with-a-doctor card. Region-specific education should come from clinician-reviewed CMS content.

## Privacy

`useSecureScreen("symptom-predictions")` (the screen it's on). The data is the person's own day logs, already loaded by the tracker (`cycleApi.getYearLogs`, memory-only cache).

## Native build

`expo-gl` is a native module: **a new native build is needed** for the 3D view. Builds without it show the 2D view, so shipping the JS alone is safe.
