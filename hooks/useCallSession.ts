import { useCallback, useEffect, useRef } from "react";
import type { VideoJoin } from "../lib/api";
import { peerMessageCount, type CallChat, type CallState } from "../lib/jitsiCall";

// After a hang-up, Jitsi normally sends readyToClose; if the page is gone it
// never does, so the screen closes itself after this long.
const LEAVE_FALLBACK_MS = 1500;

/**
 * The call lifecycle shared by components/JitsiCall.tsx and its .web.tsx
 * twin: attendance reports, finishing once, ending when the session ends
 * elsewhere, turning a fatal failure into a Rejoin state, and the in-call
 * chat's unread badge. The platform file owns how it talks to Jitsi
 * (WebView commands vs. the IFrame API) and passes that in as callbacks.
 */
export function useCallSession({
  fetchJoin,
  onAttendance,
  onClose,
  endedMessage,
  call,
  chat,
  chatOpen,
  release,
  onEnded,
  onFailure,
}: {
  fetchJoin: () => Promise<VideoJoin>;
  onAttendance?: (event: "joined" | "left") => void;
  onClose: () => void;
  endedMessage?: string | null;
  call: CallState;
  chat?: CallChat;
  chatOpen: boolean;
  /** Tears down the platform's call (web disposes the IFrame API). */
  release?: () => void;
  /** The session ended elsewhere: hang up and show `message` (no Rejoin). */
  onEnded: (message: string) => void;
  /** A fatal failure while not leaving: show `message` with Rejoin. */
  onFailure: (message: string) => void;
}) {
  const leavingRef = useRef(false);
  const joinedRef = useRef(false);
  const closedRef = useRef(false);
  // Set once the session ended elsewhere: a join still in flight must not reopen the call.
  const endedRef = useRef(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest callbacks without re-running effects on every parent render.
  const fetchJoinRef = useRef(fetchJoin);
  fetchJoinRef.current = fetchJoin;
  const attendanceRef = useRef(onAttendance);
  attendanceRef.current = onAttendance;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const releaseRef = useRef(release);
  releaseRef.current = release;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onFailureRef = useRef(onFailure);
  onFailureRef.current = onFailure;

  const markJoined = useCallback(() => {
    joinedRef.current = true;
    attendanceRef.current?.("joined");
  }, []);

  /** Reports "left" once per join (Rejoin reports "joined" again). */
  const reportLeft = useCallback(() => {
    if (joinedRef.current) attendanceRef.current?.("left");
    joinedRef.current = false;
  }, []);

  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
    reportLeft();
    releaseRef.current?.();
    onCloseRef.current();
  }, [reportLeft]);

  /** After a hang-up command: close once Jitsi confirms, or after the fallback. */
  const finishSoon = useCallback(() => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(finish, LEAVE_FALLBACK_MS);
  }, [finish]);

  // The parent can unmount the call without our Leave (e.g. the screen
  // closes): stop the fallback timer and still report that we left.
  useEffect(
    () => () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
      reportLeft();
    },
    [reportLeft],
  );

  useEffect(() => {
    if (!endedMessage) return;
    endedRef.current = true;
    leavingRef.current = true;
    reportLeft();
    onEndedRef.current(endedMessage);
  }, [endedMessage, reportLeft]);

  // A finished hang-up closes the screen; a fatal failure offers Rejoin.
  useEffect(() => {
    if (call.closed) finish();
  }, [call.closed, finish]);
  useEffect(() => {
    if (call.failure && !leavingRef.current) {
      reportLeft();
      onFailureRef.current(call.failure);
    }
  }, [call.failure, reportLeft]);

  // Peer messages already seen (counted while the panel is open): the rest are unread.
  const peerCount = chat ? peerMessageCount(chat.messages) : 0;
  const seenPeerCountRef = useRef(peerCount);
  if (chatOpen) seenPeerCountRef.current = peerCount;
  const unread = Math.max(0, peerCount - seenPeerCountRef.current);

  return { leavingRef, endedRef, fetchJoinRef, markJoined, finish, finishSoon, unread };
}
