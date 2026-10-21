/**
 * The printable health report a person shares with their doctor, as one
 * A4 HTML document (lib/healthReport.ts turns it into a PDF). Laid out the
 * way a clinician reads: who and when, an "at a glance" summary in plain
 * sentences, then numbered sections (cycle & flow, symptoms with how often,
 * mood, lifestyle, documents), the AI-assisted summary clearly labelled,
 * and a disclaimer. Pure (no native modules), so it's unit-tested in
 * lib/__tests__/healthReportHtml.test.ts.
 */
import type { DocType, HealthReportCycleStats, ReportCountItem } from "./api";
import { NURA_MARK_DATA_URI } from "./brandLogo";
import { escapeHtml, sparklineSvg } from "./reportCharts";

const BRAND = "#C2416F";
const INK = "#1E1823";
const BODY = "#3A3340";
const MUTED = "#736A79";
const RULE = "#E6DEE3";
const SOFT = "#FBF6F8";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  bill: "Medical bill",
  lab_report: "Lab report",
  other: "Other",
  prescription: "Prescription",
  scan: "Scan / imaging",
};

export type ReportDocument = { docType: DocType; documentDate: string; id: string; title: string };

export type ReportInput = {
  patientName?: string;
  /** Whole years, when the profile has a birthday. */
  age?: number | null;
  startKey: string;
  endKey: string;
  cycle: HealthReportCycleStats;
  /** Already HTML (lib/reportMarkdown.ts). */
  analysisHtml: string | null;
  documentCount: number;
  documents: ReportDocument[];
  generatedAt?: Date;
};

const dateLabel = (key: string) =>
  new Date(`${key.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Days between two day keys, inclusive. */
export function daysInRange(startKey: string, endKey: string): number {
  const ms = new Date(`${endKey}T00:00:00`).getTime() - new Date(`${startKey}T00:00:00`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/** "NURA-HR-20261021-K3F9Q": a reference the person can quote back. */
export function reportId(at: Date): string {
  const day = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  return `NURA-HR-${day}-${at.getTime().toString(36).slice(-5).toUpperCase()}`;
}

const listPhrase = (items: ReportCountItem[], max = 3) =>
  items
    .slice(0, max)
    .map((i) => `${i.label.toLowerCase()} (${i.value})`)
    .join(", ");

/**
 * The "at a glance" lines: the few facts a doctor wants first, as plain
 * sentences. Only says what the data shows; nothing inferred.
 */
export function glanceLines(input: Pick<ReportInput, "startKey" | "endKey" | "cycle" | "documentCount">): string[] {
  const { cycle } = input;
  const span = daysInRange(input.startKey, input.endKey);
  const lines: string[] = [];
  lines.push(
    `${plural(cycle.daysLogged, "day")} logged out of ${span} in this period${cycle.periodDays ? `, including ${plural(cycle.periodDays, "day")} of period flow` : ", with no period flow logged"}.`,
  );
  if (cycle.flowCounts.length) lines.push(`Flow most often reported as ${cycle.flowCounts[0].label.toLowerCase()}.`);
  if (cycle.symptomCounts.length) lines.push(`Most frequent symptoms: ${listPhrase(cycle.symptomCounts)} (days reported).`);
  if (cycle.moodCounts.length) lines.push(`Most frequent moods: ${listPhrase(cycle.moodCounts)}.`);
  const a = cycle.averages;
  const habits = [
    a.sleepHours != null ? `sleep ${a.sleepHours.toFixed(1)} h/night` : null,
    a.waterIntake != null ? `water ${(a.waterIntake / 1000).toFixed(1)} L/day` : null,
    a.stressLevel != null ? `stress ${a.stressLevel.toFixed(1)}/10` : null,
  ].filter(Boolean);
  if (habits.length) lines.push(`Average ${habits.join(", ")}.`);
  if (input.documentCount) lines.push(`${plural(input.documentCount, "medical document")} on file for this period (listed in section 5).`);
  return lines;
}

/** A compact table of counts with how often (share of logged days) and a thin bar. */
function frequencyTable(items: ReportCountItem[], daysLogged: number, color: string, empty: string, ofLabel = "Of logged days"): string {
  if (!items.length) return `<p class="empty">${escapeHtml(empty)}</p>`;
  const max = Math.max(...items.map((i) => i.value), 1);
  const rows = items
    .map((i) => {
      const pct = daysLogged ? Math.round((i.value / daysLogged) * 100) : 0;
      return `<tr>
        <td class="label">${escapeHtml(i.label)}</td>
        <td class="num">${i.value}</td>
        <td class="num">${daysLogged ? `${pct}%` : "—"}</td>
        <td class="bar"><span style="width:${Math.max(4, (i.value / max) * 100)}%;background:${color}"></span></td>
      </tr>`;
    })
    .join("");
  return `<table class="freq">
    <thead><tr><th>Reported</th><th class="num">Days</th><th class="num">${ofLabel}</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function lifestyleHtml(cycle: HealthReportCycleStats): string {
  const a = cycle.averages;
  const tiles = [
    { label: "Sleep", value: a.sleepHours != null ? `${a.sleepHours.toFixed(1)} h` : "—", note: "average per night" },
    { label: "Water", value: a.waterIntake != null ? `${(a.waterIntake / 1000).toFixed(1)} L` : "—", note: "average per day" },
    { label: "Stress", value: a.stressLevel != null ? `${a.stressLevel.toFixed(1)} / 10` : "—", note: "average, self-rated" },
  ];
  const trends = [
    { title: "Sleep (hours)", points: cycle.trends.sleepHours, color: "#6B4FBB", unit: "h" },
    { title: "Water (ml)", points: cycle.trends.waterIntake, color: "#2B6CB0", unit: "ml" },
    { title: "Stress (1–10)", points: cycle.trends.stressLevel, color: "#C05621", unit: "/10" },
  ].filter((t) => t.points.length >= 2);
  return `
    <div class="tiles">${tiles
      .map((t) => `<div class="tile"><span>${t.label}</span><b>${escapeHtml(t.value)}</b><small>${t.note}</small></div>`)
      .join("")}</div>
    ${trends
      .map(
        (t) => `<div class="trend"><div class="trend-title">${escapeHtml(t.title)} · ${escapeHtml(dateLabel(t.points[0].dateKey))} – ${escapeHtml(
          dateLabel(t.points[t.points.length - 1].dateKey),
        )}</div>${sparklineSvg(t.points, { color: t.color, unit: t.unit })}</div>`,
      )
      .join("")}`;
}

function documentsHtml(documents: ReportDocument[]): string {
  if (!documents.length) return `<p class="empty">No medical documents in this period.</p>`;
  const rows = documents
    .slice()
    .sort((a, b) => a.documentDate.localeCompare(b.documentDate))
    .map(
      (d) =>
        `<tr><td class="date">${escapeHtml(dateLabel(d.documentDate))}</td><td>${escapeHtml(DOC_TYPE_LABELS[d.docType] ?? d.docType)}</td><td>${escapeHtml(d.title)}</td></tr>`,
    )
    .join("");
  return `<table class="docs"><thead><tr><th>Date</th><th>Type</th><th>Title</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const STYLES = `
  @page { size: A4; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { color: ${INK}; font-family: -apple-system, "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif; font-size: 10pt; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: 184mm; margin: 0 auto; }
  p { margin: 0 0 6px; color: ${BODY}; }

  /* Letterhead */
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { height: 44px; width: auto; }
  .brand b { color: ${BRAND}; display: block; font-size: 18pt; font-weight: 800; letter-spacing: -0.01em; line-height: 1.05; }
  .brand small { color: ${MUTED}; display: block; font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; }
  .doc-title { text-align: right; }
  .doc-title b { display: block; font-size: 13pt; font-weight: 800; }
  .doc-title small { color: ${MUTED}; display: block; font-size: 8.5pt; }
  .rule { border: 0; border-top: 2px solid ${BRAND}; margin: 10px 0 0; }

  /* Patient strip */
  .patient { display: grid; grid-template-columns: 1.4fr 0.6fr 1.6fr 1.6fr; gap: 0; border: 1px solid ${RULE}; border-radius: 6px; margin: 12px 0 14px; }
  .patient div { padding: 7px 10px; border-left: 1px solid ${RULE}; }
  .patient div:first-child { border-left: 0; }
  .patient span { color: ${MUTED}; display: block; font-size: 7pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .patient b { display: block; font-size: 10pt; margin-top: 1px; }
  .patient .id { font-size: 8.5pt; letter-spacing: -0.01em; white-space: nowrap; }

  /* At a glance */
  .glance { background: ${SOFT}; border-left: 3px solid ${BRAND}; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; }
  .glance h2 { color: ${BRAND}; font-size: 8pt; font-weight: 800; letter-spacing: 0.1em; margin: 0 0 6px; text-transform: uppercase; }
  .glance ul { margin: 0; padding-left: 16px; }
  .glance li { color: ${INK}; font-size: 10pt; margin-bottom: 3px; }

  /* Sections */
  section { margin-bottom: 14px; page-break-inside: avoid; }
  section h3 { align-items: baseline; border-bottom: 1px solid ${RULE}; display: flex; font-size: 11pt; font-weight: 800; gap: 8px; margin: 0 0 8px; padding-bottom: 4px; }
  section h3 i { color: ${BRAND}; font-style: normal; font-size: 9pt; font-weight: 800; }
  section h3 small { color: ${MUTED}; font-size: 8.5pt; font-weight: 500; margin-left: auto; }
  .empty { color: ${MUTED}; font-style: italic; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  table { border-collapse: collapse; width: 100%; }
  th { color: ${MUTED}; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.06em; padding: 4px 6px; text-align: left; text-transform: uppercase; border-bottom: 1px solid ${INK}; }
  td { border-bottom: 1px solid ${RULE}; font-size: 9.5pt; padding: 5px 6px; vertical-align: middle; color: ${BODY}; }
  tr { page-break-inside: avoid; }
  .num { text-align: right; white-space: nowrap; width: 1%; }
  .freq .label { color: ${INK}; font-weight: 600; }
  .freq .bar { width: 30%; }
  .freq .bar span { border-radius: 3px; display: block; height: 7px; }
  .docs .date { white-space: nowrap; width: 1%; }

  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 8px; }
  .tile { border: 1px solid ${RULE}; border-radius: 6px; padding: 8px 10px; }
  .tile span { color: ${MUTED}; display: block; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .tile b { display: block; font-size: 14pt; font-weight: 800; margin-top: 2px; }
  .tile small { color: ${MUTED}; font-size: 8pt; }
  .trend { margin-top: 8px; }
  .trend-title { color: ${MUTED}; font-size: 8.5pt; margin-bottom: 2px; }
  .trend svg { max-width: 100%; height: auto; }

  .ai { border: 1px dashed ${RULE}; border-radius: 6px; padding: 10px 12px; }
  .ai .tag { background: ${SOFT}; border-radius: 999px; color: ${BRAND}; display: inline-block; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.06em; margin-bottom: 6px; padding: 2px 8px; text-transform: uppercase; }
  .ai h4 { font-size: 10pt; margin: 8px 0 3px; }
  .ai ul { margin: 0 0 6px; padding-left: 16px; }
  .ai li { color: ${BODY}; font-size: 9.5pt; margin-bottom: 2px; }

  .foot { border-top: 1px solid ${RULE}; color: ${MUTED}; display: flex; font-size: 7.5pt; gap: 16px; justify-content: space-between; line-height: 1.5; margin-top: 18px; padding-top: 8px; page-break-inside: avoid; }
  .foot .left { max-width: 72%; }
  .foot .right { text-align: right; white-space: nowrap; }

  @media screen {
    body { background: #ECE6EA; padding: 24px 12px; }
    .sheet { background: #fff; border-radius: 3px; box-shadow: 0 18px 40px rgba(30,24,35,0.12); max-width: 210mm; padding: 14mm 13mm; }
  }
  @media screen and (max-width: 600px) {
    body { padding: 0; }
    .sheet { padding: 16px 14px; box-shadow: none; }
    .patient, .two, .tiles { grid-template-columns: 1fr; }
    .patient div { border-left: 0; border-top: 1px solid ${RULE}; }
    .patient div:first-child { border-top: 0; }
  }
`;

export function buildHealthReportHtml(input: ReportInput): string {
  const { cycle, startKey, endKey, documents, documentCount } = input;
  const generatedAt = input.generatedAt ?? new Date();
  const id = reportId(generatedAt);
  const range = `${dateLabel(startKey)} – ${dateLabel(endKey)}`;
  const generated = generatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const glance = glanceLines({ startKey, endKey, cycle, documentCount });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Health summary ${escapeHtml(id)}</title>
<style>${STYLES}</style>
</head>
<body>
<main class="sheet">
  <header class="head">
    <div class="brand">
      <img src="${NURA_MARK_DATA_URI}" alt="" />
      <div><b>Nura</b><small>The Nura Care · Women's health</small></div>
    </div>
    <div class="doc-title">
      <b>Patient health summary</b>
      <small>For the treating doctor · self-reported data</small>
    </div>
  </header>
  <hr class="rule" />

  <div class="patient">
    <div><span>Patient</span><b>${escapeHtml(input.patientName || "—")}</b></div>
    <div><span>Age</span><b>${input.age != null ? `${input.age} yrs` : "—"}</b></div>
    <div><span>Period covered</span><b>${escapeHtml(range)}</b></div>
    <div><span>Report</span><b class="id">${escapeHtml(id)}</b></div>
  </div>

  <div class="glance">
    <h2>At a glance</h2>
    <ul>${glance.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
  </div>

  <section>
    <h3><i>1</i>Cycle &amp; flow<small>${plural(cycle.periodDays, "period day")} logged</small></h3>
    ${frequencyTable(cycle.flowCounts, cycle.periodDays, BRAND, "No period flow logged in this period.", "Of period days")}
  </section>

  <section>
    <h3><i>2</i>Symptoms<small>out of ${plural(cycle.daysLogged, "logged day")}</small></h3>
    ${frequencyTable(cycle.symptomCounts, cycle.daysLogged, "#2C7A6B", "No symptoms logged in this period.")}
  </section>

  <section>
    <h3><i>3</i>Mood<small>out of ${plural(cycle.daysLogged, "logged day")}</small></h3>
    ${frequencyTable(cycle.moodCounts, cycle.daysLogged, "#6B4FBB", "No moods logged in this period.")}
  </section>

  <section>
    <h3><i>4</i>Sleep, water &amp; stress</h3>
    ${lifestyleHtml(cycle)}
  </section>

  <section>
    <h3><i>5</i>Medical documents<small>${plural(documentCount, "document")}</small></h3>
    ${documentsHtml(documents)}
  </section>

  ${
    input.analysisHtml
      ? `<section>
    <h3><i>6</i>Summary of logs &amp; documents</h3>
    <div class="ai"><span class="tag">AI-assisted · please verify clinically</span>${input.analysisHtml}</div>
  </section>`
      : ""
  }

  <footer class="foot">
    <div class="left">
      Data entered by the patient in the Nura app; documents uploaded by the patient or issued through Nura consultations.
      For clinical reference only. It is not a diagnosis and does not replace a medical examination.
    </div>
    <div class="right">
      <div>${escapeHtml(id)}</div>
      <div>Generated ${escapeHtml(generated)} · thenura.care</div>
    </div>
  </footer>
</main>
</body>
</html>`;
}
