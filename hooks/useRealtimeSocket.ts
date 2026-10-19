import { useCallback, useEffect, useRef } from "react";
import { getWebSocketUrl } from "../lib/api";

export type RealtimeMessage = Record<string, any>;
type MessageHandler = (data: RealtimeMessage) => void;

type ConnectionHandler = (open: boolean) => void;

type SocketManager = {
  connecting: boolean;
  connectionListeners: Set<ConnectionHandler>;
  /** Bumped by `reopen`, so a URL lookup started for an older attempt is dropped. */
  generation: number;
  isDisconnected: boolean;
  listeners: Set<MessageHandler>;
  /** The URL (which carries the session token) the current socket was opened with. */
  openedUrl: string | null;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  roomRefCounts: Map<string, number>;
  socket: WebSocket | null;
};

// One physical WebSocket shared by every `useRealtimeSocket` caller across the
// app (dashboard notifications, community feed, partner chat, buddy chat,
// ...), instead of each screen opening its own duplicate connection to the
// same backend. Rooms are reference-counted so two consumers wanting the same
// room (e.g. the dashboard tab bar and the Community screen both wanting
// "community") share one underlying `join` and only `leave` once neither
// needs it anymore. Torn down completely once nothing is subscribed.
let manager: SocketManager | null = null;

function getManager(): SocketManager {
  if (!manager) {
    manager = {
      connecting: false,
      connectionListeners: new Set(),
      generation: 0,
      isDisconnected: false,
      listeners: new Set(),
      openedUrl: null,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      roomRefCounts: new Map(),
      socket: null,
    };
  }
  return manager;
}

// Nothing is queued while the socket is down: rooms are re-joined from
// `roomRefCounts` on every open, and a consumer's own payload (a presence ping,
// say) is worthless minutes later, so replaying it on reconnect only delivers
// stale signals. Returns whether the payload went out.
function sendRaw(m: SocketManager, payload: Record<string, unknown>): boolean {
  if (!m.socket || m.socket.readyState !== WebSocket.OPEN) return false;
  try {
    m.socket.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function notifyConnection(m: SocketManager, open: boolean) {
  m.connectionListeners.forEach((listener) => {
    try {
      listener(open);
    } catch (err) {
      console.error("Error in realtime WebSocket connection handler:", err);
    }
  });
}

function scheduleReconnect(m: SocketManager) {
  if (m.isDisconnected) return;
  // Capped exponential backoff with jitter — a fixed retry delay means every
  // client reconnects in lockstep after a server restart (thundering herd).
  const base = Math.min(30000, 1000 * 2 ** m.reconnectAttempts);
  m.reconnectAttempts += 1;
  const delay = base / 2 + Math.random() * (base / 2);
  m.reconnectTimeout = setTimeout(() => connect(m), delay);
}

function connect(m: SocketManager) {
  if (m.isDisconnected || m.connecting) return;
  if (m.socket && m.socket.readyState === WebSocket.OPEN) return;

  m.connecting = true;
  const generation = m.generation;

  getWebSocketUrl()
    .then((wsUrl) => {
      if (generation !== m.generation) return;
      if (m.isDisconnected) {
        m.connecting = false;
        return;
      }

      const socket = new WebSocket(wsUrl);
      m.socket = socket;
      m.openedUrl = wsUrl;

      // Every handler checks `m.socket === socket`: after an account switch
      // (`reconnectRealtimeSocket`) the old socket's late events must not
      // touch the new connection's state.
      socket.onopen = () => {
        if (m.isDisconnected || m.socket !== socket) return;
        m.connecting = false;
        m.reconnectAttempts = 0;
        if (__DEV__) console.log("Realtime WebSocket connected");

        for (const room of m.roomRefCounts.keys()) {
          sendRaw(m, { room, type: "join" });
        }
        notifyConnection(m, true);
      };

      socket.onmessage = (event) => {
        if (m.isDisconnected || m.socket !== socket) return;
        let data: RealtimeMessage;
        try {
          data = JSON.parse(event.data);
        } catch (err) {
          console.error("Error parsing realtime WebSocket message:", err);
          return;
        }
        // Each listener runs in isolation so one screen's handler throwing
        // doesn't stop the message from reaching every other subscriber.
        m.listeners.forEach((listener) => {
          try {
            listener(data);
          } catch (err) {
            console.error("Error in realtime WebSocket message handler:", err);
          }
        });
      };

      socket.onerror = (err) => {
        console.warn("Realtime WebSocket error:", err);
      };

      socket.onclose = () => {
        if (m.socket !== socket) return;
        m.connecting = false;
        m.socket = null;
        m.openedUrl = null;
        if (m.isDisconnected) return;
        notifyConnection(m, false);
        if (__DEV__) console.log("Realtime WebSocket closed, retrying with backoff…");
        scheduleReconnect(m);
      };
    })
    .catch((err) => {
      if (generation !== m.generation) return;
      m.connecting = false;
      console.warn("Failed to get WebSocket URL, retrying with backoff…", err);
      scheduleReconnect(m);
    });
}

/** Drops the current connection (without backoff) and opens a fresh one. */
function reopen(m: SocketManager) {
  if (m.reconnectTimeout) clearTimeout(m.reconnectTimeout);
  m.reconnectTimeout = null;
  const old = m.socket;
  m.generation += 1;
  m.socket = null;
  m.openedUrl = null;
  m.connecting = false;
  m.reconnectAttempts = 0;
  if (old) {
    old.close();
    notifyConnection(m, false);
  }
  connect(m);
}

/**
 * The socket authenticates once, with the token in its URL. When the session
 * token changes (sign-out → sign-in as someone else) while a consumer stays
 * mounted, the open socket would keep acting as the old account, so room
 * joins for the new one go out on it. Re-checks the URL and reopens if it
 * moved on. AuthProvider should call this right after `setSessionToken`;
 * every hook mount also runs it as a fallback.
 */
export async function reconnectRealtimeSocketIfAuthChanged(): Promise<void> {
  const m = manager;
  if (!m || m.isDisconnected || !m.openedUrl) return;
  const opened = m.openedUrl;
  let url: string;
  try {
    url = await getWebSocketUrl();
  } catch {
    return;
  }
  if (manager === m && m.openedUrl === opened && url !== opened) reopen(m);
}

function retainRoom(m: SocketManager, room: string) {
  const count = m.roomRefCounts.get(room) ?? 0;
  m.roomRefCounts.set(room, count + 1);
  if (count === 0) sendRaw(m, { room, type: "join" });
}

function releaseRoom(m: SocketManager, room: string) {
  const count = m.roomRefCounts.get(room) ?? 0;
  if (count <= 1) {
    m.roomRefCounts.delete(room);
    sendRaw(m, { room, type: "leave" });
  } else {
    m.roomRefCounts.set(room, count - 1);
  }
}

function teardownIfIdle(m: SocketManager) {
  if (m.listeners.size > 0 || m.roomRefCounts.size > 0 || m.connectionListeners.size > 0) return;

  m.isDisconnected = true;
  if (m.reconnectTimeout) clearTimeout(m.reconnectTimeout);
  m.reconnectTimeout = null;
  if (m.socket) {
    m.socket.close();
    m.socket = null;
  }
  m.openedUrl = null;
  if (manager === m) manager = null;
}

export type UseRealtimeSocketOptions = {
  /** When false, no connection/room is requested (e.g. tab not focused, no active room yet). */
  enabled?: boolean;
  /**
   * Invoked for every message on the shared socket — exactly like each
   * screen's previous standalone `socket.onmessage`. Since the connection is
   * now shared, filter by `data.room`/`data.type` as before; messages for
   * rooms this caller didn't ask for can still arrive if another consumer
   * shares the connection.
   */
  onMessage?: MessageHandler;
  /**
   * Called with `true` each time the shared socket (re)opens — after this
   * caller's rooms were re-joined — and right away if it's already open; with
   * `false` when it drops. Use it to refetch what was missed while offline,
   * or to stop trusting presence.
   */
  onConnectionChange?: ConnectionHandler;
  /** Rooms to join for as long as this hook is mounted with `enabled: true`. */
  rooms: string[];
};

export function useRealtimeSocket({ enabled = true, onMessage, onConnectionChange, rooms }: UseRealtimeSocketOptions) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  const roomsKey = rooms.join(",");

  useEffect(() => {
    if (!enabled || rooms.length === 0) return;

    const m = getManager();
    m.isDisconnected = false;

    const listener: MessageHandler = (data) => onMessageRef.current?.(data);
    const connectionListener: ConnectionHandler = (open) => onConnectionChangeRef.current?.(open);
    m.listeners.add(listener);
    m.connectionListeners.add(connectionListener);
    rooms.forEach((room) => retainRoom(m, room));
    if (m.socket?.readyState === WebSocket.OPEN) {
      connectionListener(true);
      reconnectRealtimeSocketIfAuthChanged();
    } else {
      connect(m);
    }

    return () => {
      m.listeners.delete(listener);
      m.connectionListeners.delete(connectionListener);
      rooms.forEach((room) => releaseRoom(m, room));
      teardownIfIdle(m);
    };
    // `rooms` is intentionally tracked via the joined `roomsKey` string so an
    // inline array literal from the caller doesn't re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomsKey]);

  /** Sends only over an open socket (nothing is queued); returns whether it went out. */
  const send = useCallback((payload: Record<string, unknown>) => (manager ? sendRaw(manager, payload) : false), []);

  return { send };
}
