import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { simpleMarkdownToHtml } from "./reportMarkdown";
import { reportApi, type LanguageCode } from "./api";
import { buildHealthReportHtml } from "./healthReportHtml";

const WEB_REPORT_LOADING_HTML =
  '<!doctype html><title>Health summary</title><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:40px;color:#66748A">Building your report…</body>';

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
  /** The patient's name and age for the report's header. */
  userName?: string;
  age?: number | null;
};

/**
 * Fetches the aggregated health report from the backend for a date range and
 * turns it into a PDF, then hands it to the OS share sheet (native) or a
 * dedicated print window (web) so the user can save/download it.
 */
export async function generateAndShareHealthReport(params: GenerateHealthReportParams): Promise<void> {
  const { startDate, endDate, language, userName, age } = params;

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

  const html = buildHealthReportHtml({
    patientName: userName,
    age,
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
