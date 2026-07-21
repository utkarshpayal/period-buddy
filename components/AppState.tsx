import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { shareWithAppLink } from "../lib/share";

export type DayEntry = {
  energy?: "high" | "low" | "medium" | "steady";
  flow?: "heavy" | "light" | "medium" | "none" | "spotting";
  mood?:
    | "anxious"
    | "calm"
    | "emotional"
    | "energetic"
    | "happy"
    | "irritable"
    | "neutral"
    | "sad"
    | "tired";
  note: string;
  symptoms: string[];
  updatedAt: string;
  sleepHours?: number;
  waterIntake?: number;
  weight?: number;
  temperature?: number;
  stressLevel?: number;
  medication?: string[];
};

type AppStateType = {
  tokens: number;
  earnTokens: (amount: number) => void;
  savedPosts: Set<string>;
  savePost: (id: string) => void;
  toggleSavedPost: (id: string) => void;
  reportedPosts: Set<string>;
  reportPost: (id: string) => void;
  sharePost: (content: string) => Promise<void>;
  dayNotes: Record<string, string>;
  addDayNote: (dayKey: string, note: string) => void;
  dayEntries: Record<string, DayEntry>;
  saveDayEntry: (dayKey: string, entry: Omit<DayEntry, "updatedAt">) => void;
  trackedDays: number;
};

const AppStateContext = createContext<AppStateType | null>(null);
const APP_STATE_STORAGE_KEY = "period-buddy.app-state";

type BrowserStorage = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
};

type StoredAppState = {
  dayEntries?: Record<string, DayEntry>;
  dayNotes?: Record<string, string>;
  reportedPosts?: string[];
  savedPosts?: string[];
  tokens?: number;
};

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [initialState] = useState(readStoredAppState);
  const [tokens, setTokens] = useState<number>(initialState.tokens ?? 450);
  const [savedPosts, setSavedPosts] = useState<Set<string>>(
    () => new Set(initialState.savedPosts ?? []),
  );
  const [reportedPosts, setReportedPosts] = useState<Set<string>>(
    () => new Set(initialState.reportedPosts ?? []),
  );
  const [dayNotes, setDayNotes] = useState<Record<string, string>>(
    initialState.dayNotes ?? {},
  );
  const [dayEntries, setDayEntries] = useState<Record<string, DayEntry>>(
    initialState.dayEntries ?? {},
  );
  const trackedDays = useMemo(
    () =>
      Object.values(dayEntries).filter(
        (entry) => entry.note.trim() || entry.symptoms.length > 0,
      ).length,
    [dayEntries],
  );

  const earnTokens = useCallback((amount: number) => {
    setTokens((t) => t + amount);
  }, []);

  const savePost = useCallback((id: string) => {
    setSavedPosts((s) => new Set(Array.from(s).concat(id)));
  }, []);

  const toggleSavedPost = useCallback((id: string) => {
    setSavedPosts((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const reportPost = useCallback((id: string) => {
    setReportedPosts((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const sharePost = useCallback(async (content: string) => {
    try {
      await shareWithAppLink(content);
    } catch {
      // The caller keeps its current UI state if the native share sheet fails.
    }
  }, []);

  const addDayNote = useCallback((dayKey: string, note: string) => {
    setDayNotes((d) => ({ ...d, [dayKey]: note }));
  }, []);

  const saveDayEntry = useCallback(
    (dayKey: string, entry: Omit<DayEntry, "updatedAt">) => {
      setDayNotes((current) => ({ ...current, [dayKey]: entry.note }));
      setDayEntries((current) => ({
        ...current,
        [dayKey]: {
          ...entry,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [],
  );

  useEffect(() => {
    writeStoredAppState({
      dayEntries,
      dayNotes,
      reportedPosts: Array.from(reportedPosts),
      savedPosts: Array.from(savedPosts),
      tokens,
    });
  }, [dayEntries, dayNotes, reportedPosts, savedPosts, tokens]);

  return (
    <AppStateContext.Provider
      value={{
        tokens,
        earnTokens,
        savedPosts,
        savePost,
        toggleSavedPost,
        reportedPosts,
        reportPost,
        sharePost,
        dayNotes,
        addDayNote,
        dayEntries,
        saveDayEntry,
        trackedDays,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

function getStorage() {
  const globalWithStorage = globalThis as typeof globalThis & {
    localStorage?: BrowserStorage;
  };

  return globalWithStorage.localStorage;
}

function readStoredAppState(): StoredAppState {
  try {
    const rawState = getStorage()?.getItem(APP_STATE_STORAGE_KEY);

    if (!rawState) {
      return {};
    }

    const state = JSON.parse(rawState) as StoredAppState;

    return {
      dayEntries: state.dayEntries ?? {},
      dayNotes: state.dayNotes ?? {},
      reportedPosts: Array.isArray(state.reportedPosts)
        ? state.reportedPosts
        : [],
      savedPosts: Array.isArray(state.savedPosts) ? state.savedPosts : [],
      tokens: typeof state.tokens === "number" ? state.tokens : 450,
    };
  } catch {
    return {};
  }
}

function writeStoredAppState(state: StoredAppState) {
  try {
    getStorage()?.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local session state remains available when browser storage is blocked.
  }
}

export default AppStateProvider;
