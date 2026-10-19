import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeSocket, type RealtimeMessage } from "../hooks/useRealtimeSocket";
import { partnerApi, type AppNotification, type PartnerProfile } from "../lib/api";
import { mergeIncomingMessage, type LocalPartnerMessage } from "../lib/partnerChat";
import { useAuth } from "./auth-context";

type PartnerViewStateValue = {
  profile: PartnerProfile | null;
  setProfile: React.Dispatch<React.SetStateAction<PartnerProfile | null>>;
  notifications: AppNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  chatMessages: LocalPartnerMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<LocalPartnerMessage[]>>;
  /** Re-fetches profile + notifications from the server (used after actions
   * like disconnect, and to seed state on first load). */
  refreshProfile: () => Promise<void>;
};

const PartnerViewStateContext = createContext<PartnerViewStateValue | undefined>(undefined);

/**
 * Shared state for every tab in the partner view — profile, notifications,
 * and live chat messages all live here instead of per-screen, along with
 * the realtime subscription that keeps them in sync. Tabs
 * are siblings in the router (not parent/child), so without this each tab
 * would re-fetch and open its own socket, and switching tabs would lose
 * chat history for the session.
 */
export function PartnerViewStateProvider({ children }: { children: React.ReactNode }) {
  const { syncPartnerRole } = useAuth();
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [chatMessages, setChatMessages] = useState<LocalPartnerMessage[]>([]);

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
  // side Partner screen (partner_<partnerDocId>). Disconnect and notification
  // events come on the personal user_<id> room every socket auto-joins.
  const chatRoom = profile?._id && profile.isConnected ? `partner_${profile._id}` : null;
  const wasOpenRef = useRef(true);
  useRealtimeSocket({
    enabled: Boolean(chatRoom),
    rooms: chatRoom ? [chatRoom] : [],
    onMessage: useCallback(
      (data: RealtimeMessage) => {
        if (data.type === "message" && data.room === chatRoom && data.message) {
          setChatMessages((prev) => mergeIncomingMessage(prev, data.message));
        } else if (data.type === "partner_disconnected" || data.type === "partner_notification") {
          // A disconnect clears the viewer's role on the server; the re-fetch
          // hands that to auth, which moves them out of the partner view.
          if (data.notification) setNotifications((prev) => [data.notification, ...prev]);
          refreshProfile();
        }
      },
      [chatRoom, refreshProfile],
    ),
    onConnectionChange: useCallback(
      (open: boolean) => {
        // Back after a drop: catch up on whatever was missed meanwhile.
        if (open && !wasOpenRef.current) refreshProfile();
        wasOpenRef.current = open;
      },
      [refreshProfile],
    ),
  });

  const value = useMemo(
    () => ({ profile, setProfile, notifications, setNotifications, chatMessages, setChatMessages, refreshProfile }),
    [profile, notifications, chatMessages, refreshProfile],
  );

  return (
    <PartnerViewStateContext.Provider
      value={value}
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
