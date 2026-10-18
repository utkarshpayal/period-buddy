/**
 * Active reading time for an article (pure, unit-tested). Time counts only
 * while the article is open, the app is in front and the reader has done
 * something (scroll, touch, listening) within the last `idleMs`; after that
 * the clock stops at the last sign of life plus the idle window, so a phone
 * put down on the article adds at most one idle window.
 *
 * `take()` hands back the seconds not yet reported and whether this part
 * continues an earlier one, so a session can be sent in parts (on going to
 * the background, then on close) without counting two reads. Completion is
 * reported once per session, the first time the end is reached.
 * The backend side is period-buddy-be's utils/blogReadStats.js.
 */
export type ReadReport = { durationSeconds: number; continued: boolean; completed: boolean };

export const READ_IDLE_MS = 60_000;
/** Scrolled this far through the article counts as finishing it. */
export const READ_COMPLETE_DEPTH = 0.9;

export function createReadTimer(now: () => number = Date.now, idleMs = READ_IDLE_MS) {
  let running = false;
  let lastSeen = 0; // last sign of activity while running
  let countedTo = 0; // time already added to `activeMs`
  let activeMs = 0; // counted but not yet reported
  let sentAny = false;
  let completed = false;
  let completionReported = false;

  /** Adds active time up to `t`, never past the idle window after `lastSeen`. */
  const settle = (t: number) => {
    if (!running) return;
    const until = Math.min(t, lastSeen + idleMs);
    if (until > countedTo) activeMs += until - countedTo;
    countedTo = Math.max(countedTo, until);
  };

  return {
    /** The article is on screen (opened, or the app came back to the front). */
    start() {
      const t = now();
      if (running) settle(t);
      running = true;
      lastSeen = t;
      countedTo = t;
    },
    /** Scroll, touch or audio playing: the reader is still here. */
    activity() {
      if (!running) return;
      const t = now();
      settle(t);
      lastSeen = t;
      countedTo = t;
    },
    /** App went to the background or the article closed. */
    pause() {
      settle(now());
      running = false;
    },
    /** How far through the article the reader has scrolled (0–1). */
    setDepth(depth: number) {
      if (depth >= READ_COMPLETE_DEPTH) completed = true;
    },
    /** The unreported part of this session, then resets the count. */
    take(): ReadReport {
      settle(now());
      const report: ReadReport = {
        durationSeconds: Math.round(activeMs / 1000),
        continued: sentAny,
        completed: completed && !completionReported,
      };
      activeMs = 0;
      if (report.durationSeconds > 0 || report.completed) sentAny = true;
      if (report.completed) completionReported = true;
      return report;
    },
  };
}

/** "3 min 20 s" / "45 s" for an average read time in seconds. */
export function formatReadDuration(seconds?: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}
