import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  forestApi,
  getFriendlyErrorMessage,
  isNetworkError,
  type ForestGardenState,
  type GardenActionResult,
  type GardenActionType,
} from "../lib/api";
import { getDateKey } from "../lib/format";
import { haptics } from "../lib/haptics";

/** The garden decays hour by hour on the server; refetch this often while on screen. */
const REFRESH_MS = 5 * 60_000;

/**
 * The Wellness Forest care game (`/api/forest/garden`). Actions show at once
 * (optimistic) and the server's answer replaces them; a refused action rolls
 * back and reports why. `available` is false on a backend without the game.
 */
export function useGarden({
  active,
  onResult,
  onOfflineWater,
}: {
  active: boolean;
  onResult?: (r: GardenActionResult) => void;
  /** Watering while offline: hand it to the forest's offline queue instead of failing. */
  onOfflineWater?: () => void;
}) {
  const [garden, setGarden] = useState<ForestGardenState | null>(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState<GardenActionType | null>(null);
  const [feedback, setFeedback] = useState<{ id: number; text: string; xp: number; error?: boolean } | null>(null);
  const seq = useRef(0);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onOfflineWaterRef = useRef(onOfflineWater);
  onOfflineWaterRef.current = onOfflineWater;

  const say = useCallback((text: string, xp = 0, error = false) => setFeedback({ id: Date.now(), text, xp, error }), []);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await forestApi.getGarden(getDateKey(new Date()));
      if (mine === seq.current) setGarden(next);
      setAvailable(true);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "notFound") setAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [active, refresh]);

  const act = useCallback(
    async (type: GardenActionType, opts: { id?: number; seconds?: number } = {}) => {
      if (!garden) return;
      const before = garden;
      // Optimistic: the weed/bug/leaf goes at once.
      const optimistic: ForestGardenState = {
        ...garden,
        weeds: type === "weed" ? garden.weeds.filter((w) => w.id !== opts.id) : garden.weeds,
        pests: type === "shoo" ? garden.pests.filter((p) => p.id !== opts.id) : garden.pests,
        deadLeaves: type === "prune" ? garden.deadLeaves.filter((l) => l.id !== opts.id) : garden.deadLeaves,
        moisture: type === "water" ? Math.min(100, garden.moisture + (opts.seconds ?? 1) * 15) : garden.moisture,
      };
      const mine = ++seq.current;
      setGarden(optimistic);
      setBusy(type);
      try {
        const result = await forestApi.gardenAction({ type, ...opts, today: getDateKey(new Date()) });
        if (mine === seq.current) setGarden(result.garden);
        if (result.xp) haptics.success();
        else haptics.tap();
        say(result.message, result.xp);
        onResultRef.current?.(result);
      } catch (err) {
        if (type === "water" && isNetworkError(err) && onOfflineWaterRef.current) {
          // Keep the poured water on screen; the forest queues the day's watering.
          onOfflineWaterRef.current();
          return;
        }
        if (mine === seq.current) setGarden(before);
        haptics.error();
        say(getFriendlyErrorMessage(err), 0, true);
        // A target that's already gone: get the fresh state.
        refresh();
      } finally {
        setBusy(null);
      }
    },
    [garden, refresh, say],
  );

  return { garden, available, busy, act, refresh, feedback };
}
