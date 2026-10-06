import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  getWebSocketUrl,
  partnerApi,
  type AppNotification,
  type PartnerMessage,
  type PartnerProfile,
} from "../lib/api";
import { useAuth } from "./auth-context";

type PartnerViewStateValue = {
  profile: PartnerProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<PartnerProfile | null>>;
  notifications: AppNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  chatMessages: PartnerMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<PartnerMessage[]>>;
  /** Re-fetches profile + notifications from the server (used after actions
   * like disconnect, and to seed state on first load). */
  refreshProfile: () => Promise<void>;
};

const PartnerViewStateContext = createContext<PartnerViewStateValue | undefined>(undefined);

/**
 * Shared state for every tab in the partner view — profile, notifications,
 * and live chat messages all live here instead of per-screen, along with
 * the one WebSocket connection that keeps them in sync in real time. Tabs
 * are siblings in the router (not parent/child), so without this each tab
 * would re-fetch and open its own socket, and switching tabs would lose
 * chat history for the session.
 */
export function PartnerViewStateProvider({ children }: { children: React.ReactNode }) {
  const { syncPartnerRole } = useAuth();
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [chatMessages, setChatMessages] = useState<PartnerMessage[]>([]);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const refreshProfile = useCallback(async () => {
    try {
      const [partnerProfile, notifs] = await Promise.all([
        partnerApi.getProfile(),
        partnerApi.getNotifications().catch(() => []),
      ]);
      setProfile(partnerProfile);
      setNotifications(notifs);
      // If the owner disconnected this viewer, the server has already
      // cleared their role — hand that to auth so the partner-view layout
      // guard moves them out instead of leaving an empty shared view.
      syncPartnerRole(partnerProfile.role ?? null);
    } catch {
      // Screens that need this data show their own error/retry state.
    }
  }, [syncPartnerRole]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // Live sync for chat + notifications — same room convention as the owner
  // side Partner screen (partner_<partnerDocId>).
  useEffect(() => {
    if (!profile?._id || !profile.isConnected) return;

    let socket: WebSocket | null = null;
    let isDisconnected = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    // Auto-reconnect with capped backoff + jitter so the partner view keeps
    // syncing chat/notifications after a transient socket drop.
    let reconnectAttempts = 0;
    function scheduleReconnect() {
      if (isDisconnected) return;
      const base = Math.min(30000, 1000 * 2 ** reconnectAttempts);
      reconnectAttempts += 1;
      reconnectTimeout = setTimeout(connectWS, base / 2 + Math.random() * (base / 2));
    }

    async function connectWS() {
      if (isDisconnected) return;
      try {
        const wsUrl = await getWebSocketUrl();
        if (isDisconnected) return;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (isDisconnected) return;
          reconnectAttempts = 0;
          socket?.send(JSON.stringify({ type: "join", room: `partner_${profile!._id}` }));
        };

        socket.onmessage = (event) => {
          if (isDisconnected) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === "message" && parsed.room === `partner_${profile!._id}` && parsed.message) {
              setChatMessages((prev) => {
                const next = [...prev];
                let found = false;
                for (let i = 0; i < next.length; i++) {
                  const m = next[i];
                  if (m._id === parsed.message._id) {
                    found = true;
                    break;
                  }
                  const isOptimisticMatch =
                    !m._id &&
                    m.sender === parsed.message.sender &&
                    m.text === parsed.message.text;
                  const isTimeMatch =
                    m.sender === parsed.message.sender &&
                    m.text === parsed.message.text &&
                    m.sentAt &&
                    parsed.message.sentAt &&
                    Math.abs(new Date(m.sentAt).getTime() - new Date(parsed.message.sentAt).getTime()) < 5000;
                  if (isOptimisticMatch || isTimeMatch) {
                    next[i] = parsed.message;
                    found = true;
                    break;
                  }
                }
                if (!found) next.push(parsed.message);
                return next;
              });
            } else if (parsed.type === "partner_disconnected") {
              // The owner ended the connection — re-fetch the profile, whose
              // cleared role moves this viewer out of the partner view.
              if (parsed.notification) {
                setNotifications((prev) => [parsed.notification, ...prev]);
              }
              refreshProfile();
            } else if (parsed.type === "partner_notification") {
              refreshProfile();
              if (parsed.notification) {
                setNotifications((prev) => [parsed.notification, ...prev]);
              }
            }
          } catch (err) {
            console.error("Error parsing WebSocket message:", err);
          }
        };

        socket.onerror = (err) => console.warn("WebSocket error:", err);

        socket.onclose = () => {
          if (isDisconnected) return;
          scheduleReconnect();
        };
      } catch (err) {
        console.warn("Failed to setup WebSocket:", err);
        scheduleReconnect();
      }
    }

    connectWS();

    return () => {
      isDisconnected = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "leave", room: `partner_${profile!._id}` }));
          }
        } catch {}
        socket.close();
      }
    };
    // Deliberately narrow: only reconnect on identity/connection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?._id, profile?.isConnected]);

  return (
    <PartnerViewStateContext.Provider
      value={{ profile, setProfile, notifications, setNotifications, chatMessages, setChatMessages, refreshProfile }}
    >
      {children}
    </PartnerViewStateContext.Provider>
  );
}

export function usePartnerViewState() {
  const ctx = useContext(PartnerViewStateContext);
  if (!ctx) {
    throw new Error("usePartnerViewState must be used within PartnerViewStateProvider");
  }
  return ctx;
}
