import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { chunk, ImportFormatError, mapOption, normalizeKey, parseImportFile } from "../cycleImport";

const TODAY = "2026-10-29";

// Shaped like Clue's 2026 export (measurements.json inside the zip).
const clueMeasurements = [
  { type: "collection_method", date: "2026-10-29", id: "1", value: [{ option: "tampon" }] },
  { type: "craving", date: "2026-10-29", id: "2", value: [{ option: "sweet" }, { option: "spicy" }] },
  { type: "feelings", date: "2026-10-29", id: "3", value: [{ option: "mood_swings" }, { option: "indifferent" }] },
  { type: "mind", date: "2026-10-29", id: "4", value: [{ option: "forgetful" }, { option: "unmotivated" }] },
  { type: "pain", date: "2026-10-29", id: "5", value: [{ option: "ovulation" }, { option: "headache" }] },
  { type: "period", date: "2026-10-29", id: "6", value: { option: "light" } },
  { type: "pms", date: "2026-10-29", id: "7", value: { option: "yes" } },
  { type: "sex_life", date: "2026-10-29", id: "8", value: [{ option: "high_sex_drive" }, { option: "masturbation" }] },
  { type: "period", date: "2026-10-27", id: "9", value: { option: "very_heavy" } },
  { type: "spotting", date: "2026-10-27", id: "10", value: { option: "red" } },
  { type: "bbt", date: "2026-10-26", id: "11", value: 97.7 },
  { type: "period", date: "2026-11-02", id: "12", value: { option: "light" } },
];

const clueZip = () =>
  zipSync({
    "measurements.json": strToU8(JSON.stringify(clueMeasurements)),
    "profile.json": strToU8(JSON.stringify({ profileData: { birth_year: 2004 } })),
    "cycle_settings.json": strToU8(JSON.stringify({ initialPeriodLength: 4 })),
  });

test("normalizeKey makes Clue and Flo spellings match", () => {
  assert.equal(normalizeKey("Tender breasts"), "tender_breasts");
  assert.equal(normalizeKey("tender-breasts"), "tender_breasts");
  assert.equal(normalizeKey("TenderBreasts"), "tender_breasts");
  assert.equal(normalizeKey("Aerobics & dancing"), "aerobics_and_dancing");
  assert.equal(normalizeKey("Didn't have sex"), "didn_t_have_sex");
});

test("a Clue zip becomes Nura day logs", () => {
  const preview = parseImportFile(clueZip(), "ClueDataDownload.zip", TODAY);
  assert.equal(preview.source, "clue");
  assert.deepEqual(preview.days, [
    { dateKey: "2026-10-26", temperature: 36.5 },
    { dateKey: "2026-10-27", flow: "heavy" },
    {
      dateKey: "2026-10-29",
      symptoms: ["cravings", "headache", "sex-drive-high", "sex-masturbation"],
      moods: ["moodSwings", "apathetic", "confused"],
      flow: "light",
      note: "From Clue: Period products: Tampon; Pain: Ovulation; PMS: Yes",
    },
  ]);
  assert.equal(preview.periodDays, 2);
  assert.equal(preview.periods, 1, "flow days 2 days apart are one period");
  assert.equal(preview.firstDateKey, "2026-10-26");
  assert.equal(preview.lastDateKey, "2026-10-29", "future days are dropped");
  assert.deepEqual(preview.savedAsNotes, ["PMS", "Pain", "Period products"]);
});

test("Clue's measurements.json also works on its own", () => {
  const preview = parseImportFile(strToU8(JSON.stringify(clueMeasurements)), "measurements.json", TODAY);
  assert.equal(preview.days.length, 3);
});

test("older Clue .cluedata exports are read", () => {
  const legacy = {
    data: [
      { day: "2019-03-01T00:00:00Z", period: "medium", pain: ["cramps"], emotion: ["sad"], skin: ["acne"] },
      { day: "2019-03-02T00:00:00Z", period: "heavy", digestion: ["bloated"], energy: ["exhausted"] },
    ],
  };
  const preview = parseImportFile(strToU8(JSON.stringify(legacy)), "backup.cluedata", TODAY);
  assert.equal(preview.source, "clue");
  assert.deepEqual(preview.days, [
    { dateKey: "2019-03-01", flow: "medium", symptoms: ["cramps", "acne"], moods: ["sad"], skins: ["acne"] },
    { dateKey: "2019-03-02", flow: "heavy", digestions: ["bloated"], moods: ["lowEnergy"], energy: "low" },
  ]);
});

test("a Flo export fills period ranges and maps logged events", () => {
  const flo = {
    operationalData: {
      cycles: [
        { period_start_date: "2026-09-01 00:00:00", period_end_date: "2026-09-04 00:00:00" },
        { period_start_date: "2026-09-29 00:00:00", period_end_date: "2026-09-30 00:00:00" },
      ],
      point_events_manual_v2: [
        { date: "2026-09-01 00:00:00", category: "Period", subcategory: "Heavy" },
        { date: "2026-09-02 00:00:00", category: "Symptom", subcategory: "Cramps" },
        { date: "2026-09-02 00:00:00", category: "Mood", subcategory: "Mood swings" },
        { date: "2026-09-14 00:00:00", category: "Fluid", subcategory: "Egg white" },
        { date: "2026-09-14 00:00:00", category: "Sex", subcategory: "Unprotected sex" },
        { date: "2026-09-20 00:00:00", category: "PregnancyTest", subcategory: "Negative" },
        { date: "2026-09-21 00:00:00", category: "Lifestyle", subcategory: "Party" },
      ],
    },
  };
  const preview = parseImportFile(strToU8(JSON.stringify(flo)), "flo.json", TODAY);
  assert.equal(preview.source, "flo");
  assert.equal(preview.periods, 2);
  assert.equal(preview.periodDays, 6);
  const byDate = Object.fromEntries(preview.days.map((d) => [d.dateKey, d]));
  assert.equal(byDate["2026-09-01"].flow, "heavy", "a logged intensity beats the fallback");
  assert.equal(byDate["2026-09-02"].flow, "medium");
  assert.deepEqual(byDate["2026-09-02"].symptoms, ["cramps"]);
  assert.deepEqual(byDate["2026-09-02"].moods, ["moodSwings"]);
  assert.equal(byDate["2026-09-14"].discharge, "egg-white");
  assert.deepEqual(byDate["2026-09-14"].symptoms, ["sex-unprotected"]);
  assert.equal(byDate["2026-09-14"].isIntimate, true);
  assert.deepEqual(byDate["2026-09-20"].symptoms, ["pregnancy-negative"]);
  assert.equal(byDate["2026-09-21"].note, "From Flo: Lifestyle: Party", "nothing logged is dropped");
  assert.deepEqual(preview.savedAsNotes, ["Lifestyle"]);
});

test("sleep, water, medication and notes come across too", () => {
  const clue = [
    { type: "sleep", date: "2026-10-01", value: { option: "6-9" } },
    { type: "sleep", date: "2026-10-02", value: { option: ">9" } },
    { type: "medication", date: "2026-10-01", value: [{ option: "pain_killer" }, { option: "antibiotic" }] },
    { type: "pill", date: "2026-10-01", value: { option: "taken" } },
    { type: "notes", date: "2026-10-01", value: { text: "Long day at work" } },
    { type: "tags", date: "2026-10-01", value: [{ option: "Travelling" }] },
    { type: "pain", date: "2026-10-02", value: [{ option: "dizziness" }] },
  ];
  const preview = parseImportFile(strToU8(JSON.stringify(clue)), "measurements.json", TODAY);
  const byDate = Object.fromEntries(preview.days.map((d) => [d.dateKey, d]));
  assert.equal(byDate["2026-10-01"].sleepHours, 7.5);
  assert.equal(byDate["2026-10-02"].sleepHours, 9);
  assert.deepEqual(byDate["2026-10-01"].medication, ["Pain killer", "Antibiotic", "Pill: taken"]);
  assert.equal(byDate["2026-10-01"].note, "Long day at work\nFrom Clue: Tags: Travelling");
  assert.equal(byDate["2026-10-02"].note, "From Clue: Pain: Dizziness", "an unknown option in a known category is kept");

  const flo = {
    operationalData: {
      cycles: [
        { period_start_date: "2026-09-01", period_end_date: "2026-09-04" },
        { period_start_date: "2026-10-27" },
      ],
      point_events_manual_v2: [
        { date: "2026-09-10", category: "Water", amount: 1.5 },
        { date: "2026-09-10", category: "Water", amount: 500 },
        { date: "2026-09-10", category: "Sleep", amount: 450 },
        { date: "2026-09-10", category: "Note", text: "Felt great" },
      ],
      notes: [{ date: "2026-09-11", text: "Started new pills" }],
    },
  };
  const floPreview = parseImportFile(strToU8(JSON.stringify(flo)), "flo.json", TODAY);
  const floDays = Object.fromEntries(floPreview.days.map((d) => [d.dateKey, d]));
  assert.equal(floDays["2026-09-10"].waterIntake, 2000);
  assert.equal(floDays["2026-09-10"].sleepHours, 7.5);
  assert.equal(floDays["2026-09-10"].note, "Felt great");
  assert.equal(floDays["2026-09-11"].note, "Started new pills");
  // The open period lasts her usual 4 days, but not past today.
  assert.deepEqual(
    floPreview.days.filter((d) => d.flow && d.dateKey >= "2026-10-01").map((d) => d.dateKey),
    ["2026-10-27", "2026-10-28", "2026-10-29"],
  );
});

test("a long note is cut to the backend's 1000 characters", () => {
  const clue = [{ type: "notes", date: "2026-10-01", value: { text: "a".repeat(1200) } }];
  const [day] = parseImportFile(strToU8(JSON.stringify(clue)), "measurements.json", TODAY).days;
  assert.equal(day.note?.length, 1000);
});

test("mapOption reads tests, discharge and skin by category", () => {
  assert.deepEqual(mapOption("test", "pregnancy_test_pos"), { symptoms: ["pregnancy-positive"] });
  assert.deepEqual(mapOption("Ovulation test", "Positive"), { symptoms: ["ovulation-test-positive"] });
  assert.deepEqual(mapOption("discharge", "creamy"), { discharge: "creamy" });
  assert.deepEqual(mapOption("skin", "good"), { skins: ["clear"] });
  assert.deepEqual(mapOption("stool", "great"), { digestions: ["normal"] });
  assert.equal(mapOption("hair", "bad"), null);
});

test("files that aren't an export are refused with a clear message", () => {
  assert.throws(() => parseImportFile(strToU8("hello"), "notes.txt", TODAY), ImportFormatError);
  assert.throws(() => parseImportFile(strToU8(JSON.stringify({ foo: 1 })), "x.json", TODAY), ImportFormatError);
  assert.throws(
    () => parseImportFile(zipSync({ "user.json": strToU8("{}") }), "x.zip", TODAY),
    ImportFormatError,
  );
  assert.throws(
    () => parseImportFile(strToU8(JSON.stringify([{ type: "period", date: "2026-11-05", value: { option: "light" } }])), "m.json", TODAY),
    /nothing in this file/,
  );
});

test("chunk splits a long history into requests", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 2), []);
});
