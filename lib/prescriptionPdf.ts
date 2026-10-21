import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { consultationApi, type PrescriptionDocument } from "./api";

/*
 * The doctor's prescription as a document a pharmacy accepts (letterhead,
 * registration number, ℞ table, signature). The backend renders the page
 * (GET /api/consultation/:id/prescription) so it matches what the doctor
 * prints. Here: view it (components/PrescriptionViewer.tsx), save it as a
 * PDF, or print it. A saved PDF is health data, so its cached copy is
 * deleted later (lib/tempFiles.ts).
 */

const WEB_LOADING_HTML =
  '<!doctype html><title>Prescription</title><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:40px;color:#736A79">Preparing your prescription…</body>';

export const fetchPrescription = (consultationId: string) => consultationApi.getPrescription(consultationId);

/** Web: a new tab holding the prescription, its print dialog open (which also saves a PDF). */
function printInWebWindow(win: Window, doc: PrescriptionDocument) {
  win.document.open();
  win.document.write(doc.html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 200);
}

/** Native: a PDF named like `prescription-2026-10-08-dr-asha-rao.pdf` to the share sheet (Files, Drive, WhatsApp…). */
async function sharePdf(doc: PrescriptionDocument) {
  const { uri } = await Print.printToFileAsync({ html: doc.html, base64: false });
  // printToFileAsync picks a random name; give it one people recognise.
  const target = new File(Paths.cache, doc.fileName);
  try {
    if (target.exists) target.delete();
    new File(uri).move(target);
  } catch {
    /* keep the generated name rather than fail the download */
  }
  const fileUri = target.exists ? target.uri : uri;
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Saving files isn't available on this phone. Use Print instead, or show the prescription on screen.");
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: "application/pdf",
    dialogTitle: "Save or share your prescription",
    UTI: "com.adobe.pdf",
  });
}

/**
 * Save or print a prescription. Pass the document if it's already loaded
 * (the viewer), else its consultation id. On web both open a print window,
 * which must be opened before any await or the browser blocks it.
 */
export async function prescriptionAction(
  action: "download" | "print",
  source: { consultationId: string } | { doc: PrescriptionDocument },
): Promise<void> {
  const webWindow = Platform.OS === "web" ? window.open("", "_blank") : null;
  if (Platform.OS === "web") {
    if (!webWindow) throw new Error("Your browser blocked the prescription window. Allow pop-ups for this site and try again.");
    webWindow.document.write(WEB_LOADING_HTML);
  }

  let doc: PrescriptionDocument;
  try {
    doc = "doc" in source ? source.doc : await fetchPrescription(source.consultationId);
  } catch (error) {
    webWindow?.close();
    throw error;
  }

  if (webWindow) return printInWebWindow(webWindow, doc);
  if (action === "print") await Print.printAsync({ html: doc.html });
  else await sharePdf(doc);
}

