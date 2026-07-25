import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { barListHtml, escapeHtml, kpiRowHtml, sparklineSvg } from "./reportCharts";
import { simpleMarkdownToHtml } from "./reportMarkdown";
import { reportApi, type DocType, type HealthReportCycleStats, type LanguageCode, type ReportCountItem } from "./api";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  bill: "Medical Bill",
  lab_report: "Lab Report",
  other: "Other",
  prescription: "Prescription",
  scan: "Scan / Imaging",
};

function formatDateLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDateLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function tallyByKey<T extends string>(values: T[]): ReportCountItem[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    if (!value) return;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

const REPORT_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #17212E;
    background: #F5F7FA;
    margin: 0;
    padding: 32px;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 0 0 12px; color: #17212E; }
  h4 { font-size: 13px; margin: 14px 0 4px; color: #17212E; }
  p { font-size: 12px; line-height: 1.6; margin: 0 0 8px; color: #33414f; }
  ul { margin: 0 0 8px; padding-left: 18px; }
  hr { border: none; border-top: 1px solid #e1e0d9; margin: 10px 0; }
  li { font-size: 12px; line-height: 1.6; color: #33414f; margin-bottom: 2px; }
  .header { border-bottom: 1px solid #E3E7ED; padding-bottom: 16px; margin-bottom: 20px; }
  .header .meta { font-size: 11px; color: #66748A; margin-top: 4px; }
  .kpi-row { display: flex; gap: 10px; margin-bottom: 20px; }
  .stat-tile { flex: 1; background: #FFFFFF; border: 1px solid #E3E7ED; border-radius: 12px; padding: 12px; }
  .stat-value { font-size: 18px; font-weight: 600; color: #17212E; }
  .stat-label { font-size: 10px; color: #66748A; margin-top: 2px; }
  .card { background: #FFFFFF; border: 1px solid #E3E7ED; border-radius: 14px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
  .bar-chart { display: flex; flex-direction: column; gap: 8px; }
  .bar-row { display: flex; align-items: center; gap: 8px; }
  .bar-label { width: 92px; font-size: 10px; color: #52514e; flex-shrink: 0; }
  .bar-track { flex: 1; height: 14px; border-radius: 7px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 7px; }
  .bar-value { width: 32px; text-align: right; font-size: 10px; color: #52514e; flex-shrink: 0; }
  .empty-note { font-size: 11px; color: #898781; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; font-size: 10.5px; padding: 6px 4px; border-bottom: 1px solid #E3E7ED; color: #33414f; }
  th { color: #66748A; font-weight: 600; }
  .footer { font-size: 10px; color: #898781; text-align: center; margin-top: 12px; }
  .trend-label { font-size: 11px; color: #66748A; margin-bottom: 4px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function trendSectionHtml(
  title: string,
  points: { dateKey: string; value: number }[],
  color: string,
  unit: string,
): string {
  if (points.length < 2) return "";
  const svg = sparklineSvg(points, { color, unit });
  return `
    <div>
      <div class="trend-label">${escapeHtml(title)} · ${formatShortDateLabel(points[0].dateKey)} – ${formatShortDateLabel(points[points.length - 1].dateKey)}</div>
      ${svg}
    </div>`;
}

function buildReportHtml(params: {
  userName?: string;
  startKey: string;
  endKey: string;
  cycle: HealthReportCycleStats;
  analysisHtml: string | null;
  documentCount: number;
  documents: { docType: DocType; documentDate: string; id: string; title: string }[];
}): string {
  const { userName, startKey, endKey, cycle, analysisHtml, documentCount, documents } = params;

  const docTypeCounts = tallyByKey(documents.map((d) => d.docType)).map((item) => ({
    ...item,
    label: DOC_TYPE_LABELS[item.label as DocType] ?? item.label,
  }));

  const documentRows = documents
    .slice()
    .sort((a, b) => a.documentDate.localeCompare(b.documentDate))
    .map(
      (doc) =>
        `<tr><td>${escapeHtml(doc.title)}</td><td>${escapeHtml(DOC_TYPE_LABELS[doc.docType] ?? doc.docType)}</td><td>${escapeHtml(formatDateLabel(doc.documentDate.slice(0, 10)))}</td></tr>`,
    )
    .join("");

  const trendsHtml = [
    trendSectionHtml("Sleep hours", cycle.trends.sleepHours, "#805AD5", "hrs"),
    trendSectionHtml("Water intake", cycle.trends.waterIntake, "#3182CE", "ml"),
    trendSectionHtml("Stress level", cycle.trends.stressLevel, "#E4694F", "/10"),
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${REPORT_STYLES}</style>
  </head>
  <body>
    <div class="header">
      <h1>${userName ? `${escapeHtml(userName)}'s Health Report` : "Health Report"}</h1>
      <div class="meta">
        ${escapeHtml(formatDateLabel(startKey))} – ${escapeHtml(formatDateLabel(endKey))} · Generated ${escapeHtml(new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }))} by Nura
      </div>
    </div>

    ${kpiRowHtml([
      { label: "Days logged", value: String(cycle.daysLogged) },
      { label: "Period days", value: String(cycle.periodDays) },
      { label: "Documents", value: String(documentCount) },
      { label: "Top symptom", value: cycle.symptomCounts[0]?.label ?? "—" },
    ])}

    <div class="card">
      <h2>Symptoms</h2>
      ${cycle.symptomCounts.length > 0 ? barListHtml(cycle.symptomCounts, { color: "#2E8B7A", trackColor: "#EAF6F4" }) : `<div class="empty-note">No symptoms logged in this range.</div>`}
    </div>

    <div class="card">
      <h2>Mood</h2>
      ${cycle.moodCounts.length > 0 ? barListHtml(cycle.moodCounts, { color: "#805AD5", trackColor: "#FAF5FF" }) : `<div class="empty-note">No mood entries logged in this range.</div>`}
    </div>

    <div class="card">
      <h2>Flow</h2>
      ${cycle.flowCounts.length > 0 ? barListHtml(cycle.flowCounts, { color: "#3182CE", trackColor: "#EBF8FF" }) : `<div class="empty-note">No period flow logged in this range.</div>`}
    </div>

    ${trendsHtml ? `<div class="card"><h2>Trends</h2>${trendsHtml}</div>` : ""}

    <div class="card">
      <h2>Documents (${documentCount})</h2>
      ${docTypeCounts.length > 0 ? barListHtml(docTypeCounts, { color: "#E4694F", trackColor: "#FFF1ED" }) : `<div class="empty-note">No documents uploaded in this range.</div>`}
      ${
        documents.length > 0
          ? `<table><thead><tr><th>Title</th><th>Type</th><th>Date</th></tr></thead><tbody>${documentRows}</tbody></table>`
          : ""
      }
    </div>

    ${analysisHtml ? `<div class="card"><h2>AI Analysis</h2>${analysisHtml}</div>` : ""}

    <div class="footer">Generated by Nura · Not a substitute for professional medical advice.</div>
  </body>
</html>`;
}

const WEB_REPORT_LOADING_HTML =
  '<!doctype html><title>Health Report</title><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:40px;color:#66748A">Building your report…</body>';

/** Opens the print window synchronously, before any `await` in the caller —
 * most browsers only allow `window.open()` while it's still directly tied to
 * the click that triggered it; calling it after a network round trip gets it
 * silently blocked as a popup. Fill it in later with `writeHtmlToWebWindow`. */
function openWebReportWindow(): Window | null {
  return window.open("", "_blank");
}

/** Writes the finished report into a window opened by `openWebReportWindow`.
 * `expo-print`'s web shim ignores its `html` argument entirely and just calls
 * `window.print()` on whatever's currently on screen, so a standalone window
 * carries the actual report content into print instead. */
function writeHtmlToWebWindow(printWindow: Window, html: string): void {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  // A short delay lets the new document finish layout (fonts, inline SVG)
  // before the print dialog captures it.
  setTimeout(() => printWindow.print(), 150);
}

export type GenerateHealthReportParams = {
  startDate: string;
  endDate: string;
  language?: LanguageCode;
  userName?: string;
};

/**
 * Fetches the aggregated health report from the backend for a date range and
 * turns it into a PDF, then hands it to the OS share sheet (native) or a
 * dedicated print window (web) so the user can save/download it.
 */
export async function generateAndShareHealthReport(params: GenerateHealthReportParams): Promise<void> {
  const { startDate, endDate, language, userName } = params;

  // Must happen before the first `await` below — see openWebReportWindow.
  const webReportWindow = Platform.OS === "web" ? openWebReportWindow() : null;
  if (Platform.OS === "web") {
    if (!webReportWindow) {
      throw new Error("Your browser blocked the report window. Allow pop-ups for this site and try again.");
    }
    webReportWindow.document.write(WEB_REPORT_LOADING_HTML);
  }

  let report;
  try {
    report = await reportApi.getHealthReport({ endDate, language, startDate });
  } catch (error) {
    webReportWindow?.close();
    throw error;
  }

  const html = buildReportHtml({
    userName,
    startKey: startDate,
    endKey: endDate,
    cycle: report.cycle,
    analysisHtml: report.analysis ? simpleMarkdownToHtml(report.analysis) : null,
    documentCount: report.documentCount,
    documents: report.documents,
  });

  if (Platform.OS === "web") {
    writeHtmlToWebWindow(webReportWindow as Window, html);
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Download Health Report",
      UTI: "com.adobe.pdf",
    });
  }
}
