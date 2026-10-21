import test from "node:test";
import assert from "node:assert/strict";
import { buildHealthReportHtml, daysInRange, glanceLines, reportId } from "../healthReportHtml";
import type { HealthReportCycleStats } from "../api";

const cycle: HealthReportCycleStats = {
  averages: { sleepHours: 6.84, waterIntake: 1820, stressLevel: 5.5 },
  daysLogged: 40,
  periodDays: 5,
  flowCounts: [{ label: "Medium", value: 3 }, { label: "Heavy", value: 2 }],
  moodCounts: [{ label: "Calm", value: 12 }],
  symptomCounts: [{ label: "Cramps", value: 9 }, { label: "Bloating", value: 6 }, { label: "Headache", value: 4 }, { label: "Acne", value: 1 }],
  trends: { sleepHours: [], waterIntake: [], stressLevel: [] },
};

test("daysInRange counts both ends", () => {
  assert.equal(daysInRange("2026-07-23", "2026-10-20"), 90);
  assert.equal(daysInRange("2026-10-20", "2026-10-20"), 1);
});

test("at a glance says what the data shows, in plain sentences", () => {
  const lines = glanceLines({ startKey: "2026-07-23", endKey: "2026-10-20", cycle, documentCount: 2 });
  assert.equal(lines[0], "40 days logged out of 90 in this period, including 5 days of period flow.");
  assert.equal(lines[1], "Flow most often reported as medium.");
  assert.equal(lines[2], "Most frequent symptoms: cramps (9), bloating (6), headache (4) (days reported).");
  assert.match(lines.join(" "), /sleep 6\.8 h\/night, water 1\.8 L\/day, stress 5\.5\/10/);
  assert.match(lines.join(" "), /2 medical documents on file/);
});

test("nothing logged reads honestly, with no invented lines", () => {
  const empty = { ...cycle, daysLogged: 0, periodDays: 0, flowCounts: [], moodCounts: [], symptomCounts: [], averages: { sleepHours: null, waterIntake: null, stressLevel: null } };
  assert.deepEqual(glanceLines({ startKey: "2026-10-01", endKey: "2026-10-10", cycle: empty, documentCount: 0 }), [
    "0 days logged out of 10 in this period, with no period flow logged.",
  ]);
});

test("the report has the letterhead, patient, sections and escapes text", () => {
  const html = buildHealthReportHtml({
    patientName: "Priya <Sharma>",
    age: 28,
    startKey: "2026-07-23",
    endKey: "2026-10-20",
    cycle,
    analysisHtml: null,
    documentCount: 1,
    documents: [{ id: "d1", docType: "prescription", documentDate: "2026-10-08T00:00:00Z", title: "Prescription from Dr. Asha Rao" }],
    generatedAt: new Date(2026, 9, 21),
  });
  assert.match(html, /data:image\/png;base64,/);
  assert.match(html, /Patient health summary/);
  assert.match(html, /Priya &lt;Sharma&gt;/);
  assert.match(html, /28 yrs/);
  assert.match(html, /Prescription from Dr\. Asha Rao/);
  assert.doesNotMatch(html, /AI-assisted/); // no analysis, no section
  assert.match(reportId(new Date(2026, 9, 21)), /^NURA-HR-20261021-[0-9A-Z]{5}$/);
});
