import { useCallback, useEffect, useRef } from "react";
import { getWebSocketUrl } from "../lib/api";

export type RealtimeMessage = Record<string, any>;
type MessageHandler = (data: RealtimeMessage) => void;

type SocketManager = {
  connecting: boolean;
  isDisconnected: boolean;
  listeners: Set<MessageHandler>;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  roomRefCounts: Map<string, number>;
  sendQueue: string[];
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
      isDisconnected: false,
      listeners: new Set(),
      reconnectAttempts: 0,
      reconnectTimeout: null,
      roomRefCounts: new Map(),
      sendQueue: [],
      socket: null,
    };
  }
  return manager;
}

function sendRaw(m: SocketManager, payload: Record<string, unknown>) {
  const json = JSON.stringify(payload);
  if (m.socket && m.socket.readyState === WebSocket.OPEN) {
    m.socket.send(json);
  } else {
    m.sendQueue.push(json);
  }
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

  getWebSocketUrl()
    .then((wsUrl) => {
      if (m.isDisconnected) {
        m.connecting = false;
        return;
      }

      const socket = new WebSocket(wsUrl);
      m.socket = socket;

      socket.onopen = () => {
        if (m.isDisconnected) return;
        m.connecting = false;
        m.reconnectAttempts = 0;
        if (__DEV__) console.log("Realtime WebSocket connected");

        for (const room of m.roomRefCounts.keys()) {
          sendRaw(m, { room, type: "join" });
        }

        while (m.sendQueue.length > 0) {
          const queued = m.sendQueue.shift();
          if (queued) socket.send(queued);
        }
      };

      socket.onmessage = (event) => {
        if (m.isDisconnected) return;
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
        m.connecting = false;
        if (m.socket === socket) m.socket = null;
        if (m.isDisconnected) return;
        if (__DEV__) console.log("Realtime WebSocket closed, retrying with backoff…");
        scheduleReconnect(m);
      };
    })
    .catch((err) => {
      m.connecting = false;
      console.warn("Failed to get WebSocket URL, retrying with backoff…", err);
      scheduleReconnect(m);
    });
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
  if (m.listeners.size > 0 || m.roomRefCounts.size > 0) return;

  m.isDisconnected = true;
  if (m.reconnectTimeout) clearTimeout(m.reconnectTimeout);
  m.reconnectTimeout = null;
  if (m.socket) {
    m.socket.close();
    m.socket = null;
  }
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
  /** Rooms to join for as long as this hook is mounted with `enabled: true`. */
  rooms: string[];
};

export function useRealtimeSocket({ enabled = true, onMessage, rooms }: UseRealtimeSocketOptions) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const roomsKey = rooms.join(",");

  useEffect(() => {
    if (!enabled || rooms.length === 0) return;

    const m = getManager();
    m.isDisconnected = false;

    const listener: MessageHandler = (data) => onMessageRef.current?.(data);
    m.listeners.add(listener);
    rooms.forEach((room) => retainRoom(m, room));
    connect(m);

    return () => {
      m.listeners.delete(listener);
      rooms.forEach((room) => releaseRoom(m, room));
      teardownIfIdle(m);
    };
    // `rooms` is intentionally tracked via the joined `roomsKey` string so an
    // inline array literal from the caller doesn't re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomsKey]);

  const send = useCallback((payload: Record<string, unknown>) => {
    sendRaw(getManager(), payload);
  }, []);

  return { send };
}
