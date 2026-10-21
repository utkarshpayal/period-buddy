import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { type VideoJoin } from "../lib/api";
import {
  JITSI_CONFIG_OVERWRITE,
  JITSI_EVENTS,
  JITSI_INTERFACE_OVERWRITE,
  applyJitsiEvent,
  describeJoinError,
  initialCallState,
  type CallChat,
  type CallState,
  type JitsiEventData,
} from "../lib/jitsiCall";
import { useCallSession } from "../hooks/useCallSession";
import { CallChatPanel } from "./CallChatPanel";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

/**
 * Web build of JitsiCall (see the native file for the design):
 * the same Jitsi IFrame API, but straight into the page instead of a WebView.
 */

type Props = {
  callKey: string;
  peerName: string;
  visible: boolean;
  fetchJoin: () => Promise<VideoJoin>;
  onAttendance?: (event: "joined" | "left") => void;
  endedMessage?: string | null;
  chat?: CallChat;
  onClose: () => void;
};

type JitsiApi = {
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener: (event: string, handler: (payload: any) => void) => void;
  getNumberOfParticipants: () => number;
  dispose: () => void;
};
type JitsiCtor = new (domain: string, options: Record<string, unknown>) => JitsiApi;

const BG = "#17212E";
const loads = new Map<string, Promise<JitsiCtor>>();

function loadJitsi(domain: string): Promise<JitsiCtor> {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?$/i.test(domain)) return Promise.reject(new Error("Invalid video server"));
  const existing = loads.get(domain);
  if (existing) return existing;
  const promise = new Promise<JitsiCtor>((resolve, reject) => {
    const w = window as unknown as { JitsiMeetExternalAPI?: JitsiCtor };
    if (w.JitsiMeetExternalAPI) return resolve(w.JitsiMeetExternalAPI);
    const script = document.createElement("script");
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    // A failed load is never cached: Try again must hit the network again.
    const fail = () => {
      loads.delete(domain);
      script.remove();
      reject(new Error("load"));
    };
    script.onload = () => (w.JitsiMeetExternalAPI ? resolve(w.JitsiMeetExternalAPI) : fail());
    script.onerror = fail;
    document.head.appendChild(script);
  });
  loads.set(domain, promise);
  return promise;
}

export function JitsiCall({ visible, ...props }: Props) {
  if (!visible) return null;
  return <WebCall key={props.callKey} {...props} />;
}

function WebCall({ callKey, peerName, fetchJoin, onAttendance, endedMessage, chat, onClose }: Omit<Props, "visible">) {
  const { colors, fonts } = useTheme();
  const hostRef = useRef<View | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [call, setCall] = useState<CallState>(initialCallState());
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [chatOpen, setChatOpen] = useState(false);

  const dispose = () => {
    const api = apiRef.current;
    apiRef.current = null;
    try {
      api?.dispose();
    } catch {
      /* gone */
    }
  };

  const { leavingRef, endedRef, fetchJoinRef, markJoined, finish, finishSoon, unread } = useCallSession({
    fetchJoin,
    onAttendance,
    onClose,
    endedMessage,
    call,
    chat,
    chatOpen,
    release: dispose,
    onEnded: (message) => {
      dispose();
      setProblem({ message, canRetry: false });
    },
    onFailure: (message) => {
      dispose();
      setProblem({ message, canRetry: true });
    },
  });

  useEffect(() => {
    let cancelled = false;
    leavingRef.current = false;
    setLoading(true);
    setProblem(null);
    setCall(initialCallState());
    (async () => {
      try {
        const join = await fetchJoinRef.current();
        const Jitsi = await loadJitsi(join.domain).catch(() => {
          throw new Error("load");
        });
        const parent = hostRef.current as unknown as HTMLElement | null;
        if (cancelled || endedRef.current || !parent) return;
        parent.innerHTML = "";
        const api = new Jitsi(join.domain, {
          roomName: join.roomName,
          jwt: join.token,
          parentNode: parent,
          width: "100%",
          height: "100%",
          configOverwrite: JITSI_CONFIG_OVERWRITE,
          interfaceConfigOverwrite: JITSI_INTERFACE_OVERWRITE,
          userInfo: { displayName: join.displayName },
        });
        apiRef.current = api;
        for (const name of JITSI_EVENTS) {
          api.addListener(name, (d: any) => {
            const data: JitsiEventData = {
              id: d?.id,
              muted: d?.muted,
              enabled: d?.enabled,
              error: d?.error ? { name: d.error.name, isFatal: d.error.isFatal } : undefined,
            };
            if (name === "videoConferenceJoined") {
              data.count = api.getNumberOfParticipants();
              setLoading(false);
              markJoined();
            }
            setCall((prev) => applyJitsiEvent(prev, name, data, leavingRef.current));
          });
        }
      } catch (err) {
        if (cancelled || endedRef.current) return;
        setLoading(false);
        setProblem(
          err instanceof Error && err.message === "load"
            ? { message: "Couldn't reach the video service. Check your connection and try again.", canRetry: true }
            : describeJoinError(err),
        );
      }
    })();
    return () => {
      cancelled = true;
      dispose();
    };
    // The refs are stable; only a new call or a Retry re-runs this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callKey, attempt]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const leave = () => {
    if (!apiRef.current) return finish();
    leavingRef.current = true;
    apiRef.current.executeCommand("hangup");
    finishSoon();
  };
  const cmd = (name: string, arg?: boolean) =>
    arg === undefined ? apiRef.current?.executeCommand(name) : apiRef.current?.executeCommand(name, arg);
  const toggleAudioOnly = () => {
    const next = !call.audioOnly;
    cmd("setLowBandwidthMode", next);
    if (next && !call.cameraOff) cmd("toggleVideo");
    setCall((prev) => ({ ...prev, audioOnly: next }));
  };

  const inCall = call.joined && !problem;
  const controls: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; active: boolean; onPress: () => void }[] = [
    { icon: call.micMuted ? "mic-off" : "mic", label: call.micMuted ? "Unmute" : "Mute", active: call.micMuted, onPress: () => cmd("toggleAudio") },
    { icon: call.cameraOff ? "video-off" : "video", label: call.cameraOff ? "Camera on" : "Camera off", active: call.cameraOff, onPress: () => cmd("toggleVideo") },
    { icon: "headphones", label: "Audio only", active: call.audioOnly, onPress: toggleAudioOnly },
  ];

  return (
    <Modal visible transparent={false} onRequestClose={() => (chatOpen ? setChatOpen(false) : leave())}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View ref={hostRef} style={{ flex: 1, display: problem ? "none" : "flex" }} />
        {(loading || problem) && (
          <View className="absolute inset-0 items-center justify-center px-8" style={{ backgroundColor: BG }}>
            {problem ? <Icon set="feather" name="video-off" size={36} color="#FFFFFF" /> : <ActivityIndicator color="#FFFFFF" />}
            <Text className="text-base font-extrabold mt-4 text-center" style={{ color: "#FFFFFF", fontFamily: fonts.heading }}>
              {problem ? problem.message : "Opening the video room… Allow camera and microphone when asked."}
            </Text>
            {problem && (
              <View className="flex-row gap-3 mt-6">
                <TouchableOpacity onPress={finish} className="rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.16)" }}>
                  <Text className="text-sm font-bold" style={{ color: "#FFFFFF" }}>Close</Text>
                </TouchableOpacity>
                {problem.canRetry && (
                  <TouchableOpacity onPress={() => setAttempt((n) => n + 1)} className="rounded-xl px-4 py-3" style={{ backgroundColor: colors.primary }}>
                    <Text className="text-sm font-bold" style={{ color: "#FFFFFF" }}>Try again</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
        <View className="absolute left-0 right-0 items-center gap-2 px-4" style={{ top: 16 }} pointerEvents="none">
          {inCall && call.peers.length === 0 && (
            <Text className="text-xs font-bold rounded-full px-4 py-2" style={{ color: "#FFFFFF", backgroundColor: "rgba(23,33,46,0.82)" }}>
              Waiting for {peerName} to join…
            </Text>
          )}
          {offline && !problem && (
            <Text className="text-xs font-bold rounded-full px-4 py-2" style={{ color: "#FFFFFF", backgroundColor: "#8A5A00" }}>
              {"You're offline. The call will reconnect when you're back online."}
            </Text>
          )}
        </View>
        {!problem && (
          <View className="absolute left-0 right-0 flex-row items-center justify-center gap-4" style={{ bottom: 28 }}>
            {controls.map((c) => (
              <TouchableOpacity
                key={c.label}
                onPress={c.onPress}
                disabled={!inCall}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                className="h-[56px] w-[56px] rounded-full items-center justify-center"
                style={{ backgroundColor: c.active ? "#FFFFFF" : "rgba(255,255,255,0.18)", opacity: inCall ? 1 : 0.45 }}
              >
                <Icon set="feather" name={c.icon} size={22} color={c.active ? BG : "#FFFFFF"} />
              </TouchableOpacity>
            ))}
            {chat && (
              <TouchableOpacity
                onPress={() => setChatOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={unread ? `Chat, ${unread} new` : "Chat"}
                className="h-[56px] w-[56px] rounded-full items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
              >
                <Icon set="feather" name="message-circle" size={22} color="#FFFFFF" />
                {unread > 0 && (
                  <View
                    className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.danger }}
                  >
                    <Text className="text-[11.5px] font-extrabold" style={{ color: "#FFFFFF" }}>
                      {unread > 9 ? "9+" : unread}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={leave}
              accessibilityRole="button"
              accessibilityLabel="Leave call"
              className="h-[64px] w-[64px] rounded-full items-center justify-center"
              style={{ backgroundColor: colors.danger }}
            >
              <Icon set="feather" name="phone-off" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
        {chat && chatOpen && !problem && (
          <CallChatPanel chat={chat} peerName={peerName} onClose={() => setChatOpen(false)} />
        )}
      </View>
    </Modal>
  );
}
