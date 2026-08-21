import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { CalendarModal } from "../../components/CalendarModal";
import { useAuth } from "../../components/auth-context";
import { useTheme } from "../../components/theme";
import { SkeletonRow } from "../../components/Skeleton";
import { getShadow, getSoftTints } from "../../components/ui-tokens";
import { alert } from "../../lib/alert";
import { showPermissionModal } from "../../lib/modal-host";
import { documentApi, type DocType, type LanguageCode, type MedicalDocument } from "../../lib/api";
import { generateAndShareHealthReport } from "../../lib/healthReport";
import { SUPPORTED_LANGUAGES as LANGUAGE_OPTIONS } from "../../lib/languages";

type PickedFile = {
  mimeType: string;
  name: string;
  size?: number;
  uri: string;
};

const DOC_TYPE_META: Record<DocType, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  bill: { icon: "receipt-outline", label: "Medical Bill" },
  lab_report: { icon: "flask-outline", label: "Lab Report" },
  other: { icon: "document-text-outline", label: "Other" },
  prescription: { icon: "medkit-outline", label: "Prescription" },
  scan: { icon: "body-outline", label: "Scan / Imaging" },
};

const DOC_TYPE_ORDER: DocType[] = ["prescription", "lab_report", "bill", "scan", "other"];

function formatDateLabel(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`);
}

function googleViewerUrl(fileUrl: string) {
  return `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}`;
}

export default function DocumentsScreen() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const { openReport } = useLocalSearchParams<{ openReport?: string }>();
  const { user } = useAuth();
  const softTints = getSoftTints(colors);
  // Per-document-type accent — every list card previously used the same pink
  // icon badge regardless of type, so prescriptions/labs/bills/scans all
  // blurred together. Distinct colors make type scannable at a glance and
  // double as the small type chip on each card below.
  const DOC_TYPE_ACCENTS: Record<DocType, { color: string; bg: string }> = {
    prescription: { color: colors.primary, bg: colors.primaryLight },
    lab_report: { color: colors.info, bg: colors.infoLight },
    bill: { color: colors.warning, bg: colors.warningLight },
    scan: { color: colors.accent, bg: colors.accentLight },
    other: { color: colors.secondary, bg: colors.secondaryLight },
  };

  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DocType | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchDocuments = useCallback(async () => {
    try {
      const result = await documentApi.list({
        docType: typeFilter ?? undefined,
        limit: 100,
        sort: sortOrder,
      });
      setDocuments(result.documents);
    } catch (error) {
      alert("Couldn't load documents", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter, sortOrder]);

  useEffect(() => {
    setLoading(true);
    fetchDocuments();
  }, [fetchDocuments]);

  function handleRefresh() {
    setRefreshing(true);
    fetchDocuments();
  }

  // --- Upload flow ---
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadStep, setUploadStep] = useState<"form" | "source">("source");
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDocType, setFormDocType] = useState<DocType>("other");
  const [formDateKey, setFormDateKey] = useState("");
  const [formCalendarVisible, setFormCalendarVisible] = useState(false);
  const [uploading, setUploading] = useState(false);

  function resetUploadState() {
    setUploadStep("source");
    setPickedFile(null);
    setFormTitle("");
    setFormDocType("other");
    setFormDateKey("");
  }

  function closeUploadModal() {
    setUploadVisible(false);
    resetUploadState();
  }

  function nameWithoutExtension(name: string) {
    return name.replace(/\.[^./]+$/, "");
  }

  async function handlePickCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showPermissionModal({
        title: "Camera access needed",
        message: "Allow camera access to photograph a document.",
        icon: "camera-outline",
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || `document-${Date.now()}.jpg`;
    setPickedFile({ mimeType: asset.mimeType || "image/jpeg", name: fileName, size: asset.fileSize, uri: asset.uri });
    setFormTitle((prev) => prev || nameWithoutExtension(fileName));
    setUploadStep("form");
  }

  async function handlePickGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showPermissionModal({
        title: "Photo access needed",
        message: "Allow photo library access to choose a document image.",
        icon: "images-outline",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const fileName = asset.fileName || `document-${Date.now()}.jpg`;
    setPickedFile({ mimeType: asset.mimeType || "image/jpeg", name: fileName, size: asset.fileSize, uri: asset.uri });
    setFormTitle((prev) => prev || nameWithoutExtension(fileName));
    setUploadStep("form");
  }

  async function handlePickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["application/pdf", "image/*"],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPickedFile({
      mimeType: asset.mimeType || "application/pdf",
      name: asset.name,
      size: asset.size ?? undefined,
      uri: asset.uri,
    });
    setFormTitle((prev) => prev || nameWithoutExtension(asset.name));
    setUploadStep("form");
  }

  async function handleUpload() {
    if (!pickedFile || !formTitle.trim() || !formDateKey || uploading) return;

    try {
      setUploading(true);
      await documentApi.upload({
        docType: formDocType,
        documentDate: formDateKey,
        fileName: pickedFile.name,
        localUri: pickedFile.uri,
        mimeType: pickedFile.mimeType,
        title: formTitle.trim(),
      });
      closeUploadModal();
      setLoading(true);
      fetchDocuments();
    } catch (error) {
      alert("Upload failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // --- Preview / delete ---
  const [previewDoc, setPreviewDoc] = useState<MedicalDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleDelete(doc: MedicalDocument) {
    alert("Delete this document?", `"${doc.title}" will be permanently removed.`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: async () => {
          try {
            setDeleting(true);
            await documentApi.remove(doc._id);
            setPreviewDoc(null);
            setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
          } catch (error) {
            alert("Couldn't delete", error instanceof Error ? error.message : "Please try again.");
          } finally {
            setDeleting(false);
          }
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }

  // --- Summarize flow ---
  const [summarizeVisible, setSummarizeVisible] = useState(false);
  const [summaryStartKey, setSummaryStartKey] = useState("");
  const [summaryEndKey, setSummaryEndKey] = useState("");
  const [startCalendarVisible, setStartCalendarVisible] = useState(false);
  const [endCalendarVisible, setEndCalendarVisible] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{ documentCount: number; summary: string } | null>(null);
  const [summaryLanguage, setSummaryLanguage] = useState<LanguageCode>("en-IN");

  function closeSummarizeModal() {
    setSummarizeVisible(false);
    setSummaryStartKey("");
    setSummaryEndKey("");
    setSummaryResult(null);
  }

  async function handleGenerateSummary() {
    if (!summaryStartKey || !summaryEndKey || summarizing) return;
    try {
      setSummarizing(true);
      const result = await documentApi.summarize({
        endDate: summaryEndKey,
        language: summaryLanguage,
        startDate: summaryStartKey,
      });
      setSummaryResult({ documentCount: result.documentCount, summary: result.summary });
    } catch (error) {
      alert(
        "Couldn't generate summary",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSummarizing(false);
    }
  }

  // --- Health report flow ---
  const [reportVisible, setReportVisible] = useState(false);
  const [reportStartKey, setReportStartKey] = useState("");
  const [reportEndKey, setReportEndKey] = useState("");
  const [reportStartCalendarVisible, setReportStartCalendarVisible] = useState(false);
  const [reportEndCalendarVisible, setReportEndCalendarVisible] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportLanguage, setReportLanguage] = useState<LanguageCode>("en-IN");

  // "Download doctor report" on the Graphs & Reports screen deep-links here
  // (?openReport=1) instead of duplicating this whole flow — open the modal
  // pre-filled to the last 90 days so a first-time visitor isn't stuck
  // picking dates blind.
  useEffect(() => {
    if (openReport !== "1") return;
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 90);
    setReportStartKey(toDateKey(start));
    setReportEndKey(toDateKey(today));
    setReportVisible(true);
    router.setParams({ openReport: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReport]);

  function closeReportModal() {
    if (generatingReport) return;
    setReportVisible(false);
    setReportStartKey("");
    setReportEndKey("");
  }

  async function handleGenerateReport() {
    if (!reportStartKey || !reportEndKey || generatingReport) return;
    try {
      setGeneratingReport(true);
      await generateAndShareHealthReport({
        startDate: reportStartKey,
        endDate: reportEndKey,
        language: reportLanguage,
        userName: user?.firstName,
      });
      closeReportModal();
    } catch (error) {
      alert("Couldn't create report", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setGeneratingReport(false);
    }
  }

  const chipRow = (
    active: string | null,
    items: { label: string; value: string | null }[],
    onSelect: (value: string | null) => void,
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
      {items.map((item) => {
        const isActive = active === item.value;
        return (
          <TouchableOpacity
            key={item.label}
            activeOpacity={0.8}
            onPress={() => onSelect(item.value)}
            className="rounded-full border px-4 py-2"
            style={{
              backgroundColor: isActive ? colors.primary : colors.surface,
              borderColor: isActive ? colors.primary : colors.border,
            }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: isActive ? colors.buttonText : colors.foreground, fontFamily: fonts.body }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* Header */}
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2.5 -ml-2 rounded-full border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <View className="flex-1 ml-2">
            <Text className="text-2xl font-black tracking-tight" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              Documents
            </Text>
            <Text className="text-xs font-semibold mt-0.5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              Prescriptions, reports & bills — all in one place
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {/* Quick actions — icon-on-top, label-below tiles instead of a
              cramped inline icon+label row, so each label gets the tile's
              full width and always renders on one line instead of squeezing
              next to the icon. */}
          <View className="flex-row gap-3 px-6 pt-5">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSummarizeVisible(true)}
              className="flex-1 items-center rounded-2xl border py-4"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: softTints.purple }}
              >
                <MaterialCommunityIcons name="text-box-search-outline" size={17} color={colors.accent} />
              </View>
              <Text
                className="text-[11px] font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
                numberOfLines={1}
              >
                Summarize
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push("/document-chat")}
              className="flex-1 items-center rounded-2xl border py-4"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: softTints.pink }}
              >
                <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
              </View>
              <Text
                className="text-[11px] font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
                numberOfLines={1}
              >
                Ask AI
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setReportVisible(true)}
              className="flex-1 items-center rounded-2xl border py-4"
              style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
            >
              <View
                className="w-9 h-9 rounded-full items-center justify-center mb-2"
                style={{ backgroundColor: softTints.mint }}
              >
                <Feather name="download" size={16} color={colors.secondary} />
              </View>
              <Text
                className="text-[11px] font-bold"
                style={{ color: colors.foreground, fontFamily: fonts.body }}
                numberOfLines={1}
              >
                PDF Report
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filters */}
          <View className="mt-5 px-6">
            {chipRow(
              typeFilter,
              [
                { label: "All", value: null },
                ...DOC_TYPE_ORDER.map((type) => ({ label: DOC_TYPE_META[type].label, value: type })),
              ],
              (value) => setTypeFilter(value as DocType | null),
            )}
          </View>

          {/* Count + sort toggle */}
          <View className="mt-4 px-6 flex-row items-center justify-between">
            <Text className="text-xs font-semibold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              <Text style={{ color: colors.foreground, fontFamily: fonts.heading, fontWeight: "800" }}>
                {documents.length}
              </Text>
              {" "}document{documents.length === 1 ? "" : "s"}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
              className="flex-row items-center gap-1.5"
            >
              <Feather name={sortOrder === "desc" ? "arrow-down" : "arrow-up"} size={12} color={colors.primary} />
              <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                {sortOrder === "desc" ? "Newest first" : "Oldest first"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* List */}
          <View className="mt-4 px-6 gap-3">
            {loading ? (
              <View className="gap-3">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </View>
            ) : documents.length === 0 ? (
              <View
                className="items-center rounded-2xl border p-8 mt-4"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
              >
                <View
                  className="w-16 h-16 rounded-full items-center justify-center mb-4"
                  style={{ backgroundColor: softTints.pink }}
                >
                  <Ionicons name="folder-open-outline" size={28} color={colors.primary} />
                </View>
                <Text className="text-sm font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                  No documents yet
                </Text>
                <Text
                  className="text-xs text-center mt-1.5 leading-4"
                  style={{ color: colors.mutedText, fontFamily: fonts.body, maxWidth: 240 }}
                >
                  Upload prescriptions, lab reports, and bills to keep them all in one place.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setUploadVisible(true)}
                  className="mt-5 flex-row items-center gap-2 rounded-full px-5 py-3"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Feather name="plus" size={14} color={colors.buttonText} />
                  <Text className="text-xs font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                    Upload a document
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              documents.map((doc) => {
                const meta = DOC_TYPE_META[doc.docType];
                const accent = DOC_TYPE_ACCENTS[doc.docType];
                const isPdf = doc.mimeType === "application/pdf";
                const hasIssue = doc.extractionStatus === "limited" || doc.extractionStatus === "failed";
                return (
                  <TouchableOpacity
                    key={doc._id}
                    activeOpacity={0.8}
                    onPress={() => setPreviewDoc(doc)}
                    className="flex-row items-center rounded-2xl border p-4"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, ...getShadow(colors, isDark) }}
                  >
                    <View className="p-3 rounded-xl mr-3.5" style={{ backgroundColor: accent.bg }}>
                      <Ionicons name={meta.icon} size={18} color={accent.color} />
                    </View>
                    <View className="flex-1" style={{ minWidth: 0 }}>
                      <Text numberOfLines={1} className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                        {doc.title}
                      </Text>
                      <View className="flex-row items-center flex-wrap mt-1.5" style={{ gap: 6 }}>
                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: accent.bg }}>
                          <Text className="text-[9.5px] font-bold" style={{ color: accent.color, fontFamily: fonts.body }}>
                            {meta.label}
                          </Text>
                        </View>
                        <Text className="text-[10.5px] font-semibold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                          {formatDateLabel(doc.documentDate)} · {isPdf ? "PDF" : "Image"}
                        </Text>
                      </View>
                      {hasIssue ? (
                        <Text className="text-[10px] font-bold mt-1.5" style={{ color: colors.warning, fontFamily: fonts.body }}>
                          {doc.extractionStatus === "failed" ? "Couldn't read this file" : "Limited text found in this file"}
                        </Text>
                      ) : null}
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Floating add button */}
        <TouchableOpacity
          onPress={() => setUploadVisible(true)}
          activeOpacity={0.85}
          className="absolute right-6 bottom-8 w-14 h-14 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.primary, ...getShadow(colors, isDark) }}
        >
          <Feather name="plus" size={22} color={colors.buttonText} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Upload modal */}
      <Modal visible={uploadVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeUploadModal}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4">
            <Text className="text-xl font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              {uploadStep === "source" ? "Add a Document" : "Document Details"}
            </Text>
            <TouchableOpacity onPress={closeUploadModal} className="p-1 rounded-full" style={{ backgroundColor: colors.border }}>
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
            {uploadStep === "source" ? (
              <View className="gap-3 mt-2">
                {[
                  { action: handlePickCamera, icon: "camera-outline" as const, label: "Take a Photo" },
                  { action: handlePickGallery, icon: "images-outline" as const, label: "Choose from Gallery" },
                  { action: handlePickFile, icon: "document-attach-outline" as const, label: "Choose PDF or File" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.label}
                    activeOpacity={0.8}
                    onPress={option.action}
                    className="flex-row items-center rounded-2xl border p-4"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <View className="p-2.5 rounded-xl mr-4" style={{ backgroundColor: softTints.pink }}>
                      <Ionicons name={option.icon} size={18} color={colors.primary} />
                    </View>
                    <Text className="flex-1 text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                      {option.label}
                    </Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View className="gap-5 mt-2 pb-10">
                {pickedFile ? (
                  <View className="rounded-2xl border overflow-hidden" style={{ borderColor: colors.border }}>
                    {pickedFile.mimeType.startsWith("image/") ? (
                      <Image source={{ uri: pickedFile.uri }} style={{ height: 160, width: "100%" }} resizeMode="cover" />
                    ) : (
                      <View className="h-24 items-center justify-center" style={{ backgroundColor: softTints.pink }}>
                        <Ionicons name="document-text-outline" size={28} color={colors.primary} />
                        <Text className="text-[10px] font-bold mt-1" style={{ color: colors.primary, fontFamily: fonts.body }}>
                          {pickedFile.name}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : null}

                <View>
                  <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Title
                  </Text>
                  <TextInput
                    value={formTitle}
                    onChangeText={setFormTitle}
                    placeholder="e.g. Blood Test — Jan 2026"
                    placeholderTextColor={colors.mutedText}
                    maxLength={150}
                    className="px-4 py-3 rounded-xl text-sm"
                    style={{ backgroundColor: colors.input, color: colors.foreground, fontFamily: fonts.body }}
                  />
                </View>

                <View>
                  <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Document Type
                  </Text>
                  {chipRow(
                    formDocType,
                    DOC_TYPE_ORDER.map((type) => ({ label: DOC_TYPE_META[type].label, value: type })),
                    (value) => setFormDocType(value as DocType),
                  )}
                </View>

                <View>
                  <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Document Date
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setFormCalendarVisible(true)}
                    className="flex-row items-center justify-between px-4 py-3 rounded-xl"
                    style={{ backgroundColor: colors.input }}
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: formDateKey ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
                    >
                      {formDateKey ? formatDateLabel(formDateKey) : "Select the date on this document"}
                    </Text>
                    <Feather name="calendar" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  disabled={!pickedFile || !formTitle.trim() || !formDateKey || uploading}
                  onPress={handleUpload}
                  activeOpacity={0.85}
                  className="rounded-2xl py-4 items-center justify-center flex-row gap-2"
                  style={{
                    backgroundColor:
                      !pickedFile || !formTitle.trim() || !formDateKey || uploading ? colors.border : colors.primary,
                  }}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.buttonText} />
                  ) : (
                    <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                      Upload Document
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setUploadStep("source")} activeOpacity={0.7} className="items-center py-1">
                  <Text className="text-xs font-bold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    Choose a different file
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>

        <CalendarModal
          initialDateKey={formDateKey || undefined}
          maximumDate={new Date()}
          onClose={() => setFormCalendarVisible(false)}
          onSelect={(dateKey) => {
            setFormDateKey(dateKey);
            setFormCalendarVisible(false);
          }}
          visible={formCalendarVisible}
        />
      </Modal>

      {/* Preview modal */}
      <Modal visible={!!previewDoc} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPreviewDoc(null)}>
        {previewDoc ? (
          <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
            <View className="flex-row items-center justify-between px-6 pt-6 pb-4">
              <Text numberOfLines={1} className="flex-1 text-lg font-black mr-3" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
                {previewDoc.title}
              </Text>
              <TouchableOpacity
                onPress={() => handleDelete(previewDoc)}
                disabled={deleting}
                className="p-2 rounded-full mr-2"
                style={{ backgroundColor: colors.dangerLight }}
              >
                {deleting ? <ActivityIndicator size="small" color={colors.danger} /> : <Feather name="trash-2" size={16} color={colors.danger} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPreviewDoc(null)} className="p-1 rounded-full" style={{ backgroundColor: colors.border }}>
                <Feather name="x" size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <Text className="px-6 pb-3 text-xs font-semibold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {formatDateLabel(previewDoc.documentDate)} · {DOC_TYPE_META[previewDoc.docType].label}
              {previewDoc.fileSize ? ` · ${formatFileSize(previewDoc.fileSize)}` : ""}
            </Text>

            <View className="flex-1 mx-6 mb-6 rounded-2xl overflow-hidden border" style={{ borderColor: colors.border }}>
              {previewDoc.mimeType.startsWith("image/") ? (
                <Image source={{ uri: previewDoc.fileUrl }} style={{ flex: 1 }} resizeMode="contain" />
              ) : (
                <WebView source={{ uri: googleViewerUrl(previewDoc.fileUrl) }} style={{ flex: 1 }} />
              )}
            </View>
          </SafeAreaView>
        ) : null}
      </Modal>

      {/* Summarize modal */}
      <Modal visible={summarizeVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSummarizeModal}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4">
            <Text className="text-xl font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              Summarize Reports
            </Text>
            <TouchableOpacity onPress={closeSummarizeModal} className="p-1 rounded-full" style={{ backgroundColor: colors.border }}>
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {!summaryResult ? (
              <View className="gap-5 mt-2">
                <Text className="text-xs leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                  Pick a date range and Nura will read your reports from that period and summarize them for you.
                </Text>

                <View>
                  <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Start Date
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setStartCalendarVisible(true)}
                    className="flex-row items-center justify-between px-4 py-3 rounded-xl"
                    style={{ backgroundColor: colors.input }}
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: summaryStartKey ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
                    >
                      {summaryStartKey ? formatDateLabel(summaryStartKey) : "Select start date"}
                    </Text>
                    <Feather name="calendar" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                </View>

                <View>
                  <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    End Date
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setEndCalendarVisible(true)}
                    className="flex-row items-center justify-between px-4 py-3 rounded-xl"
                    style={{ backgroundColor: colors.input }}
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: summaryEndKey ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
                    >
                      {summaryEndKey ? formatDateLabel(summaryEndKey) : "Select end date"}
                    </Text>
                    <Feather name="calendar" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                </View>

                <View>
                  <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    Summary Language
                  </Text>
                  {chipRow(
                    summaryLanguage,
                    LANGUAGE_OPTIONS.map((l) => ({ label: l.label, value: l.code })),
                    (value) => setSummaryLanguage((value as LanguageCode) || "en-IN"),
                  )}
                </View>

                <TouchableOpacity
                  disabled={!summaryStartKey || !summaryEndKey || summarizing}
                  onPress={handleGenerateSummary}
                  activeOpacity={0.85}
                  className="rounded-2xl py-4 items-center justify-center flex-row gap-2"
                  style={{
                    backgroundColor: !summaryStartKey || !summaryEndKey || summarizing ? colors.border : colors.primary,
                  }}
                >
                  {summarizing ? (
                    <ActivityIndicator color={colors.buttonText} />
                  ) : (
                    <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                      Generate Summary
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View className="gap-4 mt-2">
                <View className="rounded-2xl border p-4" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                  <Text className="text-[11px] font-bold mb-3" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    Based on {summaryResult.documentCount} document{summaryResult.documentCount === 1 ? "" : "s"} from{" "}
                    {formatDateLabel(summaryStartKey)} to {formatDateLabel(summaryEndKey)}
                  </Text>
                  <Markdown
                    style={{
                      body: { color: colors.foreground, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
                      heading1: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 17, marginBottom: 6 },
                      heading2: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 15, marginTop: 12, marginBottom: 4 },
                      heading3: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 13, marginTop: 10, marginBottom: 4 },
                      strong: { fontFamily: fonts.heading },
                      bullet_list: { marginBottom: 6 },
                      list_item: { marginBottom: 3 },
                      paragraph: { marginTop: 0, marginBottom: 8 },
                    }}
                  >
                    {summaryResult.summary}
                  </Markdown>
                </View>

                <TouchableOpacity
                  onPress={() => setSummaryResult(null)}
                  activeOpacity={0.8}
                  className="rounded-2xl border py-3.5 items-center"
                  style={{ borderColor: colors.primary }}
                >
                  <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                    Choose a Different Range
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>

        <CalendarModal
          initialDateKey={summaryStartKey || undefined}
          maximumDate={summaryEndKey ? dateKeyToDate(summaryEndKey) : new Date()}
          onClose={() => setStartCalendarVisible(false)}
          onSelect={(dateKey) => {
            setSummaryStartKey(dateKey);
            setStartCalendarVisible(false);
          }}
          visible={startCalendarVisible}
        />
        <CalendarModal
          initialDateKey={summaryEndKey || undefined}
          maximumDate={new Date()}
          minimumDate={summaryStartKey ? dateKeyToDate(summaryStartKey) : undefined}
          onClose={() => setEndCalendarVisible(false)}
          onSelect={(dateKey) => {
            setSummaryEndKey(dateKey);
            setEndCalendarVisible(false);
          }}
          visible={endCalendarVisible}
        />
      </Modal>

      {/* Health report modal */}
      <Modal visible={reportVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeReportModal}>
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center justify-between px-6 pt-6 pb-4">
            <Text className="text-xl font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              Download Health Report
            </Text>
            <TouchableOpacity
              onPress={closeReportModal}
              disabled={generatingReport}
              className="p-1 rounded-full"
              style={{ backgroundColor: colors.border }}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            <View className="gap-5 mt-2">
              <Text className="text-xs leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                Pick a date range and Nura will build a detailed PDF — symptoms, mood, flow, trends, and an AI
                analysis of your uploaded reports from that period — ready to save or share.
              </Text>

              <View>
                <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  Start Date
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setReportStartCalendarVisible(true)}
                  className="flex-row items-center justify-between px-4 py-3 rounded-xl"
                  style={{ backgroundColor: colors.input }}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: reportStartKey ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
                  >
                    {reportStartKey ? formatDateLabel(reportStartKey) : "Select start date"}
                  </Text>
                  <Feather name="calendar" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              </View>

              <View>
                <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  End Date
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setReportEndCalendarVisible(true)}
                  className="flex-row items-center justify-between px-4 py-3 rounded-xl"
                  style={{ backgroundColor: colors.input }}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: reportEndKey ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
                  >
                    {reportEndKey ? formatDateLabel(reportEndKey) : "Select end date"}
                  </Text>
                  <Feather name="calendar" size={16} color={colors.mutedText} />
                </TouchableOpacity>
              </View>

              <View>
                <Text className="text-xs font-bold mb-2" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  Report Language
                </Text>
                {chipRow(
                  reportLanguage,
                  LANGUAGE_OPTIONS.map((l) => ({ label: l.label, value: l.code })),
                  (value) => setReportLanguage((value as LanguageCode) || "en-IN"),
                )}
              </View>

              <TouchableOpacity
                disabled={!reportStartKey || !reportEndKey || generatingReport}
                onPress={handleGenerateReport}
                activeOpacity={0.85}
                className="rounded-2xl py-4 items-center justify-center flex-row gap-2"
                style={{
                  backgroundColor: !reportStartKey || !reportEndKey || generatingReport ? colors.border : colors.primary,
                }}
              >
                {generatingReport ? (
                  <ActivityIndicator color={colors.buttonText} />
                ) : (
                  <>
                    <Feather name="download" size={16} color={colors.buttonText} />
                    <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                      Generate & Download
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>

        <CalendarModal
          initialDateKey={reportStartKey || undefined}
          maximumDate={reportEndKey ? dateKeyToDate(reportEndKey) : new Date()}
          onClose={() => setReportStartCalendarVisible(false)}
          onSelect={(dateKey) => {
            setReportStartKey(dateKey);
            setReportStartCalendarVisible(false);
          }}
          visible={reportStartCalendarVisible}
        />
        <CalendarModal
          initialDateKey={reportEndKey || undefined}
          maximumDate={new Date()}
          minimumDate={reportStartKey ? dateKeyToDate(reportStartKey) : undefined}
          onClose={() => setReportEndCalendarVisible(false)}
          onSelect={(dateKey) => {
            setReportEndKey(dateKey);
            setReportEndCalendarVisible(false);
          }}
          visible={reportEndCalendarVisible}
        />
      </Modal>
    </>
  );
}
