import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const GENZ_MODE_STORAGE_KEY = "period-buddy.genz-mode";

// Purely cosmetic label swaps — Gen Z Mode never changes behavior, routes,
// or stored data, only UI strings. Keyed by the exact "normal" label so
// `genZLabel()` is a simple lookup; add new pairs here rather than
// hardcoding slang inline at each call site. Each phrase is picked to stay
// instantly readable (no obscure/inside-joke slang) while still reading as
// current, viral-coded Gen Z internet voice — a real feature name is never
// more than a couple of words away from the slang version.
const GENZ_LABELS: Record<string, string> = {
  // Tab bar — kept short on purpose (single-line, ~10px, no wrap room)
  Home: "The Spot",
  Tracker: "The Flow",
  Community: "The Tea",
  Profile: "My Fit",

  // Home screen — quick actions
  "Quick actions": "Quick Moves",
  "Log period": "Spill It 🩸",
  Symptoms: "Not Vibing?",
  Mood: "Vibe Check",

  // Home screen — sections
  Insights: "Big Brain Energy 🧠",
  "See all": "See It All, No Cap",
  "More for you": "More Fye Stuff ✨",
  Streak: "W Streak 🔥",

  // Hub cards (Home → "More for you" + each hub's own header)
  "Care & Insights": "Self-Care Era 💅",
  "Wellness & Support": "Bestie Support 🫶",
  Explore: "Go Explore, Fr",

  // Care & Insights hub
  Predictions: "Crystal Ball Energy 🔮",
  "Daily Insights": "Your Daily Tea",
  "Symptom Trends": "Pattern Check",
  "Symptom Checker": "What's the Vibe?",
  "Graphs & Reports": "The Receipts 🧾",
  Documents: "The Files, Bestie",

  // Wellness & Support hub
  "Nura AI": "Ask Bestie AI 🤖",
  "Health Concerns": "Real Talk Health",
  "Hygiene & Care": "Clean Girl Care 🧼",
  "Sexual Wellbeing": "The Down Low 🤫",
  "Check-in Call": "Ring Ring, Bestie 📞",

  // Explore hub
  Forest: "Grow Your Glow 🌱",
  Blogs: "The Read 📖",
  Videos: "The Watch List 🎬",
  "Partner Sync": "Bae Sync 💑",
  Habits: "Daily W's ✅",
  "Nominate Buddy": "Tag a Bestie 🫂",
  "Govt. Schemes": "Free Money, Fr 💸",
};

type GenZModeContextValue = {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
};

const GenZModeContext = createContext<GenZModeContextValue | undefined>(undefined);

export function GenZModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(GENZ_MODE_STORAGE_KEY)
      .then((stored) => {
        if (isMounted && stored === "true") setEnabledState(true);
      })
      .finally(() => {
        if (isMounted) setHasHydrated(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    AsyncStorage.setItem(GENZ_MODE_STORAGE_KEY, String(enabled)).catch(() => {
      // Toggle still works in memory if storage is unavailable.
    });
  }, [hasHydrated, enabled]);

  const value = useMemo<GenZModeContextValue>(
    () => ({ enabled, setEnabled: setEnabledState }),
    [enabled],
  );

  return <GenZModeContext.Provider value={value}>{children}</GenZModeContext.Provider>;
}

export function useGenZMode() {
  const value = useContext(GenZModeContext);
  if (!value) {
    throw new Error("useGenZMode must be used inside GenZModeProvider");
  }
  return value;
}

/** Returns `normal` as-is, or its Gen Z slang swap when the mode is on and a
 * mapping exists for it — call sites don't need their own on/off branching. */
export function useGenZLabel(normal: string): string {
  const { enabled } = useGenZMode();
  return genZLabel(normal, enabled);
}

/** Non-hook variant of the above, for call sites that already have `enabled`
 * from `useGenZMode()` (e.g. mapping over a static list, where calling a
 * hook per-item would break the rules of hooks). */
export function genZLabel(normal: string, enabled: boolean): string {
  return enabled ? (GENZ_LABELS[normal] ?? normal) : normal;
}
