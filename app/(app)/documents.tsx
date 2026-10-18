import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, RefreshControl, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionSheet, type ActionSheetItem } from "../../components/ActionSheet";
import { useAuth } from "../../components/auth-context";
import { DocumentCard, DocumentListSkeleton } from "../../components/documents/DocumentCard";
import { DocumentPreview } from "../../components/documents/DocumentPreview";
import { ChoiceChips } from "../../components/documents/DocumentSheet";
import {
  DOC_TYPE_META,
  DOC_TYPE_ORDER,
  docTypeAccent,
  documentsLayout,
  formatDateLabel,
  groupByMonth,
  lastDaysRange,
  shareDocumentFile,
} from "../../components/documents/documentMeta";
import { DoctorReportSheet, SummarizeSheet } from "../../components/documents/RangeSheets";
import { UploadSheet, type UploadRequest } from "../../components/documents/UploadSheet";
import { EmptyState } from "../../components/EmptyState";
import { ColumnLabel } from "../../components/ColumnLabel";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonList } from "../../components/Skeleton";
import { LockedFeatureCard } from "../../components/subscription/LockedFeatureCard";
import { PaywallModal } from "../../components/subscription/PaywallModal";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useDataRefresh } from "../../hooks/useDataRefresh";
import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import { alert } from "../../lib/alert";
import {
  documentApi,
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
  const [fabCollapsed, setFabCollapsed] = useState(false);
  const { gutter, columns, gap, cardWidth, compact } = documentsLayout(useContentWidth());
  const wide = columns === 2;

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

  const fetchDocuments = useCallback(async () => {
    try {
      const result = await fetchDocumentsPage(1);
      setDocuments(result.documents);
      setDocPage(1);
      setDocTotal(result.pagination?.total ?? null);
      setHasMoreDocs(hasMorePages(result.pagination));
    } catch (error) {
      alert("Couldn't load documents", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchDocumentsPage]);

  const loadMoreDocuments = useCallback(async () => {
    if (loadingMoreDocs || !hasMoreDocs) return;
    setLoadingMoreDocs(true);
    try {
      const nextPage = docPage + 1;
      const result = await fetchDocumentsPage(nextPage);
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
    const result = await fetchDocumentsPage(1);
    setDocuments((prev) => {
      const fresh = new Set(result.documents.map((d) => d._id));
      return result.documents.concat(docPage > 1 ? prev.filter((d) => !fresh.has(d._id)) : []);
    });
    setDocTotal(result.pagination?.total ?? null);
    if (docPage === 1) setHasMoreDocs(hasMorePages(result.pagination));
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
      // Quiet refetch: the new card animates into the list behind the sheet.
      fetchDocuments();
      return true;
    } catch (error) {
      if (isFeatureLockedError(error)) {
        paywallFromUpload();
      } else {
        alert("Upload failed", error instanceof Error ? error.message : "Please try again.");
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

  // Shares the file itself, fetched with a fresh signed link.
  async function handleShare(doc: MedicalDocument) {
    if (sharing) return;
    setSharing(true);
    try {
      const fresh = await documentApi.get(doc._id).then((r) => r.document).catch(() => doc);
      await shareDocumentFile(fresh);
    } catch (error) {
      alert("Couldn't share", error instanceof Error ? error.message : "Please try again.");
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

  const actionItems: ActionSheetItem[] = actionDoc
    ? [
        { key: "view", label: "View", icon: "eye", onPress: () => openDocument(actionDoc) },
        { key: "ask", label: "Ask AI about it", description: "Chat about this document", icon: "message-circle", onPress: () => askAI(actionDoc) },
        ...(Platform.OS !== "web"
          ? [{ key: "share", label: "Share file", description: "Send it to your doctor", icon: "share" as const, onPress: () => handleShare(actionDoc) }]
          : []),
        { key: "delete", label: "Delete", icon: "trash-2", destructive: true, onPress: () => handleDelete(actionDoc) },
      ]
    : [];

  // --- Summarize flow ---
  const [summarizeVisible, setSummarizeVisible] = useState(false);
  const [summaryRange, setSummaryRange] = useState({ start: "", end: "" });
  const [summarizing, setSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{ documentCount: number; summary: string } | null>(null);
  const [summaryLanguage, setSummaryLanguage] = useState<LanguageCode>("en-IN");

  function openSummarize() {
    setSummaryRange(lastDaysRange(90));
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
      alert("Couldn't generate summary", error instanceof Error ? error.message : "Please try again.");
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
  useEffect(() => {
    if (openReport !== "1") return;
    router.setParams({ openReport: undefined });
    openReportSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openReport]);

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
        userName: user?.firstName,
      });
      setReportVisible(false);
    } catch (error) {
      alert("Couldn't create report", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setGeneratingReport(false);
    }
  }

  const statusBar = <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />;
  const header = <ScreenHeader title="Documents" subtitle="Reports, prescriptions and bills" />;

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
  const listTitle = searching
    ? "Results"
    : typeFilter
      ? DOC_TYPE_META[typeFilter].plural.charAt(0).toUpperCase() + DOC_TYPE_META[typeFilter].plural.slice(1)
      : "Your files";
  const groups = groupByMonth(visibleDocuments);

  const filterOptions: { value: Filter; label: string; icon?: keyof typeof Ionicons.glyphMap; color?: string; bg?: string }[] = [
    { value: "all", label: "All" },
    ...DOC_TYPE_ORDER.map((type) => {
      const accent = docTypeAccent(colors, type);
      return { value: type as Filter, label: DOC_TYPE_META[type].label, icon: DOC_TYPE_META[type].icon, color: accent.color, bg: accent.bg };
    }),
  ];

  const tools: { key: string; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; locked?: boolean; onPress: () => void }[] = [
    {
      key: "report",
      label: "Doctor report",
      hint: "PDF of your logs",
      icon: "document-attach-outline",
      color: colors.secondary,
      bg: colors.secondaryLight,
      locked: !hasAccess("health_reports"),
      onPress: openReportSheet,
    },
    { key: "summary", label: "Summarize", hint: "Plain-language recap", icon: "sparkles-outline", color: colors.accentText, bg: colors.accentLight, onPress: openSummarize },
    { key: "ask", label: "Ask AI", hint: "Chat about results", icon: "chatbubbles-outline", color: colors.primary, bg: colors.primaryLight, onPress: () => askAI() },
  ];

  return (
    <>
      {statusBar}
      <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: colors.background }}>
        {header}

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          stickyHeaderIndices={[0]}
          onScroll={(e) => setFabCollapsed(e.nativeEvent.contentOffset.y > 140)}
          scrollEventThrottle={64}
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {/* Search + category filter, pinned while the list scrolls */}
          <View style={{ backgroundColor: colors.background, paddingTop: 8, paddingBottom: 10 }}>
            <View style={{ paddingHorizontal: gutter }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  height: 48,
                  paddingLeft: 16,
                  paddingRight: 6,
                  borderRadius: 16,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: searchFocused ? colors.primary : colors.border,
                }}
              >
                <Ionicons name="search" size={18} color={searchFocused ? colors.primary : colors.mutedText} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search by name, category or date"
                  placeholderTextColor={colors.mutedText}
                  returnKeyType="search"
                  autoCorrect={false}
                  maxFontSizeMultiplier={1.3}
                  accessibilityLabel="Search documents"
                  className="outline-none"
                  style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: fonts.body, paddingVertical: 0 }}
                />
                {search ? (
                  <TouchableOpacity
                    onPress={() => setSearch("")}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={6}
                    style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.mutedText} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 10 }}
              contentContainerStyle={{ paddingHorizontal: gutter }}
            >
              <ChoiceChips<Filter> value={typeFilter ?? "all"} onChange={(v) => setTypeFilter(v === "all" ? null : v)} options={filterOptions} />
            </ScrollView>
          </View>

          {/* Tools: doctor report, summary, chat — one row of equal tiles */}
          {showTools ? (
            <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)} style={{ paddingHorizontal: gutter, paddingTop: 8 }}>
              <View style={{ flexDirection: "row", gap: compact ? 8 : 10 }}>
                {tools.map((tool) => (
                  <TouchableOpacity
                    key={tool.key}
                    activeOpacity={0.8}
                    onPress={tool.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={`${tool.label}. ${tool.hint}${tool.locked ? ". Locked" : ""}`}
                    style={{
                      flex: 1,
                      alignItems: wide ? "flex-start" : "center",
                      paddingVertical: compact ? 12 : 14,
                      paddingHorizontal: compact ? 6 : 12,
                      borderRadius: 20,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: isDark ? colors.border : "transparent",
                      ...getShadow(colors, isDark),
                    }}
                  >
                    <View
                      style={{
                        width: compact ? 40 : 44,
                        height: compact ? 40 : 44,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: tool.bg,
                      }}
                    >
                      <Ionicons name={tool.icon} size={compact ? 19 : 21} color={tool.color} />
                      {tool.locked ? (
                        <View
                          style={{
                            position: "absolute",
                            right: -4,
                            top: -4,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.surface,
                          }}
                        >
                          <Ionicons name="lock-closed" size={10} color={colors.mutedText} />
                        </View>
                      ) : null}
                    </View>
                    {wide ? (
                      <>
                        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 10, fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                          {tool.label}
                        </Text>
                        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 1, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                          {tool.hint}
                        </Text>
                      </>
                    ) : (
                      <ColumnLabel style={{ marginTop: 8, fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                        {tool.label}
                      </ColumnLabel>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          ) : null}

          {/* List heading */}
          <Animated.View
            layout={LinearTransition.duration(220)}
            style={{ paddingHorizontal: gutter, paddingTop: 22, paddingBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View className="flex-row items-baseline" style={{ gap: 8, flexShrink: 1 }}>
              <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
                {listTitle}
              </Text>
              {!loading ? (
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedText, fontFamily: fonts.body }}>{count}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
              accessibilityRole="button"
              accessibilityLabel={sortOrder === "desc" ? "Sorted newest first. Tap for oldest first." : "Sorted oldest first. Tap for newest first."}
              hitSlop={8}
              className="flex-row items-center"
              style={{ gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="swap-vertical" size={14} color={colors.primaryDark} />
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>
                {sortOrder === "desc" ? "Newest" : "Oldest"}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* List, grouped by month */}
          <View style={{ paddingHorizontal: gutter }}>
            {loading ? (
              <View style={{ paddingTop: 10 }}>
                <DocumentListSkeleton count={columns === 2 ? 6 : 5} width={columns === 2 ? cardWidth : undefined} />
              </View>
            ) : visibleDocuments.length === 0 ? (
              <Animated.View
                entering={FadeInDown.duration(240)}
                style={{ marginTop: 10, borderRadius: 22, backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
              >
                {searching ? (
                  <EmptyState
                    compact
                    icon="file-search-outline"
                    title="No matches"
                    message={hasMoreDocs ? `Nothing loaded matches "${search.trim()}". Show more to search older files.` : `Nothing matches "${search.trim()}".`}
                    actionLabel="Clear search"
                    onAction={() => setSearch("")}
                  />
                ) : filterLabel ? (
                  <EmptyState
                    compact
                    icon="folder-outline"
                    title={`No ${DOC_TYPE_META[typeFilter!].plural} yet`}
                    message="Add one and it will show up here."
                    actionLabel="Upload a document"
                    onAction={openUpload}
                  />
                ) : (
                  <EmptyState
                    compact
                    icon="folder-open-outline"
                    title="Keep your health papers in one place"
                    message="Upload prescriptions, lab reports and bills. Only you can see them."
                    actionLabel="Upload your first document"
                    onAction={openUpload}
                  />
                )}
              </Animated.View>
            ) : (
              groups.map((group, groupIndex) => (
                <Animated.View key={group.label} layout={LinearTransition.duration(220)}>
                  <Text
                    accessibilityRole="header"
                    maxFontSizeMultiplier={1.3}
                    style={{
                      marginTop: groupIndex === 0 ? 10 : 20,
                      marginBottom: 10,
                      fontSize: 12,
                      fontWeight: "800",
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      color: colors.mutedText,
                      fontFamily: fonts.body,
                    }}
                  >
                    {group.label}
                  </Text>
                  <View style={{ flexDirection: columns === 2 ? "row" : "column", flexWrap: "wrap", gap }}>
                    {group.docs.map((doc) => (
                      <DocumentCard
                        key={doc._id}
                        doc={doc}
                        index={visibleDocuments.indexOf(doc)}
                        onOpen={openDocument}
                        onMore={setActionDoc}
                        width={columns === 2 ? cardWidth : undefined}
                      />
                    ))}
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
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 20 }}>
                <Ionicons name="lock-closed-outline" size={13} color={colors.mutedText} />
                <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                  Private to you · opened with expiring links
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* Upload button: extended at the top, shrinks to an icon while scrolling down */}
        <Animated.View
          layout={LinearTransition.duration(200)}
          style={{
            position: "absolute",
            right: gutter,
            bottom: insets.bottom + 20,
            borderRadius: 27,
            ...getShadow(colors, isDark),
            shadowOpacity: isDark ? 0.4 : 0.18,
          }}
        >
          <TouchableOpacity
            onPress={openUpload}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Upload a document"
            style={{
              height: 56,
              minWidth: 56,
              paddingHorizontal: fabCollapsed ? 0 : 20,
              borderRadius: 28,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: colors.primary,
            }}
          >
            <Ionicons name={fabCollapsed ? "add" : "cloud-upload-outline"} size={fabCollapsed ? 26 : 20} color={colors.buttonText} />
            {!fabCollapsed ? (
              <Animated.Text
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(100)}
                maxFontSizeMultiplier={1.3}
                style={{ fontSize: 15, fontWeight: "800", color: colors.buttonText, fontFamily: fonts.body }}
              >
                Upload
              </Animated.Text>
            ) : null}
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>

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
