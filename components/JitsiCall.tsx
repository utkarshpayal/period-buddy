import { Feather } from "@expo/vector-icons";
import { useKeepAwake } from "expo-keep-awake";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { type VideoJoin } from "../lib/api";
import {
  applyJitsiEvent,
  buildJitsiHtml,
  describeJoinError,
  initialCallState,
  peerMessageCount,
  type CallChat,
  type CallState,
  type JitsiEventData,
} from "../lib/jitsiCall";
import { CallChatPanel } from "./CallChatPanel";
import { useSecureScreen } from "../lib/screenPrivacy";
import { useTheme } from "./theme";

type Props = {
  /** Identifies the call (consultation id, buddy pairing): a new id is a new call. */
  callKey: string;
  /** e.g. "Dr Rao", for "Waiting for Dr Rao to join". */
  peerName: string;
  visible: boolean;
  /** Asks the API for a fresh token (it checks who may join and when). Called on every (re)join. */
  fetchJoin: () => Promise<VideoJoin>;
  /** Informational joined/left reports; never changes anything server-side. */
  onAttendance?: (event: "joined" | "left") => void;
  /** Set when the session ended elsewhere (consultation completed/cancelled, buddy
   * pairing ended): the call hangs up and shows this, with no Rejoin. */
  endedMessage?: string | null;
  /** The existing (saved) chat, shown in a panel over the call. */
  chat?: CallChat;
  onClose: () => void;
};

type Phase =
  | { kind: "permissions" }
  | { kind: "connecting" }
  | { kind: "call"; join: VideoJoin; html: string }
  | { kind: "blocked"; message: string; canRetry: boolean; openSettings?: boolean };

const BG = "#17212E";

const isAllowedCallUrl = (url: string, domain: string) =>
  url === `https://${domain}` ||
  url.startsWith(`https://${domain}/`) ||
  url.startsWith("about:") ||
  url.startsWith("blob:");

/** Android asks at runtime; iOS asks inside the WebView (usage strings are in app.json). */
async function requestCallPermissions(): Promise<{ mic: boolean; camera: boolean }> {
  if (Platform.OS !== "android") return { mic: true, camera: true };
  const { CAMERA, RECORD_AUDIO } = PermissionsAndroid.PERMISSIONS;
  const result = await PermissionsAndroid.requestMultiple([RECORD_AUDIO, CAMERA]);
  const granted = PermissionsAndroid.RESULTS.GRANTED;
  return { mic: result[RECORD_AUDIO] === granted, camera: result[CAMERA] === granted };
}

/**
 * Every video call in the app (doctor consultations, Period Buddy calls) on
 * the self-hosted Jitsi server (meet.thenura.care), embedded in a WebView:
 * Jitsi's web client through its IFrame API, with Jitsi's toolbar hidden and
 * these buttons as the only controls (mic, camera, audio only, leave), so
 * there's no invite, recording or sharing. Every (re)join asks the API for a
 * fresh short-lived token (`fetchJoin`); the API decides who may join and
 * when. Leaving never completes a session. Full-screen Modal, so it floats
 * above chat sheets.
 *
 * No native Jitsi SDK: no release of @jitsi/react-native-sdk supports this
 * app's React Native 0.81. Needs a build with camera/mic permissions (already
 * in app.json); test on an Android development build.
 */
export function JitsiCall({ visible, ...props }: Props) {
  if (!visible) return null;
  return <CallModal key={props.callKey} {...props} />;
}

function CallModal({ callKey, peerName, fetchJoin, onAttendance, endedMessage, chat, onClose }: Omit<Props, "visible">) {
  useKeepAwake("video-call");
  useSecureScreen("video-call");
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "permissions" });
  const [call, setCall] = useState<CallState>(initialCallState());
  const [offline, setOffline] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Peer messages already seen (counted while the panel is open): the rest are unread.
  const peerCount = chat ? peerMessageCount(chat.messages) : 0;
  const seenPeerCountRef = useRef(peerCount);
  if (chatOpen) seenPeerCountRef.current = peerCount;
  const unread = Math.max(0, peerCount - seenPeerCountRef.current);
  const leavingRef = useRef(false);
  const joinedRef = useRef(false);
  const closedRef = useRef(false);
  // Set once the session ended elsewhere: a join still in flight must not reopen the call.
  const endedRef = useRef(false);
  // Latest callbacks without re-running the join effect on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const fetchJoinRef = useRef(fetchJoin);
  fetchJoinRef.current = fetchJoin;
  const attendanceRef = useRef(onAttendance);
  attendanceRef.current = onAttendance;

  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (joinedRef.current) attendanceRef.current?.("left");
    joinedRef.current = false;
    onCloseRef.current();
  }, []);

  // Permissions, then a fresh token. Re-runs on Retry/Rejoin.
  useEffect(() => {
    let cancelled = false;
    leavingRef.current = false;
    setOffline(false);
    setPhase({ kind: "permissions" });
    (async () => {
      let camera = true;
      try {
        const granted = await requestCallPermissions();
        camera = granted.camera;
        if (!granted.mic) {
          if (!cancelled && !endedRef.current) {
            setPhase({
              kind: "blocked",
              message: "Nura needs your microphone for the call. Allow it in Settings, then try again.",
              canRetry: true,
              openSettings: true,
            });
          }
          return;
        }
      } catch {
        /* the WebView will ask instead */
      }
      if (cancelled || endedRef.current) return;
      setPhase({ kind: "connecting" });
      try {
        const join = await fetchJoinRef.current();
        if (cancelled || endedRef.current) return;
        const html = buildJitsiHtml({
          domain: join.domain,
          roomName: join.roomName,
          jwt: join.token,
          displayName: join.displayName,
          startWithVideoMuted: !camera,
        });
        setCall(initialCallState(camera));
        setPhase({ kind: "call", join, html });
      } catch (err) {
        if (!cancelled && !endedRef.current) setPhase({ kind: "blocked", ...describeJoinError(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callKey, attempt]);

  // The session ended elsewhere: hang up and say why (no Rejoin).
  useEffect(() => {
    if (!endedMessage) return;
    endedRef.current = true;
    leavingRef.current = true;
    command("hangup");
    if (joinedRef.current) attendanceRef.current?.("left");
    joinedRef.current = false;
    setPhase({ kind: "blocked", message: endedMessage, canRetry: false });
  }, [endedMessage]);

  const command = (name: string, arg?: boolean) => {
    const args = arg === undefined ? "" : `, ${arg ? "true" : "false"}`;
    webRef.current?.injectJavaScript(
      `window.__nura && window.__nura.cmd(${JSON.stringify(name)}${args}); true;`,
    );
  };

  const onMessage = (event: WebViewMessageEvent) => {
    let msg: { type?: string; name?: string; data?: JitsiEventData; online?: boolean };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "network") {
      setOffline(msg.online === false);
      return;
    }
    if (msg.type === "loadError") {
      setPhase({
        kind: "blocked",
        message: "Couldn't reach the video service. Check your connection and try again.",
        canRetry: true,
      });
      return;
    }
    if (msg.type !== "event" || !msg.name) return;
    if (msg.name === "videoConferenceJoined") {
      joinedRef.current = true;
      attendanceRef.current?.("joined");
    }
    setCall((prev) => applyJitsiEvent(prev, msg.name!, msg.data, leavingRef.current));
  };

  // A finished hang-up closes the screen; a fatal failure offers Rejoin.
  useEffect(() => {
    if (call.closed) finish();
  }, [call.closed, finish]);
  useEffect(() => {
    if (call.failure && !leavingRef.current) {
      // Dropped out of the call: report it once (Rejoin reports "joined" again).
      if (joinedRef.current) attendanceRef.current?.("left");
      joinedRef.current = false;
      setPhase({ kind: "blocked", message: call.failure, canRetry: true });
    }
  }, [call.failure]);

  const leave = () => {
    if (phase.kind !== "call") {
      finish();
      return;
    }
    leavingRef.current = true;
    command("hangup");
    // readyToClose normally follows; don't hang if the page is gone.
    setTimeout(finish, 1500);
  };

  const toggleAudioOnly = () => {
    const next = !call.audioOnly;
    // Jitsi's low bandwidth mode: stop receiving video. Also turn our camera off.
    command("setLowBandwidthMode", next);
    if (next && !call.cameraOff) command("toggleVideo");
    setCall((prev) => ({ ...prev, audioOnly: next }));
  };

  const inCall = phase.kind === "call" && call.joined;
  const domain = phase.kind === "call" ? phase.join.domain : "";

  return (
    <Modal
      visible
      animationType="slide"
      // Android back: closes the chat first, then leaves the call.
      onRequestClose={() => (chatOpen ? setChatOpen(false) : leave())}
      statusBarTranslucent
      presentationStyle="fullScreen"
    >
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: BG }} accessibilityViewIsModal>
        {phase.kind === "call" && (
          <WebView
            key={`${callKey}-${attempt}`}
            ref={webRef}
            source={{ html: phase.html, baseUrl: `https://${domain}` }}
            // Every load (frames included) is checked here; anything that isn't
            // our Jitsi server is simply not loaded (never handed to the browser).
            originWhitelist={["*"]}
            onShouldStartLoadWithRequest={(req) => isAllowedCallUrl(req.url, domain)}
            onMessage={onMessage}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures={false}
            onError={() =>
              setPhase({
                kind: "blocked",
                message: "Couldn't load the call. Check your connection and try again.",
                canRetry: true,
              })
            }
            style={{ flex: 1, backgroundColor: BG }}
          />
        )}

        {(phase.kind === "permissions" || phase.kind === "connecting" || (phase.kind === "call" && !call.joined)) && (
          <View className="absolute inset-0 items-center justify-center px-8" style={{ backgroundColor: BG }} pointerEvents="none">
            <ActivityIndicator color="#FFFFFF" />
            <Text className="text-base font-extrabold mt-4 text-center" style={{ color: "#FFFFFF", fontFamily: fonts.heading }}>
              {phase.kind === "permissions" ? "Getting your camera and mic ready…" : "Opening the video room…"}
            </Text>
          </View>
        )}

        {phase.kind === "blocked" && (
          <View className="absolute inset-0 items-center justify-center px-8" style={{ backgroundColor: BG }}>
            <Feather name="video-off" size={36} color="#FFFFFF" />
            <Text
              className="text-base font-extrabold mt-4 text-center"
              style={{ color: "#FFFFFF", fontFamily: fonts.heading }}
              accessibilityLiveRegion="polite"
            >
              {phase.message}
            </Text>
            <View className="flex-row gap-3 mt-6">
              {phase.openSettings && (
                <TouchableOpacity
                  onPress={() => Linking.openSettings().catch(() => undefined)}
                  accessibilityRole="button"
                  className="rounded-xl px-4 py-3"
                  style={{ backgroundColor: "rgba(255,255,255,0.16)" }}
                >
                  <Text className="text-sm font-bold" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                    Open Settings
                  </Text>
                </TouchableOpacity>
              )}
              {phase.canRetry && (
                <TouchableOpacity
                  onPress={() => setAttempt((n) => n + 1)}
                  accessibilityRole="button"
                  className="rounded-xl px-4 py-3"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-sm font-bold" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                    {phase.message.includes("Rejoin") ? "Rejoin" : "Try again"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Status banners */}
        <View className="absolute left-0 right-0 items-center gap-2 px-4" style={{ top: insets.top + 12 }} pointerEvents="none">
          {inCall && call.peers.length === 0 && (
            <Banner text={`Waiting for ${peerName} to join…`} fontFamily={fonts.body} />
          )}
          {offline && phase.kind === "call" && (
            <Banner text="You're offline. The call will reconnect when you're back online." warn fontFamily={fonts.body} />
          )}
          {inCall && call.deviceProblem && (
            <Banner
              text={
                call.deviceProblem === "mic"
                  ? "Your microphone isn't available. Check Settings."
                  : "Your camera isn't available. You're on audio only."
              }
              warn
              fontFamily={fonts.body}
            />
          )}
        </View>

        {phase.kind !== "blocked" && (
          <View
            className="absolute left-0 right-0 flex-row items-center justify-center gap-3"
            style={{ bottom: insets.bottom + 24 }}
          >
            <ControlButton
              icon={call.micMuted ? "mic-off" : "mic"}
              label={call.micMuted ? "Unmute microphone" : "Mute microphone"}
              active={call.micMuted}
              disabled={!inCall}
              onPress={() => command("toggleAudio")}
            />
            <ControlButton
              icon={call.cameraOff ? "video-off" : "video"}
              label={call.cameraOff ? "Turn camera on" : "Turn camera off"}
              active={call.cameraOff}
              disabled={!inCall}
              onPress={() => command("toggleVideo")}
            />
            {chat && (
              <View>
                <ControlButton
                  icon="message-circle"
                  label={unread ? `Chat, ${unread} new` : "Chat"}
                  active={false}
                  disabled={false}
                  onPress={() => setChatOpen(true)}
                />
                {unread > 0 && (
                  <View
                    className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.danger }}
                    pointerEvents="none"
                  >
                    <Text className="text-[11.5px] font-extrabold" style={{ color: "#FFFFFF", fontFamily: fonts.body }}>
                      {unread > 9 ? "9+" : unread}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <ControlButton
              icon="headphones"
              label={call.audioOnly ? "Turn audio-only mode off" : "Audio only"}
              active={call.audioOnly}
              disabled={!inCall}
              onPress={toggleAudioOnly}
            />
            <TouchableOpacity
              onPress={leave}
              accessibilityRole="button"
              accessibilityLabel="Leave call"
              className="h-[64px] w-[64px] rounded-full items-center justify-center"
              style={{ backgroundColor: colors.danger }}
            >
              <Feather name="phone-off" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
        {chat && chatOpen && phase.kind !== "blocked" && (
          <CallChatPanel chat={chat} peerName={peerName} onClose={() => setChatOpen(false)} />
        )}
        {phase.kind === "blocked" && (
          <TouchableOpacity
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="absolute rounded-full p-2"
            style={{ top: insets.top + 12, right: 16, backgroundColor: "rgba(255,255,255,0.16)" }}
          >
            <Feather name="x" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

function Banner({ text, warn, fontFamily }: { text: string; warn?: boolean; fontFamily: string }) {
  return (
    <View
      className="rounded-full px-4 py-2"
      style={{ backgroundColor: warn ? "#8A5A00" : "rgba(23,33,46,0.82)" }}
      accessibilityLiveRegion="polite"
    >
      <Text className="text-xs font-bold text-center" style={{ color: "#FFFFFF", fontFamily }}>
        {text}
      </Text>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      className="h-[56px] w-[56px] rounded-full items-center justify-center"
      style={{ backgroundColor: active ? "#FFFFFF" : "rgba(255,255,255,0.18)", opacity: disabled ? 0.45 : 1 }}
    >
      <Feather name={icon} size={22} color={active ? BG : "#FFFFFF"} />
    </TouchableOpacity>
  );
}
