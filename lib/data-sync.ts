/**
 * App-wide "this data changed" signal, so a screen that is still mounted but
 * not in front (every dashboard tab, and any screen lower in the stack) can
 * refetch instead of showing what it loaded when it first mounted.
 *
 * Emission is automatic: `apiEnvelopeRequest` (lib/api/client.ts) calls
 * `emitMutation()` after every successful non-GET request, and
 * `topicsForMutation()` below maps the endpoint to the topics it affects.
 * Consumers subscribe via `hooks/useDataRefresh.ts` (or `useAsyncLoad`'s
 * `refreshOn` option). When adding an endpoint that changes data another
 * screen displays, add it to MUTATION_TOPICS rather than wiring a manual
 * refetch between two screens.
 */

export type DataTopic =
  | "cycle" // day logs, cycle settings, predictions, insights, reports
  | "dashboard" // streak / wallet / tracked-days summary
  | "profile"
  | "habits"
  | "forest"
  | "subscription"
  | "partner"
  | "notifications"
  | "documents"
  | "schemeApplications"
  | "qaSessions"
  | "consultations"
  | "blogs"
  | "circles" // Bestie Circles (list, detail, vibes)
  | "support"; // Help & support tickets

type Listener = (topics: ReadonlySet<DataTopic>) => void;

const listeners = new Set<Listener>();

export function subscribeDataChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitDataChange(...topics: DataTopic[]) {
  if (topics.length === 0) return;
  const set = new Set(topics);
  listeners.forEach((listener) => {
    try {
      listener(set);
    } catch (err) {
      console.warn("data-sync listener failed:", err);
    }
  });
}

// First match wins, so more specific paths go before their prefixes. `null`
// marks non-GET endpoints that don't change anything another screen shows
// (auth handshakes, previews, view tracking, AI/speech calls, ...).
const MUTATION_TOPICS: [RegExp, DataTopic[] | null][] = [
  [/^\/api\/auth\/onboarding/, ["profile", "cycle", "dashboard"]],
  [/^\/api\/auth\/profile/, ["profile", "dashboard"]],
  [/^\/api\/(auth\/|logout)/, null],
  [/^\/api\/cycle\//, ["cycle", "dashboard"]],
  // "Not for me" only changes the Habits screen's own picks.
  [/^\/api\/habits\/suggestions\//, null],
  [/^\/api\/habits/, ["habits", "dashboard"]],
  [/^\/api\/forest\//, ["forest", "dashboard"]],
  [/^\/api\/consultation/, ["consultations"]],
  [/^\/api\/subscriptions\/coupons/, null],
  [/^\/api\/subscriptions\//, ["subscription"]],
  [/^\/api\/partner\/notifications/, ["notifications"]],
  // Chat messages already sync live over the partner WebSocket room.
  [/^\/api\/partner\/message/, null],
  [/^\/api\/partner\//, ["partner", "notifications"]],
  [/^\/api\/blogs\/[^/]+\/bookmark/, ["blogs"]],
  [/^\/api\/questions\/sessions/, ["qaSessions"]],
  [/^\/api\/documents\/[^/]+\/chat/, null],
  [/^\/api\/documents/, ["documents"]],
  [/^\/api\/scheme-applications/, ["schemeApplications"]],
  [/^\/api\/circles/, ["circles"]],
  [/^\/api\/support\//, ["support"]],
  // Following a creator / voting on a reel's poll earns wallet points.
  [/^\/api\/reels\/[^/]+\/(follow|vote)$/, ["dashboard"]],
  // Likes, saves, comments and views only show on the reels screen itself,
  // which updates them in place.
  [/^\/api\/reels\//, null],
  // These award wallet points; everything else they change updates in place.
  [/^\/api\/community\/[^/]+\/(poll\/vote|save)$/, ["dashboard"]],
  [/^\/api\/buddies\//, ["dashboard"]],
  [/^\/api\/wellbeing\/games\//, ["dashboard"]],
];

export function topicsForMutation(method: string, path: string): DataTopic[] {
  if (method.toUpperCase() === "GET") return [];
  const bare = path.split("?")[0];
  for (const [pattern, topics] of MUTATION_TOPICS) {
    if (pattern.test(bare)) return topics ?? [];
  }
  return [];
}

export function emitMutation(method: string, path: string) {
  emitDataChange(...topicsForMutation(method, path));
}
