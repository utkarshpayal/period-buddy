/**
 * Chat-thread reconciliation shared by the partner chats (owner's Partner
 * screen, partner-view Chat tab) and the buddy chat (lib/buddyChat.ts).
 *
 * A message the user just typed is shown at once as a local copy
 * (`status: "sending"`), then swapped for the server's copy when either the
 * POST response or the realtime echo arrives, whichever is first. A send
 * that fails stays in the thread as `status: "failed"` so the user can see
 * it never left and retry it, instead of a bubble that looks delivered.
 *
 * No React in here: unit-tested in lib/__tests__/partnerChat.test.ts.
 */
import type { PartnerMessage, PartnerProfile } from "./api";

export type SendStatus = "sending" | "failed";

/** Fields every chat message shape here has. */
export type ChatLike = {
  sender: string;
  text: string;
  sentAt?: string;
  /** Only on a local copy that the server hasn't confirmed yet. */
  localId?: string;
  status?: SendStatus;
};

export type LocalPartnerMessage = PartnerMessage & Pick<ChatLike, "localId" | "status">;

/** How far before a local copy's own timestamp a server copy can be and still be "the same message". */
const MATCH_WINDOW_MS = 60_000;

let localSeq = 0;
export function makeLocalId(): string {
  localSeq += 1;
  return `local_${Date.now().toString(36)}_${localSeq}`;
}

function time(value?: string): number {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function isSameMessage<T extends ChatLike>(local: T, server: T): boolean {
  if (local.sender !== server.sender || local.text !== server.text) return false;
  // Legacy rows without a timestamp: sender + text is all there is.
  if (!local.sentAt || !server.sentAt) return true;
  return time(server.sentAt) >= time(local.sentAt) - MATCH_WINDOW_MS;
}

/**
 * Folds one server message into the thread: already there (same id) → no
 * change; otherwise it replaces the oldest unconfirmed local copy with the
 * same sender and text, or is appended. Returns `prev` itself when nothing
 * changed, so a duplicate echo doesn't re-render the thread.
 */
export function reconcileIncoming<T extends ChatLike>(prev: T[], incoming: T, idOf: (message: T) => string | undefined): T[] {
  const id = idOf(incoming);
  if (id && prev.some((message) => !message.localId && idOf(message) === id)) return prev;
  const localIndex = prev.findIndex((message) => message.localId && isSameMessage(message, incoming));
  if (localIndex >= 0) {
    const next = [...prev];
    next[localIndex] = incoming;
    return next;
  }
  return [...prev, incoming];
}

/**
 * A full fetch replaces the thread, except for local copies the fetch
 * doesn't contain yet (still sending, or failed): those stay at the end so a
 * refresh never silently drops a message the user is waiting on.
 */
export function mergeFetched<T extends ChatLike>(prev: T[], fetched: T[]): T[] {
  const unmatched = [...fetched];
  const pending = prev.filter((message) => {
    if (!message.localId) return false;
    const index = unmatched.findIndex((server) => isSameMessage(message, server));
    if (index < 0) return true;
    // The server already has it: drop the local copy, and don't let one
    // server row also absorb a second identical local copy.
    unmatched.splice(index, 1);
    return false;
  });
  return pending.length > 0 ? [...fetched, ...pending] : fetched;
}

/** Swaps the local copy for the server's (send succeeded). No-op if an echo already did. */
export function confirmLocal<T extends ChatLike>(prev: T[], localId: string, confirmed: T | null, idOf: (message: T) => string | undefined): T[] {
  const index = prev.findIndex((message) => message.localId === localId);
  if (index < 0) return prev;
  const next = [...prev];
  if (!confirmed) {
    const { localId: _localId, status: _status, ...rest } = prev[index];
    next[index] = rest as T;
    return next;
  }
  const id = idOf(confirmed);
  // The realtime echo landed first and is already in the thread.
  if (id && prev.some((message) => !message.localId && idOf(message) === id)) {
    next.splice(index, 1);
    return next;
  }
  next[index] = confirmed;
  return next;
}

export function setLocalStatus<T extends ChatLike>(prev: T[], localId: string, status: SendStatus): T[] {
  const index = prev.findIndex((message) => message.localId === localId);
  if (index < 0 || prev[index].status === status) return prev;
  const next = [...prev];
  next[index] = { ...prev[index], status };
  return next;
}

export const partnerMessageId = (message: PartnerMessage) => message._id;

export function mergeIncomingMessage(prev: LocalPartnerMessage[], incoming: PartnerMessage): LocalPartnerMessage[] {
  return reconcileIncoming<LocalPartnerMessage>(prev, incoming, partnerMessageId);
}

/**
 * The other person's name from a partner profile, or null when it isn't
 * known (not connected, or the server sent only an id). Callers pick their
 * own fallback ("Your partner", "them", ...) instead of comparing against
 * one another's fallback text.
 */
export function partnerDisplayName(profile: Pick<PartnerProfile, "partnerId"> | null | undefined): string | null {
  const partner = profile?.partnerId;
  if (!partner || typeof partner !== "object") return null;
  const name = [partner.firstName, partner.lastName].filter(Boolean).join(" ").trim();
  return name || null;
}
