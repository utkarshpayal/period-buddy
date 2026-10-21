import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, RefreshControl, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInRight,
  FadeOut,
  FadeOutRight,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
  ZoomOut,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionSheet, type ActionSheetItem } from "../../components/ActionSheet";
import { useAuth } from "../../components/auth-context";
import { DocumentCard, DocumentListSkeleton } from "../../components/documents/DocumentCard";
import { AskDocuments } from "../../components/documents/AskDocuments";
import { DocumentPreview } from "../../components/documents/DocumentPreview";
import { FilterChips, type FilterChipOption } from "../../components/FilterChips";
import { getShadow } from "../../components/ui-tokens";
import {
  DOC_TYPE_META,
  DOC_TYPE_ORDER,
  documentsLayout,
  formatDateLabel,
  groupByMonth,
  lastDaysRange,
  shareDocumentFile,
} from "../../components/documents/documentMeta";
import { DoctorReportSheet, SummarizeSheet } from "../../components/documents/RangeSheets";
import { UploadSheet, type UploadRequest } from "../../components/documents/UploadSheet";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { HeaderIconButton, ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonList } from "../../components/Skeleton";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { useTheme } from "../../components/theme";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { alert } from "../../lib/alert";
import {
  documentApi,
  getFriendlyErrorMessage,
  hasMorePages,
  isFeatureLockedError,
  type DocType,
  type LanguageCode,
  type MedicalDocument,
} from "../../lib/api";
import { generateAndShareHealthReport } from "../../lib/healthReport";
import { useContentWidth } from "../../lib/layout";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { cleanupTempFiles } from "../../lib/tempFiles";
import { consultationIdOfDoc } from "../../lib/prescriptionDocs";
import { PrescriptionViewer } from "../../components/PrescriptionViewer";
import { prescriptionAction } from "../../lib/prescriptionPdf";
import { computeAge } from "../../lib/chatTopics";
import { Icon } from "../../components/Icon";
import { motion } from "../../components/motion";

type Filter = DocType | "all";

export default function DocumentsScreen() {
  useSecureScreen("documents");

  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { openReport } = useLocalSearchParams<{ openReport?: string }>();
  const { user } = useAuth();

  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<DocType | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);
  const { gutter } = documentsLayout(useContentWidth());

  // Upload/chat gated behind 'document_chat'; "Download doctor report" gated
  // client-side only behind 'health_reports' — GET /api/reports/health-report
  // also backs the free Graphs & Reports dashboard, so it's intentionally
  // not gated on the server (see period-buddy-be's reportRoutes.js).
  const [paywallFeature, setPaywallFeature] = useState<"document_chat" | "health_reports" | null>(null);
  const {
    hasAccess,
    isLoading: subscriptionLoading,
    refresh: refreshSubscriptionAccess,
  } = useSubscriptionAccess();
  // Whole-screen gate: block entry only if the user has neither premium
  // capability this screen offers (upload/chat via 'document_chat', PDF
  // report via 'health_reports') — someone who's unlocked just one still
  // needs to reach this screen to use it, so this isn't a per-key gate.
  const locked = !subscriptionLoading && !hasAccess("document_chat") && !hasAccess("health_reports");

  useEffect(() => {
    if (locked) setPaywallFeature("health_reports");
  }, [locked]);

  // Paged 20 at a time with a "Show more" button. `docTotal` is the server's
  // count for the current filter, so the header count stays right before
  // every page is loaded.
  const DOC_PAGE_SIZE = 20;
  const [docPage, setDocPage] = useState(1);
  const [docTotal, setDocTotal] = useState<number | null>(null);
  const [hasMoreDocs, setHasMoreDocs] = useState(false);
  const [loadingMoreDocs, setLoadingMoreDocs] = useState(false);

  const fetchDocumentsPage = useCallback(
    (page: number) =>
      documentApi.list({
        docType: typeFilter ?? undefined,
        limit: DOC_PAGE_SIZE,
        page,
        sort: sortOrder,
      }),
    [typeFilter, sortOrder],
  );

  // Bumped by every page-1 load (filter/sort change, refresh): a response for
  // an older filter, or a "Show more" page started before it, is dropped.
  const listSeq = useRef(0);
  const docPageRef = useRef(docPage);
  docPageRef.current = docPage;

  const fetchDocuments = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const result = await fetchDocumentsPage(1);
      if (seq !== listSeq.current) return;
      setDocuments(result.documents);
      setDocPage(1);
      setDocTotal(result.pagination?.total ?? null);
      setHasMoreDocs(hasMorePages(result.pagination));
    } catch (error) {
      if (seq !== listSeq.current) return;
      alert("Couldn't load documents", getFriendlyErrorMessage(error));
    } finally {
      if (seq === listSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [fetchDocumentsPage]);

  const loadMoreDocuments = useCallback(async () => {
    if (loadingMoreDocs || !hasMoreDocs) return;
    setLoadingMoreDocs(true);
    const seq = listSeq.current;
    try {
      const nextPage = docPage + 1;
      const result = await fetchDocumentsPage(nextPage);
      if (seq !== listSeq.current) return;
      setDocuments((prev) => {
        const seen = new Set(prev.map((d) => d._id));
        return prev.concat(result.documents.filter((d) => !seen.has(d._id)));
      });
      setDocPage(nextPage);
      setDocTotal(result.pagination?.total ?? null);
      setHasMoreDocs(hasMorePages(result.pagination));
    } catch {
      // Keep the list and the button so the user can retry.
    } finally {
      setLoadingMoreDocs(false);
    }
  }, [loadingMoreDocs, hasMoreDocs, docPage, fetchDocumentsPage]);

  // A doctor's prescription (saved into Documents by the server) opens in
  // the prescription viewer: id of its consultation, and the doctor's name.
  const [rxViewing, setRxViewing] = useState<{ consultationId: string; doctorName?: string } | null>(null);

  useEffect(() => {
    if (locked) return;
    setLoading(true);
    fetchDocuments();
  }, [fetchDocuments, locked]);

  function handleRefresh() {
    setRefreshing(true);
    fetchDocuments();
  }

  // Keeps the list in sync with uploads/summaries/deletes, including async
  // extraction finishing. Quiet: no loader and no error alert.
  // Re-fetches page 1 and merges it over the top, so pages already opened
  // with "Show more" stay open.
  useDataRefresh(["documents"], async () => {
    if (locked) return;
    const seq = listSeq.current;
    const result = await fetchDocumentsPage(1);
    if (seq !== listSeq.current) return;
    // Read at answer time: "Show more" may have opened a page meanwhile.
    const openedPages = docPageRef.current > 1;
    setDocuments((prev) => {
      const fresh = new Set(result.documents.map((d) => d._id));
      return result.documents.concat(openedPages ? prev.filter((d) => !fresh.has(d._id)) : []);
    });
    setDocTotal(result.pagination?.total ?? null);
    if (!openedPages) setHasMoreDocs(hasMorePages(result.pagination));
  });

  // Search runs over the pages already loaded (the list API has no text
  // search); "Show more" below the results pulls in older ones.
  const query = search.trim().toLowerCase();
  const visibleDocuments = useMemo(() => {
    if (!query) return documents;
    return documents.filter((doc) => {
      const meta = DOC_TYPE_META[doc.docType] ?? DOC_TYPE_META.other;
      return [doc.title, doc.originalFileName ?? "", meta.label, formatDateLabel(doc.documentDate)].some((field) =>
        field.toLowerCase().includes(query),
      );
    });
  }, [documents, query]);

  // --- Upload flow ---
  const [uploadVisible, setUploadVisible] = useState(false);

  // Checked right at the tap that opens the upload sheet — not after the
  // user has already picked a file and filled out the form — so a locked
  // user sees the paywall immediately instead of at the end of the flow.
  function openUpload() {
    if (!hasAccess("document_chat")) {
      setPaywallFeature("document_chat");
      return;
    }
    setUploadVisible(true);
  }

  /** Two native Modals can't present at once: close the sheet, then show the paywall. */
  function paywallFromUpload() {
    setUploadVisible(false);
    setTimeout(() => setPaywallFeature("document_chat"), 350);
  }

  async function handleUpload(request: UploadRequest): Promise<boolean> {
    if (!hasAccess("document_chat")) {
      paywallFromUpload();
      return false;
    }
    try {
      await documentApi.upload({
        docType: request.docType,
        documentDate: request.documentDate,
        fileName: request.file.name,
        localUri: request.file.uri,
        mimeType: request.file.mimeType,
        title: request.title,
      });
      // The upload's "documents" change refetches page 1 quietly
      // (useDataRefresh above), so opened pages stay open.
      return true;
    } catch (error) {
      if (isFeatureLockedError(error)) {
        paywallFromUpload();
      } else {
        alert("Upload failed", getFriendlyErrorMessage(error));
      }
      return false;
    }
  }

  // --- Preview / actions ---
  const [previewDoc, setPreviewDoc] = useState<MedicalDocument | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  // Removes PDFs handed to the PDF app (and shared copies) once the preview
  // closes, and any left from an earlier visit: by then the other app has
  // read its copy.
  useEffect(() => {
    if (!previewDoc) cleanupTempFiles();
  }, [previewDoc]);
  // Links expire after 10 minutes, so each open asks for a fresh one; the
  // list's copy is only a fallback if that request fails.
  const openDocument = useCallback(async (doc: MedicalDocument) => {
    // A doctor's prescription opens in the prescription viewer, not as a file.
    const consultationId = consultationIdOfDoc(doc);
    if (consultationId) {
      setRxViewing({ consultationId, doctorName: doc.title.match(/^Prescription from (Dr\. .+)$/)?.[1] });
      return;
    }
    setPreviewReady(false);
    setPreviewDoc(doc);
    try {
      const { document } = await documentApi.get(doc._id);
      setPreviewDoc((current) => (current?._id === doc._id ? document : current));
    } catch {
      /* keep the list's copy */
    } finally {
      setPreviewReady(true);
    }
  }, []);

  const [actionDoc, setActionDoc] = useState<MedicalDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);

  function handleDelete(doc: MedicalDocument) {
    alert("Delete this document?", `"${doc.title}" will be permanently removed.`, [
      { style: "cancel", text: "Cancel" },
      {
        onPress: async () => {
          try {
            setDeleting(true);
            await documentApi.remove(doc._id);
            setPreviewDoc((current) => (current?._id === doc._id ? null : current));
            setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
            setDocTotal((total) => (total == null ? total : Math.max(0, total - 1)));
          } catch (error) {
            alert("Couldn't delete", getFriendlyErrorMessage(error));
          } finally {
            setDeleting(false);
          }
        },
        style: "destructive",
        text: "Delete",
      },
    ]);
  }

  // Shares the file itself, fetched with a fresh signed link.
  async function handleShare(doc: MedicalDocument) {
    if (sharing) return;
    setSharing(true);
    try {
      const fresh = await documentApi.get(doc._id).then((r) => r.document).catch(() => doc);
      await shareDocumentFile(fresh);
    } catch (error) {
      alert("Couldn't share", getFriendlyErrorMessage(error));
    } finally {
      setSharing(false);
    }
  }

  function askAI(doc?: MedicalDocument) {
    const go = () => router.push(doc ? { pathname: "/document-chat", params: { docTitle: doc.title } } : "/document-chat");
    if (previewDoc) {
      // Let the preview sheet slide away before the chat pushes.
      setPreviewDoc(null);
      setTimeout(go, 350);
    } else {
      go();
    }
  }

  // A doctor's prescription: AI and save/print, but never delete (it's the doctor's record).
  const actionConsultationId = actionDoc ? consultationIdOfDoc(actionDoc) : null;
  const runPrescriptionAction = (action: "download" | "print", consultationId: string) =>
    prescriptionAction(action, { consultationId }).catch((err) =>
      alert(action === "print" ? "Couldn't print" : "Couldn't download", getFriendlyErrorMessage(err)),
    );

  const actionItems: ActionSheetItem[] = actionDoc && actionConsultationId
    ? [
        { key: "view", label: "Open", onPress: () => openDocument(actionDoc) },
        { key: "ask", label: "Ask about this prescription", onPress: () => askAI(actionDoc) },
        { key: "summary", label: "Summarize this prescription", onPress: () => openSummarize(actionDoc) },
        { key: "download", label: Platform.OS === "web" ? "Open printable copy" : "Save as PDF", onPress: () => runPrescriptionAction("download", actionConsultationId) },
        ...(Platform.OS !== "web" ? [{ key: "print", label: "Print", onPress: () => runPrescriptionAction("print", actionConsultationId) }] : []),
      ]
    : actionDoc
    ? [
        { key: "view", label: "Open", onPress: () => openDocument(actionDoc) },
        { key: "ask", label: "Ask about this document", onPress: () => askAI(actionDoc) },
        ...(Platform.OS !== "web" ? [{ key: "share", label: "Share", onPress: () => handleShare(actionDoc) }] : []),
        { key: "delete", label: "Delete", destructive: true, onPress: () => handleDelete(actionDoc) },
      ]
    : [];

  // --- Summarize flow ---
  const [summarizeVisible, setSummarizeVisible] = useState(false);
  const [summaryRange, setSummaryRange] = useState({ start: "", end: "" });
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{ documentCount: number; summary: string } | null>(null);
  const [summaryLanguage, setSummaryLanguage] = useState<LanguageCode>("en-IN");

  /** The last 90 days, or just the day of `doc` (a prescription's "Summarize"). */
  function openSummarize(doc?: MedicalDocument) {
    // The UTC calendar day, which is what the server's date range is built on.
    const day = doc?.documentDate.slice(0, 10);
    setSummaryRange(day ? { start: day, end: day } : lastDaysRange(90));
    setSummaryResult(null);
    setSummarizeVisible(true);
  }

  function closeSummarizeModal() {
    setSummarizeVisible(false);
    setSummaryResult(null);
  }

  async function handleGenerateSummary() {
    if (!summaryRange.start || !summaryRange.end || summarizing) return;
    try {
      setSummarizing(true);
      const result = await documentApi.summarize({
        endDate: summaryRange.end,
        language: summaryLanguage,
        startDate: summaryRange.start,
      });
      setSummaryResult({ documentCount: result.documentCount, summary: result.summary });
    } catch (error) {
      alert("Couldn't generate summary", getFriendlyErrorMessage(error));
    } finally {
      setSummarizing(false);
    }
  }

  // --- Health report flow ---
  const [reportVisible, setReportVisible] = useState(false);
  const [reportRange, setReportRange] = useState({ start: "", end: "" });
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportLanguage, setReportLanguage] = useState<LanguageCode>("en-IN");

  function openReportSheet() {
    if (!hasAccess("health_reports")) {
      setPaywallFeature("health_reports");
      return;
    }
    // Pre-filled to the last 90 days so nobody is stuck picking dates blind.
    setReportRange(lastDaysRange(90));
    setReportVisible(true);
  }

  // "Download doctor report" on the Graphs & Reports screen deep-links here
  // (?openReport=1) instead of duplicating this whole flow — open the sheet
  // pre-filled to the last 90 days.
  // Waits for the subscription check: until it answers, hasAccess() is
  // optimistically true and would open a locked report.
  useEffect(() => {
    if (openReport !== "1" || subscriptionLoading) return;
    router.setParams({ openReport: undefined });
    openReportSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReport, subscriptionLoading]);

  function closeReportModal() {
    if (generatingReport) return;
    setReportVisible(false);
  }

  async function handleGenerateReport() {
    if (!reportRange.start || !reportRange.end || generatingReport) return;
    try {
      setGeneratingReport(true);
      await generateAndShareHealthReport({
        startDate: reportRange.start,
        endDate: reportRange.end,
        language: reportLanguage,
        userName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || undefined,
        age: computeAge(user?.dateOfBirth),
      });
      setReportVisible(false);
    } catch (error) {
      alert("Couldn't create report", getFriendlyErrorMessage(error));
    } finally {
      setGeneratingReport(false);
    }
  }

  const statusBar = <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />;
  const header = <ScreenHeader title="Documents" />;

  if (subscriptionLoading) {
    return (
      <>
        {statusBar}
        <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
          {header}
          <SkeletonList count={5} style={{ paddingTop: 16 }} />
        </SafeAreaView>
      </>
    );
  }

  if (locked) {
    return (
      <>
        {statusBar}
        <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
          {header}
          <View className="flex-1 items-center justify-center px-6">
            <LockedFeatureCard
              title="Documents & Health Reports"
              description="Upload reports, chat about them, and download PDF summaries."
              onPress={() => setPaywallFeature("health_reports")}
            />
          </View>
        </SafeAreaView>
        <PaywallModal
          visible={paywallFeature !== null}
          onClose={() => setPaywallFeature(null)}
          featureKey={paywallFeature ?? "health_reports"}
          onUnlocked={refreshSubscriptionAccess}
        />
      </>
    );
  }

  const searching = query.length > 0;
  const showTools = !searching && typeFilter === null;
  const filterLabel = typeFilter ? DOC_TYPE_META[typeFilter].label : null;
  const count = searching ? visibleDocuments.length : docTotal ?? documents.length;
  const groups = groupByMonth(visibleDocuments);

  const filterOptions: FilterChipOption<Filter>[] = [
    { key: "all", label: "All" },
    ...DOC_TYPE_ORDER.map((type) => {
      const plural = DOC_TYPE_META[type].plural;
      return { key: type as Filter, label: type === "other" ? "Other" : plural.charAt(0).toUpperCase() + plural.slice(1) };
    }),
  ];
  const activeFilter: Filter = typeFilter ?? "all";
  const muted = { fontSize: 13, color: colors.mutedText, fontFamily: fonts.body };

  return (
    <>
      {statusBar}
      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader
          title="Documents"
          right={
            <>
              <HeaderIconButton icon="ellipsis-horizontal" onPress={() => setToolsOpen(true)} accessibilityLabel="Summaries and reports" />
              <HeaderIconButton icon="add" onPress={openUpload} accessibilityLabel="Upload a document" />
            </>
          }
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickyHeaderIndices={[0]}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {/* Search + category tabs, pinned while the list scrolls */}
          <View style={{ backgroundColor: colors.background, paddingTop: 8 }}>
            <View style={{ paddingHorizontal: gutter, flexDirection: "row", alignItems: "center" }}>
              <Animated.View
                layout={LinearTransition.springify().damping(18)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  height: 48,
                  paddingLeft: 14,
                  paddingRight: 6,
                  borderRadius: 16, borderCurve: "continuous",
                  borderWidth: 1,
                  borderColor: searchFocused ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <Icon set="ion" name="search" size={18} color={searchFocused ? colors.primary : colors.mutedText} />
                <TextInput
                  ref={searchRef}
                  value={search}
                  onChangeText={setSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search your files"
                  placeholderTextColor={colors.mutedText}
                  returnKeyType="search"
                  autoCorrect={false}
                  maxFontSizeMultiplier={1.3}
                  accessibilityLabel="Search documents"
                  className="outline-none"
                  style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: fonts.body, paddingVertical: 0 }}
                />
                {search ? (
                  <Animated.View entering={ZoomIn.duration(motion.duration.fast)} exiting={ZoomOut.duration(motion.duration.fast)}>
                    <TouchableOpacity
                      onPress={() => setSearch("")}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      hitSlop={6}
                      style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
                    >
                      <Icon set="ion" name="close-circle" size={18} color={colors.mutedText} />
                    </TouchableOpacity>
                  </Animated.View>
                ) : null}
              </Animated.View>
              {searchFocused || search ? (
                <Animated.View entering={FadeInRight.duration(motion.duration.base)} exiting={FadeOutRight.duration(motion.duration.fast)}>
                  <TouchableOpacity
                    onPress={() => {
                      setSearch("");
                      searchRef.current?.blur();
                    }}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={{ paddingLeft: 14 }}
                  >
                    <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: "600", color: colors.primaryDark, fontFamily: fonts.body }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              ) : null}
            </View>
            <FilterChips<Filter>
              options={filterOptions}
              value={activeFilter}
              onChange={(v) => setTypeFilter(v === "all" ? null : (v as DocType))}
              gutter={gutter}
              style={{ marginTop: 12, paddingBottom: 10 }}
            />
          </View>

          {showTools ? (
            <Animated.View entering={FadeIn.duration(motion.duration.base)} exiting={FadeOut.duration(motion.duration.fast)}>
              <AskDocuments gutter={gutter} onAsk={() => askAI()} />
            </Animated.View>
          ) : null}

          {/* Count and the sort toggle */}
          <View
            style={{ paddingHorizontal: gutter, paddingTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
          >
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={muted}>
              {loading ? " " : `${count} ${count === 1 ? "file" : "files"}`}
            </Text>
            <TouchableOpacity
              onPress={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
              accessibilityRole="button"
              accessibilityLabel={sortOrder === "desc" ? "Sorted newest first. Tap for oldest first." : "Sorted oldest first. Tap for newest first."}
              hitSlop={8}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, fontWeight: "600", color: colors.primaryDark, fontFamily: fonts.body }}>
                {sortOrder === "desc" ? "Newest first" : "Oldest first"}
              </Text>
              <SortArrow up={sortOrder === "asc"} color={colors.primaryDark} />
            </TouchableOpacity>
          </View>

          {/* List, grouped by month */}
          <View style={{ paddingHorizontal: gutter }}>
            {loading ? (
              <View style={{ paddingTop: 12 }}>
                <DocumentListSkeleton count={5} />
              </View>
            ) : visibleDocuments.length === 0 ? (
              <View style={{ paddingTop: 48, paddingHorizontal: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading, textAlign: "center" }}>
                  {searching ? "No matches" : filterLabel ? `No ${DOC_TYPE_META[typeFilter!].plural} yet` : "No documents yet"}
                </Text>
                <Text style={{ ...muted, marginTop: 6, lineHeight: 19, textAlign: "center" }}>
                  {searching
                    ? hasMoreDocs
                      ? `Nothing loaded matches "${search.trim()}". Load more to search older files.`
                      : `Nothing matches "${search.trim()}".`
                    : "Add prescriptions, lab reports and bills. Only you can see them."}
                </Text>
                <TouchableOpacity onPress={searching ? () => setSearch("") : openUpload} accessibilityRole="button" hitSlop={8} style={{ marginTop: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>
                    {searching ? "Clear search" : "Upload a document"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              groups.map((group, groupIndex) => (
                // Keyed by tab and sort too, so the list settles in again when either changes.
                <Animated.View
                  key={`${activeFilter}-${sortOrder}-${group.label}`}
                  entering={groupIndex < 4 ? FadeInDown.delay(groupIndex * 70).duration(motion.duration.slow) : undefined}
                  layout={LinearTransition.duration(220)}
                >
                  <Text
                    accessibilityRole="header"
                    maxFontSizeMultiplier={1.3}
                    style={{ marginTop: 16, marginBottom: 8, marginLeft: 4, fontSize: 13, fontWeight: "600", color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {group.label}
                  </Text>
                  {/* Shadow outside, clipping inside, so a held row's highlight follows the rounded corners. */}
                  <View style={{ borderRadius: 22, borderCurve: "continuous", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}>
                    <View style={{ borderRadius: 22, borderCurve: "continuous", overflow: "hidden" }}>
                      {group.docs.map((doc, i) => (
                        <DocumentCard
                          key={doc._id}
                          doc={doc}
                          divider={i > 0}
                          onOpen={openDocument}
                          onMore={setActionDoc}
                        />
                      ))}
                    </View>
                  </View>
                </Animated.View>
              ))
            )}
            {!loading && documents.length > 0 ? (
              <View style={{ paddingTop: 12 }}>
                <LoadMoreButton hasMore={hasMoreDocs} loading={loadingMoreDocs} onPress={loadMoreDocuments} />
              </View>
            ) : null}
            {!loading && documents.length > 0 && !hasMoreDocs ? (
              <Text maxFontSizeMultiplier={1.3} style={{ ...muted, paddingTop: 20, textAlign: "center" }}>
                Only you can see these files.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <PrescriptionViewer
        consultationId={rxViewing?.consultationId ?? ""}
        doctorName={rxViewing?.doctorName}
        visible={rxViewing !== null}
        onClose={() => setRxViewing(null)}
      />

      <UploadSheet visible={uploadVisible} onClose={() => setUploadVisible(false)} onUpload={handleUpload} />

      <DocumentPreview
        doc={previewDoc}
        ready={previewReady}
        onClose={() => setPreviewDoc(null)}
        onAskAI={askAI}
        onShare={handleShare}
        onDelete={handleDelete}
        sharing={sharing}
        deleting={deleting}
      />

      <ActionSheet
        visible={toolsOpen}
        items={[
          { key: "summary", label: "Summarize my reports", description: "A simple recap of any date range", icon: "book-open", onPress: () => openSummarize() },
          { key: "report", label: "Report for my doctor", description: "Your cycle and symptom logs as a PDF", icon: "file-text", onPress: openReportSheet },
        ]}
        onClose={() => setToolsOpen(false)}
      />

      <ActionSheet
        visible={actionDoc !== null}
        title={actionDoc?.title}
        subtitle={actionDoc ? `${DOC_TYPE_META[actionDoc.docType]?.label ?? "Document"} · ${formatDateLabel(actionDoc.documentDate)}` : undefined}
        items={actionItems}
        onClose={() => setActionDoc(null)}
      />

      <SummarizeSheet
        visible={summarizeVisible}
        onClose={closeSummarizeModal}
        range={summaryRange}
        setRange={setSummaryRange}
        language={summaryLanguage}
        setLanguage={setSummaryLanguage}
        summarizing={summarizing}
        result={summaryResult}
        onGenerate={handleGenerateSummary}
        onReset={() => setSummaryResult(null)}
      />

      <DoctorReportSheet
        visible={reportVisible}
        onClose={closeReportModal}
        range={reportRange}
        setRange={setReportRange}
        language={reportLanguage}
        setLanguage={setReportLanguage}
        generating={generatingReport}
        onGenerate={handleGenerateReport}
      />

      <PaywallModal
        visible={paywallFeature !== null}
        onClose={() => setPaywallFeature(null)}
        featureKey={paywallFeature ?? "document_chat"}
        onUnlocked={refreshSubscriptionAccess}
      />
    </>
  );
}

/** Small arrow that turns over when the sort order flips. */
function SortArrow({ up, color }: { up: boolean; color: string }) {
  const turn = useSharedValue(up ? 180 : 0);
  useEffect(() => {
    turn.value = withSpring(up ? 180 : 0, { damping: 14, stiffness: 180 });
  }, [up, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <Icon set="ion" name="arrow-down" size={13} color={color} />
    </Animated.View>
  );
}
