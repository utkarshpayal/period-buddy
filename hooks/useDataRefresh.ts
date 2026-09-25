import { NavigationContext } from "@react-navigation/native";
import { useContext, useEffect, useRef } from "react";
import { subscribeDataChange, type DataTopic } from "../lib/data-sync";

export type DataRefreshContext = {
  /** True when the change landed while this screen was in front (e.g. a
   * PaywallModal purchase over it, or its own write); false when it's
   * catching up on focus after a change made on another screen. */
  whileFocused: boolean;
};

const FOCUSED_DEBOUNCE_MS = 300;

/**
 * Calls `onRefresh` whenever data in one of `topics` changes (see
 * lib/data-sync.ts): right away (debounced) if this screen is focused,
 * otherwise once the screen next gains focus — so a hidden tab or a screen
 * lower in the stack catches up when the user returns, without refetching
 * in the background on every change. `onRefresh` should refetch *silently*
 * (no full-screen loader / pull-to-refresh spinner) and keep existing data
 * on failure.
 *
 * Safe outside a navigator (treated as always focused).
 */
export function useDataRefresh(
  topics: DataTopic[],
  onRefresh: (ctx: DataRefreshContext) => void | Promise<unknown>,
) {
  const navigation = useContext(NavigationContext);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const focusedRef = useRef(navigation ? navigation.isFocused() : true);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicsKey = topics.join(",");

  useEffect(() => {
    if (!navigation) return;
    focusedRef.current = navigation.isFocused();
    const unsubFocus = navigation.addListener("focus", () => {
      focusedRef.current = true;
      if (dirtyRef.current) {
        dirtyRef.current = false;
        Promise.resolve(onRefreshRef.current({ whileFocused: false })).catch(() => {});
      }
    });
    const unsubBlur = navigation.addListener("blur", () => {
      focusedRef.current = false;
    });
    return () => {
      unsubFocus();
      unsubBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const wanted = topicsKey.split(",") as DataTopic[];
    const unsubscribe = subscribeDataChange((changed) => {
      if (!wanted.some((topic) => changed.has(topic))) return;
      if (!focusedRef.current) {
        dirtyRef.current = true;
        return;
      }
      // Coalesce bursts (e.g. one save emitting cycle + dashboard, or a
      // screen firing several writes in a row) into a single refetch.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        Promise.resolve(onRefreshRef.current({ whileFocused: true })).catch(() => {});
      }, FOCUSED_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [topicsKey]);
}
