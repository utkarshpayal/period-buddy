import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError, consultationApi, getFriendlyErrorMessage, getWebSocketUrl, type Consultation } from "../lib/api";
import { dedupeMessages, isLive, mergeServerLog, type ChatMessage } from "../lib/consultationModel";

export type SocketState = "connecting" | "connected" | "reconnecting";

/**
 * The consultation screen's chat: which consultation is open, its messages,
 * sending with retry, and the live room socket. The room stays joined while
 * the chat sheet is open or a video call on the same consultation is
 * (`callId`), and only while the session is paid/active (the server refuses
 * the room otherwise).
 *
 * `consultations` is the screen's latest /my list, so the open chat's header
 * and prescription follow it; `loadConsultations` refetches that list.
 */
export function useConsultationChat({
  consultations,
  loadConsultations,
  callId,
}: {
  consultations: Consultation[];
  loadConsultations: () => Promise<Consultation[] | null>;
  callId: string | null;
}) {
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeConsultation?._id ?? null;
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Set when the room tells us the session ended/was cancelled (or a send
  // got 403), so the input closes even before the refetch lands.
  const [chatEnded, setChatEnded] = useState(false);
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  const [sending, setSending] = useState(false);
  // State lags a frame: a double tap would pass a `sending` check twice.
  const sendingRef = useRef(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const activeId = activeConsultation?._id ?? null;
  const chatLive = Boolean(activeConsultation && isLive(activeConsultation) && !chatEnded);
  const chatInCall = Boolean(callId && callId === activeId);

  // Status or prescription changes arrive with any /my refetch.
  useEffect(() => {
    setActiveConsultation((current) => {
      if (!current) return current;
      return consultations.find((c) => c._id === current._id) ?? current;
    });
  }, [consultations]);

  /** Refetch /my and reopen the input if the open consultation is still live. */
  const refreshActiveConsultation = useCallback(async () => {
    const id = activeIdRef.current;
    const list = await loadConsultations();
    const fresh = list?.find((c) => c._id === id);
    if (fresh && activeIdRef.current === id && isLive(fresh)) setChatEnded(false);
  }, [loadConsultations]);

  const refetchMessages = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    try {
      const latest = await consultationApi.getMessages(id);
      if (activeIdRef.current === id) {
        setMessages((prev) => mergeServerLog(prev, latest));
        setMessagesError(null);
      }
    } catch {
      // Keep what's on screen; the next reconnect/foreground tries again.
    }
  }, []);

  const retryLoadMessages = useCallback(() => {
    const id = activeIdRef.current;
    setLoadingMessages(true);
    refetchMessages().finally(() => {
      if (activeIdRef.current === id) setLoadingMessages(false);
    });
  }, [refetchMessages]);

  /** Loads `consultation`'s chat; `show: false` keeps the chat sheet closed (a video call shows it instead). */
  const openChat = useCallback(async (consultation: Consultation, { show = true }: { show?: boolean } = {}) => {
    const id = consultation._id;
    activeIdRef.current = id;
    setActiveConsultation(consultation);
    setChatEnded(false);
    setMessages([]);
    setMessagesError(null);
    if (show) setChatOpen(true);
    setLoadingMessages(true);
    try {
      const list = await consultationApi.getMessages(id);
      if (activeIdRef.current === id) setMessages(dedupeMessages(list));
    } catch (err) {
      if (activeIdRef.current === id) setMessagesError(getFriendlyErrorMessage(err));
    } finally {
      // A quick switch to another chat keeps that one's skeleton.
      if (activeIdRef.current === id) setLoadingMessages(false);
    }
  }, []);

  const closeChat = useCallback(() => setChatOpen(false), []);

  // A video call shows its consultation's chat in a panel: load it (without
  // opening the chat sheet) when the call is for a different consultation.
  useEffect(() => {
    if (!callId || activeIdRef.current === callId) return;
    const target = consultations.find((c) => c._id === callId);
    if (target) openChat(target, { show: false });
  }, [callId, consultations, openChat]);

  /** Sends `raw`; false when nothing was sent (empty, already sending, chat closed). */
  const sendMessage = useCallback(
    (raw: string): boolean => {
      const text = raw.trim();
      const consultation = activeConsultation;
      if (!text || !consultation || sendingRef.current || !chatLive) return false;
      const id = consultation._id;
      sendingRef.current = true;
      setSending(true);

      const localId = `${Date.now()}-${Math.random()}`;
      const optimistic: ChatMessage = { sender: "user", text, sentAt: new Date().toISOString(), localId };
      setMessages((prev) => [...prev, optimistic]);

      (async () => {
        try {
          // sendMessage returns the full authoritative log — replace (deduped)
          // rather than append, so the optimistic message isn't shown twice.
          const latest = await consultationApi.sendMessage(id, text);
          // The user may have switched chats (or a call opened another) meanwhile.
          if (activeIdRef.current === id) {
            setMessages((prev) => mergeServerLog(prev.filter((m) => m.localId !== localId), latest));
          }
        } catch (err) {
          if (activeIdRef.current !== id) return;
          // Keep the bubble, marked failed with a retry.
          setMessages((prev) => prev.map((m) => (m.localId === localId ? { ...m, failed: true } : m)));
          if (err instanceof ApiError && err.status === 403) {
            // The session ended (or was cancelled) meanwhile.
            setChatEnded(true);
            refreshActiveConsultation();
          }
        } finally {
          sendingRef.current = false;
          setSending(false);
        }
      })();
      return true;
    },
    [activeConsultation, chatLive, refreshActiveConsultation],
  );

  const retryMessage = useCallback(
    (msg: ChatMessage) => {
      if (sendingRef.current || !chatLive) return;
      setMessages((prev) => prev.filter((m) => m.localId !== msg.localId));
      sendMessage(msg.text);
    },
    [chatLive, sendMessage],
  );

  // Live chat over the consultation room. Reconnects with backoff, re-joins
  // the room and refetches the log after a drop or when the app comes back
  // to the foreground.
  useEffect(() => {
    if ((!chatOpen && !chatInCall) || !activeId || !chatLive) return;
    const room = `consultation_${activeId}`;
    let closed = false;
    let denied = false;
    let attempts = 0;
    let joinedOnce = false;
    // True while connect() awaits the URL, before a socket exists: the
    // foreground handler must not start a second one then.
    let connecting = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    setSocketState("connecting");

    const scheduleReconnect = () => {
      if (closed || denied) return;
      setSocketState("reconnecting");
      // Capped exponential backoff with jitter (same shape as useRealtimeSocket).
      const base = Math.min(30000, 1000 * 2 ** attempts);
      attempts += 1;
      timer = setTimeout(connect, base / 2 + Math.random() * (base / 2));
    };

    const handleRoomEvent = (event: string) => {
      if (event === "consultation_cancelled" || event === "consultation_completed") {
        setChatEnded(true);
        refreshActiveConsultation();
      } else if (event === "prescription_updated") {
        refreshActiveConsultation();
      }
    };

    async function connect() {
      timer = null;
      connecting = true;
      let wsUrl: string;
      try {
        wsUrl = await getWebSocketUrl();
      } catch {
        connecting = false;
        scheduleReconnect();
        return;
      }
      connecting = false;
      if (closed) return;
      const ws = new WebSocket(wsUrl);
      socket = ws;

      ws.onopen = () => {
        if (closed || socket !== ws) return;
        ws.send(JSON.stringify({ type: "join", room }));
      };

      ws.onmessage = (event) => {
        if (closed || socket !== ws) return;
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
          return;
        }
        if (!data || data.room !== room) return;
        if (data.type === "joined") {
          attempts = 0;
          setSocketState("connected");
          // Anything sent while we were away arrives in the refetched log.
          if (joinedOnce) refetchMessages();
          joinedOnce = true;
        } else if (data.type === "error") {
          // Room refused: the session isn't paid/active any more.
          denied = true;
          setChatEnded(true);
          refreshActiveConsultation();
        } else if (data.type === "message") {
          if (Array.isArray(data.messages)) setMessages((prev) => mergeServerLog(prev, data.messages));
          if (typeof data.event === "string") handleRoomEvent(data.event);
        }
        // "left" is our own leave acknowledgement.
      };

      ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };

      ws.onclose = () => {
        // Only the current socket's drop reconnects; an old one closing is expected.
        if (socket !== ws) return;
        socket = null;
        scheduleReconnect();
      };
    }

    connect();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || closed) return;
      refetchMessages();
      refreshActiveConsultation();
      if (!socket && !connecting && !denied) {
        if (timer) clearTimeout(timer);
        attempts = 0;
        connect();
      }
    });

    return () => {
      closed = true;
      appStateSub.remove();
      if (timer) clearTimeout(timer);
      const ws = socket;
      socket = null;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "leave", room }));
        } catch {}
        ws.close();
      }
    };
  }, [chatOpen, chatInCall, activeId, chatLive, refetchMessages, refreshActiveConsultation]);

  return {
    activeConsultation,
    activeIdRef,
    chatOpen,
    chatLive,
    chatEnded,
    socketState,
    messages,
    sending,
    loadingMessages,
    messagesError,
    openChat,
    closeChat,
    sendMessage,
    retryMessage,
    retryLoadMessages,
    refreshActiveConsultation,
    setChatEnded,
  };
}
