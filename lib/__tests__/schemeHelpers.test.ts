import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEME_ACTION_LABELS,
  SCHEME_ACTION_CTA,
  APPLICATION_STATUS_META,
  STATUS_TINT_TO_COLOR_KEY,
  schemeSlugOf,
  applicationDisplayName,
  supportsInAppApplication,
  applicantLabel,
  applicantEmail,
  governmentHospitalMapsUrl,
  schemePrimaryAction,
  schemePrimaryCta,
  trackHelperText,
  INDIAN_STATES_AND_UTS,
  filterIndianStates,
  canonicalStateName,
} from "../schemeHelpers";
import type { SchemeApplication } from "../api";

test("FIND_FACILITY shows a facility CTA, not Apply", () => {
  assert.equal(SCHEME_ACTION_CTA.FIND_FACILITY.label, "Find Government Hospital");
  assert.notEqual(SCHEME_ACTION_CTA.FIND_FACILITY.label, "Apply");
  assert.equal(SCHEME_ACTION_LABELS.FIND_FACILITY, "Find facility");
});

test("only APPLY-type schemes create an in-app application", () => {
  assert.equal(supportsInAppApplication("APPLY"), true);
  assert.equal(supportsInAppApplication("FIND_FACILITY"), false);
  assert.equal(supportsInAppApplication("LEARN_MORE"), false);
  assert.equal(supportsInAppApplication("EXTERNAL_APPLICATION"), false);
});

test("every action type has a label + CTA + icon", () => {
  for (const key of Object.keys(SCHEME_ACTION_LABELS) as (keyof typeof SCHEME_ACTION_LABELS)[]) {
    assert.ok(SCHEME_ACTION_LABELS[key]);
    assert.ok(SCHEME_ACTION_CTA[key].label);
    assert.ok(SCHEME_ACTION_CTA[key].icon);
  }
});

test("every status tint maps to a valid theme color key", () => {
  for (const status of Object.keys(APPLICATION_STATUS_META) as (keyof typeof APPLICATION_STATUS_META)[]) {
    const tint = APPLICATION_STATUS_META[status].tint;
    assert.ok(STATUS_TINT_TO_COLOR_KEY[tint], `missing color key for tint ${tint}`);
  }
});

test("schemeSlugOf handles populated and raw schemeId", () => {
  const populated = {
    schemeId: { _id: "x", name: "PMMVY", slug: "pmmvy" },
  } as unknown as SchemeApplication;
  const raw = { schemeId: "507f1f77bcf86cd799439011" } as unknown as SchemeApplication;
  assert.equal(schemeSlugOf(populated), "pmmvy");
  assert.equal(schemeSlugOf(raw), undefined);
});

test("applicantLabel/applicantEmail read a populated user", () => {
  const populated = {
    userId: { _id: "u1", firstName: "Asha", lastName: "Devi", email: "asha@example.com" },
  } as unknown as SchemeApplication;
  const emailOnly = {
    userId: { _id: "u2", email: "only@example.com" },
  } as unknown as SchemeApplication;
  const rawId = { userId: "507f1f77bcf86cd799439011" } as unknown as SchemeApplication;

  assert.equal(applicantLabel(populated), "Asha Devi");
  assert.equal(applicantEmail(populated), "asha@example.com");
  assert.equal(applicantLabel(emailOnly), "only@example.com");
  assert.equal(applicantLabel(rawId), "Applicant");
  assert.equal(applicantEmail(rawId), undefined);
});

test("applicationDisplayName falls back gracefully", () => {
  const populated = {
    schemeId: { name: "Janani Suraksha Yojana" },
  } as unknown as SchemeApplication;
  const denormalised = {
    schemeId: "id",
    schemeName: "JSSK",
  } as unknown as SchemeApplication;
  const empty = { schemeId: "id" } as unknown as SchemeApplication;
  assert.equal(applicationDisplayName(populated), "Janani Suraksha Yojana");
  assert.equal(applicationDisplayName(denormalised), "JSSK");
  assert.equal(applicationDisplayName(empty), "Scheme application");
});

test("governmentHospitalMapsUrl scopes to the user's state when known", () => {
  const withState = governmentHospitalMapsUrl("Rajasthan");
  assert.ok(withState.startsWith("https://www.google.com/maps/search/"));
  assert.ok(withState.includes(encodeURIComponent("government hospital in Rajasthan")));

  const nearMe = governmentHospitalMapsUrl();
  assert.ok(nearMe.includes(encodeURIComponent("government hospital near me")));
  // Blank/whitespace state falls back to "near me".
  assert.equal(governmentHospitalMapsUrl("   "), nearMe);
  assert.equal(governmentHospitalMapsUrl(null), nearMe);
});

test("APPLY's in-app action is labelled as tracking, not applying", () => {
  assert.equal(SCHEME_ACTION_CTA.APPLY.label, "Track this scheme");
  assert.ok(!/^apply$/i.test(SCHEME_ACTION_LABELS.APPLY));
  assert.match(trackHelperText("APPLY"), /official site/);
  assert.doesNotMatch(trackHelperText("FIND_FACILITY"), /Apply/);
});

test("primary action follows actionType", () => {
  assert.equal(schemePrimaryAction("APPLY", true), "official");
  assert.equal(schemePrimaryAction("APPLY", false), "track");
  assert.equal(schemePrimaryAction("CHECK_ELIGIBILITY", true), "checker");
  // FIND_FACILITY never opens officialUrl — it opens the maps search.
  assert.equal(schemePrimaryAction("FIND_FACILITY", true), "maps");
  assert.equal(schemePrimaryAction("EXTERNAL_APPLICATION", true), "official");
  assert.equal(schemePrimaryAction("LEARN_MORE", true), "official");
  assert.equal(schemePrimaryCta("APPLY", true).label, "Apply on official site");
  assert.equal(schemePrimaryCta("APPLY", false).label, "Track this scheme");
  assert.equal(schemePrimaryCta("FIND_FACILITY", true).label, "Find Government Hospital");
});

test("every application status explains what happens next", () => {
  for (const meta of Object.values(APPLICATION_STATUS_META)) {
    assert.ok(meta.next.length > 0);
  }
});

test("state picker helpers", () => {
  assert.equal(INDIAN_STATES_AND_UTS.length, 36);
  assert.equal(filterIndianStates("").length, 36);
  assert.deepEqual(filterIndianStates("raja"), ["Rajasthan"]);
  assert.equal(canonicalStateName(" rajasthan "), "Rajasthan");
  assert.equal(canonicalStateName("Atlantis"), "Atlantis");
  assert.equal(canonicalStateName(undefined), "");
});
