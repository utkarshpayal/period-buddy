import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Modal,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArticleReader } from "../../components/content/ArticleReader";
import { MediaTile, type MediaTone } from "../../components/content/MediaTile";
import { EmptyState } from "../../components/EmptyState";
import { FilterChips, type FilterChipOption } from "../../components/FilterChips";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { LoadMoreButton } from "../../components/LoadMoreButton";
import { AppModalHost } from "../../components/modals/AppModalHost";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SearchBar } from "../../components/SearchBar";
import { SkeletonMediaGrid } from "../../components/Skeleton";
import { type ThemeColors, useTheme } from "../../components/theme";
import { alert } from "../../lib/alert";
import {
  blogsApi,
  getFriendlyErrorMessage,
  isNetworkError,
  speechApi,
  type Blog,
  type BlogCategory,
  type ContentFeedItem,
  type Language,
  type LanguageCode,
} from "../../lib/api";
import { useSpokenReply } from "../../hooks/useSpokenReply";
import { SUPPORTED_LANGUAGES } from "../../lib/languages";
import { useContentWidth } from "../../lib/layout";
import { fetchQuery, hydrateQuery, peekQuery } from "../../lib/queryCache";
import { createReadTimer, formatReadDuration } from "../../lib/readTimer";
import { shareWithAppLink } from "../../lib/share";
import { Icon } from "../../components/Icon";
import Animated from "react-native-reanimated";
import { listEntering } from "../../components/motion";

// One article or video as this screen shows it (feed items, bookmarks and
// deep-linked articles all map into this).
interface ContentItem {
  id: string;
  title: string;
  author: string;
  type: "blog" | "reel";
  /** Read time for articles ("3 min read"), duration for videos. */
  time: string;
  imageUrl: string;
  summary: string;
  slug?: string;
  category?: BlogCategory;
  publishedAt?: string;
}

const CATEGORY_LABELS: Record<BlogCategory, string> = {
  general: "General",
  health: "Health",
  lifestyle: "Lifestyle",
  beauty: "Beauty",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as BlogCategory[];

function categoryLabel(category?: string): string | undefined {
  if (!category) return undefined;
  return CATEGORY_LABELS[category as BlogCategory] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** Placeholder tint + icon per category, so tiles without art still differ. */
function toneFor(item: Pick<ContentItem, "type" | "category">, colors: ThemeColors): MediaTone {
  if (item.type === "reel") return { bg: colors.primaryLight, fg: colors.primaryDark, icon: "play-circle-outline" };
  switch (item.category) {
    case "health":
      return { bg: colors.roseLight, fg: colors.rose, icon: "medkit-outline" };
    case "lifestyle":
      return { bg: colors.successLight, fg: colors.success, icon: "leaf-outline" };
    case "beauty":
      return { bg: colors.accentLight, fg: colors.accentText, icon: "flower-outline" };
    default:
      return { bg: colors.skyLight, fg: colors.sky, icon: "book-outline" };
  }
}

/** A video's duration for its badge, or null when the server has none ("0"). */
function videoDuration(time: string): string | null {
  const value = time?.trim();
  return value && value !== "0" ? value : null;
}

/**
 * Reading time shown on cards and articles: how long readers really spend
 * (average active time per visit, lib/readTimer.ts) once anyone has read
 * it, e.g. "1 min 12 s read"; until then the word-count estimate ("3 min
 * read"). Older servers could send 0 or nothing; never show "0 min".
 */
function formatReadTime(minutes?: number | null, averageSeconds?: number | null): string {
  const real = formatReadDuration(averageSeconds);
  if (real) return `${real} read`;
  const value = Math.round(Number(minutes) || 0);
  return `${Math.max(1, value)} min read`;
}

function mapFeedItem(item: ContentFeedItem): ContentItem {
  return {
    id: item.sourceId,
    title: item.title,
    author: item.author,
    type: item.type,
    time: item.type === "blog" ? formatReadTime(item.readTimeMinutes, item.averageReadSeconds) : item.time,
    imageUrl: item.imageUrl,
    summary: item.summary,
    slug: item.slug,
    category: item.category,
    publishedAt: item.publishedAt,
  };
}

function mapBlogToContentItem(blog: Blog): ContentItem {
  return {
    id: blog._id,
    title: blog.title,
    author: blog.author || "Nura team",
    type: "blog",
    time: formatReadTime(blog.readTimeMinutes, blog.averageReadSeconds),
    imageUrl: blog.coverImageUrl || "",
    summary: blog.excerpt || "",
    slug: blog.slug,
    category: blog.category,
    publishedAt: blog.publishedAt,
  };
}

// Only the first page of the unfiltered feed is cached (and kept on the
// device), so a revisit or cold start paints at once; other filters,
// searches and later pages stay live. Bookmark writes ("blogs" topic) mark
// it stale.
type FeedResponse = Awaited<ReturnType<typeof blogsApi.getFeed>>;
const DEFAULT_FEED_CACHE_KEY = "blogs:feed:type=all:category=all:p1";
const FEED_CACHE = { staleMs: 5 * 60_000, persist: true, topics: ["blogs" as const] };
const PAGE_SIZE = 10;
// useSpokenReply id for the article being read aloud.
const ARTICLE_SPEECH_ID = "article";
const GUTTER = 24;
const GRID_GAP = 12;

type TypeFilter = "all" | "blog" | "reel" | "saved";

export default function Blogs() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const contentWidth = useContentWidth();
  // `openedAt` changes on every tap of a link (app/_layout.tsx), so the same
  // article link opens again while this screen is mounted.
  const { slug: deepLinkedSlug, openedAt } = useLocalSearchParams<{ slug?: string; openedAt?: string }>();

  // Filters
  const [selectedType, setSelectedType] = useState<"all" | "blog" | "reel">("all");
  const [selectedCategory, setSelectedCategory] = useState<"all" | BlogCategory>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [seenCategories, setSeenCategories] = useState<BlogCategory[]>([]);

  // Feed
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<ContentItem[]>(
    () => peekQuery<FeedResponse>(DEFAULT_FEED_CACHE_KEY)?.items.map(mapFeedItem) ?? [],
  );
  const contentRef = useRef(content);
  contentRef.current = content;
  const [loadingFeed, setLoadingFeed] = useState(() => peekQuery(DEFAULT_FEED_CACHE_KEY) === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedOffline, setFeedOffline] = useState(false);
  /** The list on screen is an older copy because the latest fetch failed. */
  const [showingCached, setShowingCached] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(() => {
    const cached = peekQuery<FeedResponse>(DEFAULT_FEED_CACHE_KEY);
    return cached ? cached.pagination.page < cached.pagination.pages : false;
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  // "Saved" view (bookmarked articles)
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [bookmarkedContent, setBookmarkedContent] = useState<ContentItem[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);

  // Reader
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [fullBlog, setFullBlog] = useState<Blog | null>(null);
  const [articleLoading, setArticleLoading] = useState(false);
  // Active reading time of the open article (lib/readTimer.ts): only while
  // it's on screen, the app is in front and the reader isn't idle.
  const readTimerRef = useRef<ReturnType<typeof createReadTimer> | null>(null);
  const readBlogIdRef = useRef<string | null>(null);
  const articleHeightRef = useRef(0);

  /** Sends the not-yet-reported part of the current read, if any. */
  const flushRead = useCallback(() => {
    const timer = readTimerRef.current;
    const id = readBlogIdRef.current;
    if (!timer || !id) return;
    const report = timer.take();
    if (report.durationSeconds > 0 || report.completed) blogsApi.trackView(id, report).catch(() => {});
  }, []);

  // While an article is open, send the reading so far every 15 s (the
  // first send counts the view), so counts move while people read
  // instead of only when they close it. Continuations add time, never views.
  useEffect(() => {
    if (!previewVisible || selectedItem?.type !== "blog") return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = (delay: number) => {
      timer = setTimeout(() => {
        if (AppState.currentState === "active") flushRead();
        tick(15_000);
      }, delay);
    };
    tick(15_000);
    return () => clearTimeout(timer);
  }, [previewVisible, selectedItem?.type, selectedItem?.id, flushRead]);

  // Background pauses the clock and sends what we have (the app may never
  // come back); returning to the front resumes the same read.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      const timer = readTimerRef.current;
      if (!timer) return;
      if (state === "active") {
        timer.start();
      } else {
        timer.pause();
        flushRead();
      }
    });
    return () => sub.remove();
  }, [flushRead]);

  // Translate + listen (text-to-speech) states
  const [language, setLanguage] = useState<LanguageCode>("en-IN");
  const [languages, setLanguages] = useState<Language[]>(SUPPORTED_LANGUAGES);
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState<{ content: string; title: string } | null>(null);
  const translateRequestId = useRef(0);
  // Read aloud in sentence chunks; stops when the reader closes or the screen goes.
  const spoken = useSpokenReply(language);
  const isPlayingAudio = spoken.playingId === ARTICLE_SPEECH_ID;
  const isSynthesizing = spoken.preparingId === ARTICLE_SPEECH_ID;

  // Listening to the article counts as reading it, without touching the screen.
  useEffect(() => {
    if (!isPlayingAudio) return;
    readTimerRef.current?.activity();
    const id = setInterval(() => readTimerRef.current?.activity(), 20_000);
    return () => clearInterval(id);
  }, [isPlayingAudio]);

  // Search goes to the server once typing pauses; meanwhile the loaded
  // list is filtered on the phone so results react at once.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(id);
  }, [query]);

  // Category chips come from the data: every category seen so far stays,
  // so picking one doesn't make the others disappear.
  useEffect(() => {
    setSeenCategories((prev) => {
      const next = new Set(prev);
      for (const item of content) if (item.type === "blog" && item.category) next.add(item.category);
      if (next.size === prev.length) return prev;
      return CATEGORY_ORDER.filter((c) => next.has(c)).concat([...next].filter((c) => !CATEGORY_ORDER.includes(c)));
    });
  }, [content]);

  // Only the latest feed request may update the list, so a slow response
  // for an old filter can't overwrite a newer one.
  const feedRequestId = useRef(0);
  const lastFilterKey = useRef(`${selectedType}|${selectedCategory}`);
  const loadFeed = useCallback(async (force = false) => {
    const requestId = ++feedRequestId.current;
    const search = debouncedQuery;
    const isDefaultFeed = selectedType === "all" && selectedCategory === "all" && !search;

    // A new type/category starts from a skeleton rather than showing the
    // old filter's items; a new search keeps them (filtered) until it lands.
    const filterKey = `${selectedType}|${selectedCategory}`;
    if (filterKey !== lastFilterKey.current) {
      lastFilterKey.current = filterKey;
      setContent([]);
      setHasMore(false);
    }

    const applyFeed = (response: FeedResponse) => {
      setContent(response.items.map(mapFeedItem));
      setPage(1);
      setHasMore(response.items.length > 0 && response.pagination.page < response.pagination.pages);
      setLoadMoreFailed(false);
      setFeedError(null);
    };

    // Paint the cached (or device-saved) first page, then revalidate quietly.
    let painted = false;
    if (isDefaultFeed && !force) {
      const cached = await hydrateQuery<FeedResponse>(DEFAULT_FEED_CACHE_KEY);
      if (requestId !== feedRequestId.current) return;
      if (cached) {
        applyFeed(cached);
        setLoadingFeed(false);
        painted = true;
      }
    }
    if (!painted) setLoadingFeed(true);
    try {
      const fetchFeed = () =>
        blogsApi.getFeed({
          limit: PAGE_SIZE,
          page: 1,
          type: selectedType,
          category: selectedCategory === "all" ? undefined : selectedCategory,
          search: search || undefined,
        });
      const response = isDefaultFeed
        ? await fetchQuery(DEFAULT_FEED_CACHE_KEY, fetchFeed, { ...FEED_CACHE, force })
        : await fetchFeed();
      if (requestId !== feedRequestId.current) return;
      applyFeed(response);
      setShowingCached(false);
    } catch (error) {
      if (requestId !== feedRequestId.current) return;
      // The saved first page (or whatever is already on screen) beats an
      // error screen; say it may be out of date.
      const cached = isDefaultFeed ? peekQuery<FeedResponse>(DEFAULT_FEED_CACHE_KEY) : undefined;
      if (cached) {
        applyFeed(cached);
        setShowingCached(true);
      } else if (contentRef.current.length > 0) {
        setShowingCached(true);
      } else {
        setFeedError(getFriendlyErrorMessage(error));
        setFeedOffline(isNetworkError(error));
        setHasMore(false);
      }
    } finally {
      if (requestId === feedRequestId.current) setLoadingFeed(false);
    }
  }, [selectedType, selectedCategory, debouncedQuery]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const loadBookmarks = useCallback(async () => {
    if (bookmarkedContent.length === 0) setLoadingBookmarks(true);
    try {
      const result = await blogsApi.getBookmarks();
      setBookmarkedContent(result.blogs.map(mapBlogToContentItem));
      setBookmarkedIds(new Set(result.blogs.map((b) => b._id)));
      setBookmarksError(null);
    } catch (error) {
      if (bookmarkedContent.length === 0) setBookmarksError(getFriendlyErrorMessage(error));
    } finally {
      setLoadingBookmarks(false);
    }
  }, [bookmarkedContent.length]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await (showBookmarksOnly ? loadBookmarks() : loadFeed(true));
    } finally {
      setRefreshing(false);
    }
  }, [loadFeed, loadBookmarks, showBookmarksOnly]);

  useEffect(() => {
    let isMounted = true;
    blogsApi
      .getBookmarks()
      .then((result) => {
        if (isMounted) setBookmarkedIds(new Set(result.blogs.map((b) => b._id)));
      })
      .catch(() => {});
    speechApi
      .getLanguages()
      .then((result) => {
        if (isMounted && result.languages?.length) setLanguages(result.languages);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Opens straight to the shared article when the app was launched via a
  // "blogs?slug=..." deep link (see lib/share.ts / handleShareContent below).
  useEffect(() => {
    if (!deepLinkedSlug) return;
    let isMounted = true;

    blogsApi
      .getBlogBySlug(deepLinkedSlug)
      .then((blog) => {
        if (isMounted) handleOpenItem(mapBlogToContentItem(blog), blog);
      })
      .catch(() => {
        if (isMounted) alert("Couldn't open that article", "It may have been removed.");
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only meant to fire once for the initial deep link, not re-run when handleOpenItem is redefined each render
  }, [deepLinkedSlug, openedAt]);

  async function handleLoadMore() {
    if (loadingMore || !hasMore) return;
    const requestId = feedRequestId.current;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    try {
      const nextPage = page + 1;
      const response = await blogsApi.getFeed({
        limit: PAGE_SIZE,
        page: nextPage,
        type: selectedType,
        category: selectedCategory === "all" ? undefined : selectedCategory,
        search: debouncedQuery || undefined,
      });
      if (requestId !== feedRequestId.current) return;
      setContent((prev) => {
        const seen = new Set(prev.map((item) => `${item.type}:${item.id}`));
        return [...prev, ...response.items.map(mapFeedItem).filter((item) => !seen.has(`${item.type}:${item.id}`))];
      });
      setPage(nextPage);
      setHasMore(response.pagination.page < response.pagination.pages);
    } catch {
      // Keep the button so the person can try again.
      if (requestId === feedRequestId.current) setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleTypeChange(key: TypeFilter) {
    if (key === "saved") {
      setShowBookmarksOnly(true);
      loadBookmarks();
      return;
    }
    setShowBookmarksOnly(false);
    setSelectedType(key);
    // Categories only apply to articles.
    if (key === "reel") setSelectedCategory("all");
  }

  function handleBrowseAll() {
    setShowBookmarksOnly(false);
    setQuery("");
    setDebouncedQuery("");
    setSelectedType("all");
    setSelectedCategory("all");
  }

  async function handleToggleBookmark(id: string) {
    const wasBookmarked = bookmarkedIds.has(id);

    // Optimistic update — rolled back below if the request fails.
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (wasBookmarked) next.delete(id);
      else next.add(id);
      return next;
    });

    try {
      const result = await blogsApi.toggleBookmark(id);
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (result.bookmarked) next.add(id);
        else next.delete(id);
        return next;
      });
      if (!result.bookmarked) {
        setBookmarkedContent((prev) => prev.filter((item) => item.id !== id));
      } else {
        // Keep the Saved list in step without another request.
        const item = [...content, ...(selectedItem ? [selectedItem] : [])].find((c) => c.id === id && c.type === "blog");
        if (item) setBookmarkedContent((prev) => (prev.some((c) => c.id === id) ? prev : [item, ...prev]));
      }
    } catch {
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (wasBookmarked) next.add(id);
        else next.delete(id);
        return next;
      });
      alert("Couldn't save the article", "Please try again.");
    }
  }

  const stopAudio = spoken.stop;

  /** Videos play in the Reels screen; articles open in the reader. */
  async function handleOpenItem(item: ContentItem, preloaded?: Blog) {
    if (item.type === "reel") {
      router.push({ pathname: "/(app)/reels", params: { reelId: item.id } });
      return;
    }

    setSelectedItem(item);
    setPreviewVisible(true);
    setFullBlog(preloaded ?? null);
    setTranslated(null);
    setTranslating(false);
    translateRequestId.current++;
    setLanguage("en-IN");

    const timer = createReadTimer();
    timer.start();
    readTimerRef.current = timer;
    readBlogIdRef.current = item.id;

    if (preloaded || !item.slug) return;

    setArticleLoading(true);
    // A slow answer for an article that was closed (or swapped for another)
    // must not land in the one being read.
    const stillOpen = () => readBlogIdRef.current === item.id;
    try {
      const blog = await blogsApi.getBlogBySlug(item.slug);
      if (stillOpen()) setFullBlog(blog);
    } catch {
      if (stillOpen()) setFullBlog(null);
    } finally {
      if (stillOpen()) setArticleLoading(false);
    }
  }

  function handleClosePreview() {
    stopAudio();

    readTimerRef.current?.pause();
    flushRead();
    readTimerRef.current = null;
    readBlogIdRef.current = null;

    setPreviewVisible(false);
  }

  /** Picking a language translates straight away; English shows the original. */
  async function handleSelectLanguage(code: LanguageCode) {
    if (code === language) return;
    stopAudio();
    const requestId = ++translateRequestId.current;

    if (code === "en-IN" || !selectedItem?.slug) {
      setLanguage(code);
      setTranslated(null);
      setTranslating(false);
      return;
    }

    const previous = language;
    setLanguage(code);
    setTranslating(true);
    try {
      const result = await blogsApi.translateBlog(selectedItem.slug, code);
      if (requestId !== translateRequestId.current) return;
      setTranslated({ content: result.content, title: result.title });
    } catch (error) {
      if (requestId !== translateRequestId.current) return;
      setLanguage(previous);
      alert("Couldn't translate", getFriendlyErrorMessage(error));
    } finally {
      if (requestId === translateRequestId.current) setTranslating(false);
    }
  }

  function handleListen() {
    if (isPlayingAudio || isSynthesizing) {
      stopAudio();
      return;
    }
    const text = translated?.content || fullBlog?.content || selectedItem?.summary;
    if (!text) return;
    spoken.speak(ARTICLE_SPEECH_ID, text).catch((error: unknown) => alert("Couldn't play audio", getFriendlyErrorMessage(error)));
  }

  async function handleShareContent(item: ContentItem) {
    try {
      await shareWithAppLink(
        `Read "${item.title}" on Nura.`,
        item.slug ? `blogs?slug=${encodeURIComponent(item.slug)}` : "blogs",
      );
    } catch {
      alert("Couldn't share", "Unable to open the share sheet right now.");
    }
  }

  // --- What's on screen ---
  const trimmedQuery = query.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    const base = showBookmarksOnly
      ? bookmarkedContent
      : selectedType === "all"
        ? content
        : content.filter((c) => c.type === selectedType);
    if (!trimmedQuery) return base;
    return base.filter((c) =>
      [c.title, c.summary, c.author].some((field) => field?.toLowerCase().includes(trimmedQuery)),
    );
  }, [showBookmarksOnly, bookmarkedContent, selectedType, content, trimmedQuery]);

  const featured =
    !showBookmarksOnly && !trimmedQuery && selectedType !== "reel" && visibleItems.length >= 3
      ? visibleItems.find((c) => c.type === "blog")
      : undefined;
  const gridItems = featured ? visibleItems.filter((c) => c !== featured) : visibleItems;
  const tileWidth = Math.floor((contentWidth - GUTTER * 2 - GRID_GAP) / 2);

  const typeOptions: FilterChipOption<TypeFilter>[] = [
    { key: "all", label: "All" },
    { key: "blog", label: "Articles", icon: "document-text-outline" },
    { key: "reel", label: "Videos", icon: "play-circle-outline" },
  ];
  if (bookmarkedIds.size > 0 || showBookmarksOnly) {
    typeOptions.push({ key: "saved", label: "Saved", icon: "bookmark-outline" });
  }

  const categoryKeys =
    selectedCategory !== "all" && !seenCategories.includes(selectedCategory)
      ? [...seenCategories, selectedCategory]
      : seenCategories;
  const showCategories = !showBookmarksOnly && selectedType !== "reel" && categoryKeys.length >= 2;
  const categoryOptions: FilterChipOption<"all" | BlogCategory>[] = [
    { key: "all", label: "All topics" },
    ...categoryKeys.map((key) => ({ key, label: categoryLabel(key) ?? key })),
  ];

  function itemMeta(item: ContentItem, withAuthor = false) {
    if (item.type === "reel") return item.author ? `Video · ${item.author}` : "Video";
    return withAuthor && item.author ? `${item.author} · ${item.time}` : item.time;
  }

  function renderTile(item: ContentItem, isFeatured = false) {
    const isBlog = item.type === "blog";
    return (
      <MediaTile
        title={item.title}
        imageUrl={item.imageUrl}
        eyebrow={isBlog ? categoryLabel(item.category) ?? "Article" : "Video"}
        meta={itemMeta(item, isFeatured)}
        summary={isFeatured ? item.summary : undefined}
        tone={toneFor(item, colors)}
        isVideo={!isBlog}
        duration={isBlog ? null : videoDuration(item.time)}
        saved={isBlog ? bookmarkedIds.has(item.id) : undefined}
        onToggleSave={isBlog ? () => handleToggleBookmark(item.id) : undefined}
        onPress={() => handleOpenItem(item)}
        featured={isFeatured}
        width={isFeatured ? undefined : tileWidth}
      />
    );
  }

  const listLoading = showBookmarksOnly ? loadingBookmarks && bookmarkedContent.length === 0 : loadingFeed && content.length === 0;
  const listError = showBookmarksOnly
    ? bookmarkedContent.length === 0 ? bookmarksError : null
    : content.length === 0 ? feedError : null;

  const emptyNode = (
    <View style={{ paddingTop: 8 }}>
      <LoadingErrorState
        loading={listLoading}
        error={listError}
        offline={!showBookmarksOnly && feedOffline}
        onRetry={() => (showBookmarksOnly ? loadBookmarks() : loadFeed(true))}
        errorTitle="Couldn't load articles"
        skeleton={<SkeletonMediaGrid count={6} />}
      >
        {showBookmarksOnly ? (
          <EmptyState
            compact
            icon="bookmark-outline"
            title={trimmedQuery ? "No saved articles match" : "No saved articles yet"}
            message={trimmedQuery ? "Try another word." : "Tap the bookmark on any article to keep it here."}
            actionLabel="Browse all"
            onAction={handleBrowseAll}
          />
        ) : (
          <EmptyState
            compact
            icon="text-box-search-outline"
            title={trimmedQuery ? `No results for "${query.trim()}"` : "Nothing here yet"}
            message={trimmedQuery ? "Try another word, or browse everything." : "New articles and videos are added often. Check back soon."}
            actionLabel="Browse all"
            onAction={handleBrowseAll}
          />
        )}
      </LoadingErrorState>
    </View>
  );

  const listHeader = (
    <View>
      <View style={{ paddingHorizontal: GUTTER, paddingTop: 8 }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search articles and videos" />
      </View>

      <FilterChips
        options={typeOptions}
        value={showBookmarksOnly ? "saved" : selectedType}
        onChange={handleTypeChange}
        gutter={GUTTER}
        style={{ marginTop: 14, flexGrow: 0 }}
      />

      {showCategories ? (
        <FilterChips
          options={categoryOptions}
          value={selectedCategory}
          onChange={setSelectedCategory}
          gutter={GUTTER}
          style={{ marginTop: 10, flexGrow: 0 }}
        />
      ) : null}

      {showingCached && !showBookmarksOnly && content.length > 0 ? (
        <View
          className="flex-row items-center"
          style={{
            gap: 8,
            marginTop: 16,
            marginHorizontal: GUTTER,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 14,
            backgroundColor: colors.surfaceSoft,
          }}
        >
          <Icon set="ion" name="cloud-offline-outline" size={16} color={colors.mutedText} />
          <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 18, fontFamily: fonts.body }}>
            Showing articles from your last visit. Pull down to refresh.
          </Text>
        </View>
      ) : null}

      {featured ? <View style={{ marginTop: 24, marginHorizontal: GUTTER }}>{renderTile(featured, true)}</View> : null}

      <View style={{ height: featured && gridItems.length > 0 ? 16 : 24 }} />
    </View>
  );

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScreenHeader title="Articles" subtitle="Reads and short videos on your health" />

        <FlatList
          data={gridItems}
          keyExtractor={(item) => `${item.type}:${item.id}`}
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: GUTTER, gap: GRID_GAP }}
          renderItem={({ item, index }) => (
            <Animated.View entering={index < 8 ? listEntering(index) : undefined} style={{ marginBottom: GRID_GAP }}>
              {renderTile(item)}
            </Animated.View>
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={visibleItems.length === 0 ? emptyNode : null}
          ListFooterComponent={
            !showBookmarksOnly && visibleItems.length > 0 ? (
              <LoadMoreButton
                hasMore={hasMore}
                loading={loadingMore}
                onPress={handleLoadMore}
                label={loadMoreFailed ? "Couldn't load more. Try again" : "Show more"}
              />
            ) : null
          }
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        />

        {/* Article reader. Android ignores presentationStyle="pageSheet" and
            renders this Modal fullscreen under the status bar, so the
            SafeAreaView (not a plain View) keeps the reader on screen. */}
        <Modal
          visible={previewVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleClosePreview}
        >
          {selectedItem && (
            <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
              <ArticleReader
                title={translated?.title || selectedItem.title}
                author={fullBlog?.author || selectedItem.author}
                readTime={
                  fullBlog?.readTimeMinutes
                    ? formatReadTime(fullBlog.readTimeMinutes, fullBlog.averageReadSeconds)
                    : selectedItem.time
                }
                publishedAt={fullBlog?.publishedAt ?? selectedItem.publishedAt}
                updatedAt={(fullBlog as (Blog & { updatedAt?: string }) | null)?.updatedAt}
                imageUrl={fullBlog?.coverImageUrl || selectedItem.imageUrl}
                categoryLabel={categoryLabel(fullBlog?.category ?? selectedItem.category)}
                tone={toneFor({ type: "blog", category: fullBlog?.category ?? selectedItem.category }, colors)}
                review={fullBlog}
                content={translated?.content ?? fullBlog?.content}
                summary={selectedItem.summary}
                loading={articleLoading}
                onClose={handleClosePreview}
                saved={bookmarkedIds.has(selectedItem.id)}
                onToggleSave={() => handleToggleBookmark(selectedItem.id)}
                onShare={() => handleShareContent(selectedItem)}
                listening={isPlayingAudio}
                preparingAudio={isSynthesizing}
                onListen={handleListen}
                languages={languages}
                language={language}
                onSelectLanguage={handleSelectLanguage}
                translating={translating}
                translated={Boolean(translated) && language !== "en-IN"}
                scrollProps={{
                  scrollEventThrottle: 250,
                  onTouchStart: () => readTimerRef.current?.activity(),
                  onLayout: (e) => {
                    articleHeightRef.current = e.nativeEvent.layout.height;
                  },
                  onContentSizeChange: (_w, h) => {
                    // A short article that fits on screen is read in full.
                    if (h > 0 && articleHeightRef.current >= h) readTimerRef.current?.setDepth(1);
                  },
                  onScroll: (e) => {
                    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                    const timer = readTimerRef.current;
                    if (!timer) return;
                    timer.activity();
                    if (contentSize.height > 0) timer.setDepth((contentOffset.y + layoutMeasurement.height) / contentSize.height);
                  },
                }}
              />
            </SafeAreaView>
          )}
          {/* Alerts raised while the reader is open draw above it. */}
          {previewVisible ? <AppModalHost inline /> : null}
        </Modal>
      </SafeAreaView>
    </>
  );
}
