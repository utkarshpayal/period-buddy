import type { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import type { DocType, MedicalDocument } from "../../lib/api";
import type { ThemeColors } from "../theme";

type IconName = keyof typeof Ionicons.glyphMap;

export const DOC_TYPE_META: Record<DocType, { icon: IconName; label: string; plural: string }> = {
  prescription: { icon: "medkit-outline", label: "Prescription", plural: "prescriptions" },
  lab_report: { icon: "flask-outline", label: "Lab report", plural: "lab reports" },
  bill: { icon: "receipt-outline", label: "Medical bill", plural: "medical bills" },
  scan: { icon: "body-outline", label: "Scan / imaging", plural: "scans" },
  other: { icon: "document-text-outline", label: "Other", plural: "other documents" },
};

export const DOC_TYPE_ORDER: DocType[] = ["prescription", "lab_report", "bill", "scan", "other"];

/** Per-category accent, used for the category label dot and chips. */
export function docTypeAccent(colors: ThemeColors, type: DocType): { color: string; bg: string } {
  switch (type) {
    case "prescription":
      return { color: colors.primary, bg: colors.primaryLight };
    case "lab_report":
      return { color: colors.info, bg: colors.infoLight };
    case "bill":
      return { color: colors.warning, bg: colors.warningLight };
    case "scan":
      return { color: colors.sky, bg: colors.skyLight };
    default:
      return { color: colors.secondary, bg: colors.secondaryLight };
  }
}

export type FileKind = "pdf" | "image" | "file";

export function fileKind(mimeType: string | undefined): FileKind {
  if (!mimeType) return "file";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  return "file";
}

/** File-type icon in a tinted square: PDFs in rose, images in sky. */
export function fileKindStyle(
  colors: ThemeColors,
  kind: FileKind,
): { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; bg: string; label: string } {
  if (kind === "pdf") return { icon: "file-pdf-box", color: colors.danger, bg: colors.dangerLight, label: "PDF" };
  if (kind === "image") return { icon: "file-image-outline", color: colors.sky, bg: colors.skyLight, label: "Image" };
  return { icon: "file-document-outline", color: colors.secondary, bg: colors.secondaryLight, label: "File" };
}

export function formatDateLabel(dateString: string) {
  // Plain YYYY-MM-DD keys are local days; anything else is a timestamp.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? dateKeyToDate(dateString) : new Date(dateString);
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** "October 2026" for the list's month headings. */
export function monthLabel(dateString: string) {
  const date = /^\d{4}-\d{2}-\d{2}/.test(dateString) ? dateKeyToDate(dateString.slice(0, 10)) : new Date(dateString);
  if (Number.isNaN(date.getTime())) return "Undated";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Splits an already date-sorted list into consecutive month groups, so the
 * headings follow whichever sort order the list is in.
 */
export function groupByMonth(docs: MedicalDocument[]): { label: string; docs: MedicalDocument[] }[] {
  const groups: { label: string; docs: MedicalDocument[] }[] = [];
  for (const doc of docs) {
    const label = monthLabel(doc.documentDate);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.docs.push(doc);
    else groups.push({ label, docs: [doc] });
  }
  return groups;
}

/**
 * Screen gutter and list columns for the Documents screens: 16px on narrow
 * phones (< 360), 24px otherwise; two card columns once the content column
 * is tablet-wide.
 */
export function documentsLayout(contentWidth: number) {
  const gutter = contentWidth < 360 ? 16 : 24;
  const columns = contentWidth >= 560 ? 2 : 1;
  const gap = 12;
  const cardWidth = columns === 1 ? contentWidth - gutter * 2 : (contentWidth - gutter * 2 - gap) / 2;
  return { gutter, columns, gap, cardWidth, compact: contentWidth < 360 };
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

/** `days` ago through today, as date keys. */
export function lastDaysRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start: toDateKey(start), end: toDateKey(end) };
}

export function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function nameWithoutExtension(name: string) {
  return name.replace(/\.[^./]+$/, "");
}

/** One line about a file the AI couldn't fully read, or null. */
export function extractionNote(doc: MedicalDocument): string | null {
  switch (doc.extractionStatus) {
    case "failed":
      return "Couldn't read this file";
    case "skipped":
      return "Not read: AI features are off";
    case "limited":
      return "Limited text found in this file";
    case "pending":
      return "Reading this file…";
    default:
      return null;
  }
}

function extensionFor(doc: MedicalDocument) {
  const kind = fileKind(doc.mimeType);
  if (kind === "pdf") return "pdf";
  const sub = doc.mimeType.split("/")[1]?.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "");
  return sub || "bin";
}

/**
 * Downloads the document into the cache under a `document-` name (a
 * TEMP_PREFIXES entry), so lib/tempFiles.ts#cleanupTempFiles removes it
 * later. Never deleted right away: the other app may still be reading it.
 */
async function downloadToCache(doc: MedicalDocument, tag: string) {
  const target = new File(Paths.cache, `document-${tag}${doc._id}.${extensionFor(doc)}`);
  if (target.exists) target.delete();
  return File.downloadFileAsync(doc.fileUrl, target);
}

/**
 * Android's WebView can't show a PDF, and handing the link to an online
 * viewer would give someone else the file. Download it to the cache and let
 * the phone's own PDF app open it; the copy is removed afterwards
 * (lib/tempFiles.ts).
 */
export async function openPdfOnDevice(doc: MedicalDocument) {
  const file = await downloadToCache(doc, "");
  await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: doc.title });
}

/**
 * Shares the file itself (never its link) through the system share sheet.
 * `doc.fileUrl` must be fresh: callers fetch the document again first.
 */
export async function shareDocumentFile(doc: MedicalDocument) {
  if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing isn't available on this device.");
  }
  const file = await downloadToCache(doc, "share-");
  const kind = fileKind(doc.mimeType);
  await Sharing.shareAsync(file.uri, {
    mimeType: doc.mimeType,
    UTI: kind === "pdf" ? "com.adobe.pdf" : kind === "image" ? "public.image" : undefined,
    dialogTitle: doc.title,
  });
}
