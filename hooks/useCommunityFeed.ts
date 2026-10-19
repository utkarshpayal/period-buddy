import { useCallback, useEffect, useRef, useState } from "react";
import { mapCommunityPost } from "../components/community/mapCommunityPost";
import type { Post } from "../components/community/types";
import { communityApi, hasMorePages, type CommunityPost } from "../lib/api";

const POSTS_PAGE_SIZE = 20;

export type CommunityFeedFilters = {
  category: string | null;
  tag: string | null;
  search: string;
};

function likedIds(posts: CommunityPost[]) {
  return posts.filter((post) => post.likedByMe).map((post) => post.id ?? post._id);
}

/**
 * The community feed: page 1 on mount and whenever a filter changes,
 * infinite scroll after that.
 *
 * Every request is tagged with a sequence number and only the newest may
 * write, so switching PCOS → Fitness quickly can't paint PCOS posts, and a
 * page-2 request still in flight from the old filter can't append into the
 * new list. A failed page 2 sets `loadMoreFailed` (shown with a retry)
 * instead of ending the feed for good.
 */
export function useCommunityFeed(filters: CommunityFeedFilters) {
  const { category, tag, search } = filters;
  const [posts, setPosts] = useState<Post[]>([]);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const pageRef = useRef(1);
  const seqRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    (page: number) =>
      communityApi.getPosts({
        limit: POSTS_PAGE_SIZE,
        page,
        category: category ?? undefined,
        tag: tag ?? undefined,
        search: search.trim() || undefined,
      }),
    [category, tag, search],
  );

  // Loads the first page, replacing the list. `silent` skips the full-screen
  // skeleton (pull-to-refresh shows its own indicator).
  const reload = useCallback(
    async (silent = false) => {
      const seq = ++seqRef.current;
      if (!silent) setIsLoading(true);
      setError(null);
      setLoadMoreFailed(false);
      try {
        const response = await fetchPage(1);
        if (seq !== seqRef.current) return true;
        pageRef.current = 1;
        setPosts(response.posts.map(mapCommunityPost));
        setHasMore(
          response.pagination
            ? hasMorePages(response.pagination)
            : response.posts.length >= POSTS_PAGE_SIZE,
        );
        setLikedPostIds(new Set(likedIds(response.posts)));
        return true;
      } catch {
        if (seq !== seqRef.current) return true;
        // A failed pull-to-refresh keeps the posts already on screen (the
        // caller tells the user); only a first load swaps in the error state.
        if (silent) return false;
        setPosts([]);
        setLikedPostIds(new Set());
        setHasMore(false);
        setError("Couldn't load anonymous posts.");
        return false;
      } finally {
        if (seq === seqRef.current) setIsLoading(false);
      }
    },
    [fetchPage],
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || isLoading || !hasMore || error) return;
    const seq = seqRef.current;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    const nextPage = pageRef.current + 1;
    try {
      const response = await fetchPage(nextPage);
      if (seq !== seqRef.current) return;
      const mapped = response.posts.map(mapCommunityPost);
      pageRef.current = nextPage;
      setHasMore(
        response.pagination ? hasMorePages(response.pagination) : mapped.length >= POSTS_PAGE_SIZE,
      );
      setPosts((current) => {
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...mapped.filter((p) => !seen.has(p.id))];
      });
      setLikedPostIds((current) => {
        const next = new Set(current);
        likedIds(response.posts).forEach((id) => next.add(id));
        return next;
      });
    } catch {
      if (seq === seqRef.current) setLoadMoreFailed(true);
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [fetchPage, isLoading, hasMore, error]);

  /** Pull-to-refresh. Resolves false when it failed (the list is kept). */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      return await reload(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    posts,
    setPosts,
    likedPostIds,
    setLikedPostIds,
    isLoading,
    error,
    isRefreshing,
    isLoadingMore,
    hasMore,
    loadMoreFailed,
    loadMore,
    reload,
    refresh,
  };
}
