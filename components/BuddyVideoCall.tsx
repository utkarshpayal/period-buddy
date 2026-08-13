import { Ionicons } from "@expo/vector-icons";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  mediaDevices,
  MediaStream,
  permissions,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView,
} from "react-native-webrtc";
import { useTheme } from "./theme";

/**
 * 1:1 WebRTC "meeting" between two anonymous Period Buddies. Both sides join the
 * shared buddy WebSocket room (`buddy_<roomKey>`) the parent already holds open,
 * get their own camera/mic, and auto-connect peer-to-peer — the same meeting
 * protocol the doctor<->patient consultation call uses, so there's no ring/accept
 * handshake and no third-party room. Whoever has the higher random id sends the
 * WebRTC offer, which avoids glare when both join at once. If the buddy joins
 * first, an inbound prompt surfaces here so this side can jump in.
 *
 * Beyond raw audio/video the meeting mirrors any call app's basics: an in-call
 * chat panel (same message log as the buddy chat, driven by the parent), a
 * default avatar whenever a camera is off, and mic-muted badges for both sides.
 * The peer's mic/camera state is learned via a lightweight `call_media` signal
 * broadcast over the same room.
 *
 * No TURN server is available (STUN only), so calls behind restrictive/symmetric
 * NAT may fail to connect.
 */

type Phase = "idle" | "incoming" | "waiting" | "connecting" | "active" | "ended";

/**
 * react-native-webrtc's shipped RTCPeerConnection.d.ts imports its EventTarget
 * base from an `event-target-shim` subpath that package's own `exports` map
 * doesn't expose, so under `moduleResolution: "bundler"` the inherited
 * addEventListener/removeEventListener drop out of the type entirely — even
 * though they're present at runtime. Augment locally rather than casting to
 * `any` at every call site.
 */
type PC = RTCPeerConnection & {
  addEventListener(type: string, listener: (event: any) => void): void;
};

/** Shape the parent's buddy chat log exposes to the in-call chat panel. */
export type BuddyCallMessage = {
  id?: string;
  sender: "me" | "buddy";
  text: string;
};

export type BuddyVideoCallHandle = {
  startCall: () => void;
  handleSignal: (data: any) => void;
};

type Props = {
  buddyAlias: string;
  roomId: string;
  socketRef: React.RefObject<WebSocket | null>;
  /** Shared buddy chat log (same as the buddy chat console). */
  chatMessages?: BuddyCallMessage[];
  /** Sends a chat message on the buddy pairing; parent persists + broadcasts it. */
  onSendMessage?: (text: string) => void;
};

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PB"
  );
}

export const BuddyVideoCall = forwardRef<BuddyVideoCallHandle, Props>(
  function BuddyVideoCall({ buddyAlias, roomId, socketRef, chatMessages, onSendMessage }, ref) {
    const { colors, fonts } = useTheme();

    const [phase, setPhase] = useState<Phase>("idle");
    const [endedReason, setEndedReason] = useState("");
    const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
    const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [remoteMuted, setRemoteMuted] = useState(false);
    const [remoteCameraOff, setRemoteCameraOff] = useState(false);

    // In-call chat panel.
    const [chatOpen, setChatOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [unread, setUnread] = useState(0);
    const chatListRef = useRef<ScrollView>(null);
    const prevMsgCountRef = useRef(0);

    const pcRef = useRef<PC | null>(null);
    const localStreamObjRef = useRef<MediaStream | null>(null);
    const pendingCandidatesRef = useRef<any[]>([]);

    // Meeting negotiation state.
    const myIdRef = useRef<number>(Math.random());
    const negotiatedRef = useRef(false);
    const offererRef = useRef(false);
    const ackedRef = useRef(false);
    const incomingPeerIdRef = useRef<number | null>(null);

    // Current local media state, kept in refs so we can echo it to a peer that
    // (re)joins without re-creating the signal handler on every toggle.
    const isMutedRef = useRef(false);
    const isCameraOffRef = useRef(false);

    const send = useCallback(
      (type: string, extra: Record<string, unknown> = {}) => {
        try {
          socketRef.current?.send(JSON.stringify({ type, room: roomId, ...extra }));
        } catch (err) {
          console.warn("Failed to send buddy call signal:", err);
        }
      },
      [roomId, socketRef],
    );

    const cleanup = useCallback(() => {
      pcRef.current?.close();
      pcRef.current = null;
      localStreamObjRef.current?.getTracks().forEach((track) => track.stop());
      localStreamObjRef.current = null;
      pendingCandidatesRef.current = [];
      negotiatedRef.current = false;
      offererRef.current = false;
      ackedRef.current = false;
      incomingPeerIdRef.current = null;
      isMutedRef.current = false;
      isCameraOffRef.current = false;
      setLocalStreamUrl(null);
      setRemoteStreamUrl(null);
      setIsMuted(false);
      setIsCameraOff(false);
      setRemoteMuted(false);
      setRemoteCameraOff(false);
      setChatOpen(false);
      setDraft("");
      setUnread(0);
    }, []);

    // Always release the camera/mic if this screen unmounts mid-call.
    useEffect(() => cleanup, [cleanup]);

    // Unread chat badge + auto-scroll: count messages that arrive while the
    // panel is closed during an active call; clear + scroll when it's open.
    useEffect(() => {
      const count = chatMessages?.length ?? 0;
      if (chatOpen) {
        setUnread(0);
        setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 50);
      } else if (phase === "active" && count > prevMsgCountRef.current) {
        setUnread((n) => n + (count - prevMsgCountRef.current));
      }
      prevMsgCountRef.current = count;
    }, [chatMessages, chatOpen, phase]);

    const flushPendingCandidates = useCallback(async (pc: PC) => {
      const queued = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn("Failed to add queued ICE candidate:", err);
        }
      }
    }, []);

    const ensureMediaPermissions = useCallback(async () => {
      // Ask explicitly (with a proper OS prompt) rather than letting
      // getUserMedia surface a bare, harder-to-diagnose failure on denial.
      if (Platform.OS !== "android" && Platform.OS !== "ios") return;
      const [cameraGranted, micGranted] = await Promise.all([
        permissions.request({ name: "camera" }),
        permissions.request({ name: "microphone" }),
      ]);
      if (!cameraGranted || !micGranted) {
        throw new Error("Camera and microphone permission are required for video calls.");
      }
    }, []);

    const endWithReason = useCallback(
      (reason: string, notifyPeer: boolean) => {
        if (notifyPeer) send("call_end");
        cleanup();
        setEndedReason(reason);
        setPhase("ended");
      },
      [cleanup, send],
    );

    const setupPeerConnection = useCallback(async () => {
      await ensureMediaPermissions();

      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
      localStreamObjRef.current = stream;
      setLocalStreamUrl(stream.toURL());

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS }) as PC;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.addEventListener("icecandidate", (event: any) => {
        if (event.candidate) send("webrtc_ice_candidate", { candidate: event.candidate });
      });

      pc.addEventListener("track", (event: any) => {
        const remote = event.streams?.[0];
        if (remote) setRemoteStreamUrl(remote.toURL());
      });

      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "connected") {
          setPhase("active");
          // Sync our current mic/cam state to the peer on connect.
          send("call_media", { audioOff: isMutedRef.current, videoOff: isCameraOffRef.current });
        } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          setEndedReason("Call disconnected");
          cleanup();
          setPhase("ended");
        }
      });

      pcRef.current = pc;
      return pc;
    }, [cleanup, ensureMediaPermissions, send]);

    // Whoever has the higher random id sends the offer; the other waits.
    const maybeNegotiate = useCallback(
      async (peerId: number) => {
        const pc = pcRef.current;
        if (!pc || negotiatedRef.current) return;
        negotiatedRef.current = true;
        setPhase("connecting");
        if (myIdRef.current > peerId) {
          offererRef.current = true;
          try {
            const offer = await pc.createOffer({});
            await pc.setLocalDescription(offer);
            send("webrtc_offer", { sdp: pc.localDescription });
          } catch (err) {
            console.warn("Failed to create offer:", err);
            endWithReason("Connection failed", true);
          }
        } else {
          offererRef.current = false;
        }
      },
      [endWithReason, send],
    );

    // Enter the call: get media, announce ourselves, and connect to whoever is
    // already here (or wait for them to arrive). Used both when we start the
    // call and when we accept an inbound prompt.
    const enterCall = useCallback(async () => {
      if (pcRef.current) return;
      const knownPeer = incomingPeerIdRef.current;
      try {
        await setupPeerConnection();
      } catch (err) {
        console.warn("Failed to enter buddy call:", err);
        endWithReason("Camera/mic permission required", false);
        return;
      }
      setPhase(knownPeer != null ? "connecting" : "waiting");
      ackedRef.current = true;
      send("call_join", { callId: myIdRef.current });
      if (knownPeer != null) maybeNegotiate(knownPeer);
    }, [endWithReason, maybeNegotiate, send, setupPeerConnection]);

    const endCall = useCallback(() => endWithReason("Call ended", true), [endWithReason]);

    const dismissIncoming = useCallback(() => {
      incomingPeerIdRef.current = null;
      setPhase("idle");
    }, []);

    // Auto-clear the transient "ended" banner back to idle.
    useEffect(() => {
      if (phase !== "ended") return;
      const timer = setTimeout(() => setPhase("idle"), 2200);
      return () => clearTimeout(timer);
    }, [phase]);

    const handleSignal = useCallback(
      async (data: any) => {
        switch (data?.type) {
          case "call_join": {
            const peerId = data.callId as number;
            incomingPeerIdRef.current = peerId;
            if (!pcRef.current) {
              if (phase === "idle") setPhase("incoming");
              return;
            }
            if (!ackedRef.current) {
              ackedRef.current = true;
              send("call_join", { callId: myIdRef.current });
            }
            maybeNegotiate(peerId);
            // Echo our current mic/cam state to the (re)joining peer.
            send("call_media", { audioOff: isMutedRef.current, videoOff: isCameraOffRef.current });
            return;
          }
          case "call_media": {
            setRemoteMuted(!!data.audioOff);
            setRemoteCameraOff(!!data.videoOff);
            return;
          }
          case "webrtc_offer": {
            const pc = pcRef.current;
            if (!pc || offererRef.current) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              await flushPendingCandidates(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              send("webrtc_answer", { sdp: pc.localDescription });
            } catch (err) {
              console.warn("Failed to handle offer:", err);
              endWithReason("Connection failed", true);
            }
            return;
          }
          case "webrtc_answer": {
            const pc = pcRef.current;
            if (!pc || !offererRef.current) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              await flushPendingCandidates(pc);
            } catch (err) {
              console.warn("Failed to handle answer:", err);
              endWithReason("Connection failed", true);
            }
            return;
          }
          case "webrtc_ice_candidate": {
            const pc = pcRef.current;
            if (!data.candidate) return;
            if (pc?.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.warn("Failed to add ICE candidate:", err);
              }
            } else {
              pendingCandidatesRef.current.push(data.candidate);
            }
            return;
          }
          case "call_end": {
            if (pcRef.current || phase === "incoming") endWithReason("Call ended", false);
            return;
          }
          default:
            return;
        }
      },
      [endWithReason, flushPendingCandidates, maybeNegotiate, phase, send],
    );

    useImperativeHandle(ref, () => ({ startCall: enterCall, handleSignal }), [enterCall, handleSignal]);

    const toggleMute = () => {
      const next = !isMuted;
      setIsMuted(next);
      isMutedRef.current = next;
      localStreamObjRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
      send("call_media", { audioOff: next, videoOff: isCameraOffRef.current });
    };
    const toggleCamera = () => {
      const next = !isCameraOff;
      setIsCameraOff(next);
      isCameraOffRef.current = next;
      localStreamObjRef.current?.getVideoTracks().forEach((track) => (track.enabled = !next));
      send("call_media", { audioOff: isMutedRef.current, videoOff: next });
    };

    const sendChat = () => {
      const text = draft.trim();
      if (!text) return;
      onSendMessage?.(text);
      setDraft("");
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    };

    const peerInitials = initialsOf(buddyAlias);
    const messages = chatMessages ?? [];

    const controlBtn = "w-14 h-14 rounded-full items-center justify-center";

    return (
      <Modal visible={phase !== "idle"} transparent animationType="fade" onRequestClose={endCall}>
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: "rgba(10, 8, 12, 0.96)" }}
        >
          {phase === "active" ? (
            <>
              {/* Remote main view — real video, or a default avatar if their
                  camera is off / not yet flowing. */}
              {remoteStreamUrl && !remoteCameraOff ? (
                <RTCView
                  streamURL={remoteStreamUrl}
                  style={{ position: "absolute", inset: 0 }}
                  objectFit="cover"
                />
              ) : (
                <View className="items-center">
                  <View
                    className="w-28 h-28 rounded-full items-center justify-center mb-4"
                    style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
                  >
                    <Text style={{ color: "#fff", fontFamily: fonts.heading }} className="text-3xl font-black">
                      {peerInitials}
                    </Text>
                  </View>
                  <Text style={{ color: "#fff", fontFamily: fonts.heading }} className="text-base font-black">
                    {buddyAlias}
                  </Text>
                  <Text
                    style={{ color: "rgba(255,255,255,0.6)", fontFamily: fonts.body }}
                    className="text-xs mt-1"
                  >
                    {remoteStreamUrl ? "Camera is off" : `Waiting for ${buddyAlias}'s video…`}
                  </Text>
                </View>
              )}

              {/* Top bar: buddy alias + muted pill */}
              <View className="absolute top-14 left-5 flex-row items-center gap-2">
                <View
                  className="px-3 py-1.5 rounded-full flex-row items-center gap-1.5"
                  style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
                >
                  <Text style={{ color: "#fff", fontFamily: fonts.body }} className="text-xs font-bold">
                    {buddyAlias}
                  </Text>
                  {remoteMuted && <Ionicons name="mic-off" size={13} color="#fff" />}
                </View>
              </View>

              {/* Local picture-in-picture: video, or an avatar when camera off. */}
              <View
                style={{
                  position: "absolute",
                  top: 56,
                  right: 20,
                  width: 96,
                  height: 132,
                  borderRadius: 16,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "rgba(255,255,255,0.5)",
                  backgroundColor: "rgba(255,255,255,0.1)",
                }}
              >
                {localStreamUrl && !isCameraOff ? (
                  <RTCView streamURL={localStreamUrl} mirror objectFit="cover" style={{ flex: 1 }} />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <Ionicons name="person" size={30} color="rgba(255,255,255,0.8)" />
                    <Text
                      style={{ color: "rgba(255,255,255,0.8)", fontFamily: fonts.body }}
                      className="text-[10px] font-bold mt-1"
                    >
                      You
                    </Text>
                  </View>
                )}
                {isMuted && (
                  <View
                    className="absolute bottom-1 left-1 w-6 h-6 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.danger }}
                  >
                    <Ionicons name="mic-off" size={12} color="#fff" />
                  </View>
                )}
              </View>

              {/* Controls */}
              <View className="absolute bottom-14 flex-row items-center gap-4">
                <TouchableOpacity
                  onPress={toggleMute}
                  className={controlBtn}
                  style={{ backgroundColor: isMuted ? "#fff" : "rgba(255,255,255,0.18)" }}
                >
                  <Ionicons name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? "#111" : "#fff"} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={toggleCamera}
                  className={controlBtn}
                  style={{ backgroundColor: isCameraOff ? "#fff" : "rgba(255,255,255,0.18)" }}
                >
                  <Ionicons
                    name={isCameraOff ? "videocam-off" : "videocam"}
                    size={22}
                    color={isCameraOff ? "#111" : "#fff"}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setChatOpen(true)}
                  className={controlBtn}
                  style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
                >
                  <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
                  {unread > 0 && (
                    <View
                      className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.danger }}
                    >
                      <Text style={{ color: "#fff", fontFamily: fonts.body }} className="text-[10px] font-black">
                        {unread > 9 ? "9+" : unread}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={endCall}
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.danger }}
                >
                  <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
                </TouchableOpacity>
              </View>

              {/* In-call chat panel */}
              {chatOpen && (
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                  style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end" }}
                >
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setChatOpen(false)}
                    style={{ flex: 1 }}
                  />
                  <View
                    style={{
                      height: "62%",
                      backgroundColor: colors.background,
                      borderTopLeftRadius: 24,
                      borderTopRightRadius: 24,
                      overflow: "hidden",
                    }}
                  >
                    <View
                      className="px-5 py-4 border-b flex-row items-center justify-between"
                      style={{ borderColor: colors.border }}
                    >
                      <Text
                        style={{ color: colors.foreground, fontFamily: fonts.heading }}
                        className="text-base font-black"
                      >
                        In-call chat
                      </Text>
                      <TouchableOpacity onPress={() => setChatOpen(false)} className="p-1">
                        <Ionicons name="chevron-down" size={22} color={colors.foreground} />
                      </TouchableOpacity>
                    </View>

                    <ScrollView
                      ref={chatListRef}
                      className="flex-1 px-4 pt-4"
                      contentContainerStyle={{ paddingBottom: 16, gap: 8 }}
                      keyboardShouldPersistTaps="handled"
                    >
                      {messages.length === 0 ? (
                        <Text
                          style={{ color: colors.mutedText, fontFamily: fonts.body }}
                          className="text-xs text-center mt-6"
                        >
                          No messages yet. Say hello 👋
                        </Text>
                      ) : (
                        messages.map((msg, i) => {
                          const isSelf = msg.sender === "me";
                          return (
                            <View
                              key={msg.id ?? i}
                              className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl ${
                                isSelf ? "self-end rounded-tr-none" : "self-start rounded-tl-none border"
                              }`}
                              style={{
                                backgroundColor: isSelf ? colors.primary : colors.surface,
                                borderColor: isSelf ? undefined : colors.border,
                              }}
                            >
                              <Text
                                className="text-xs font-semibold leading-5"
                                style={{
                                  color: isSelf ? colors.buttonText : colors.foreground,
                                  fontFamily: fonts.body,
                                }}
                              >
                                {msg.text}
                              </Text>
                            </View>
                          );
                        })
                      )}
                    </ScrollView>

                    <View
                      className="px-3 py-3 border-t flex-row items-center gap-2"
                      style={{ borderColor: colors.border, backgroundColor: colors.surface }}
                    >
                      <TextInput
                        placeholder="Type a message…"
                        placeholderTextColor={colors.mutedText}
                        value={draft}
                        onChangeText={setDraft}
                        onSubmitEditing={sendChat}
                        submitBehavior="submit"
                        returnKeyType="send"
                        className="flex-1 px-4 py-3 rounded-xl text-sm"
                        style={{ backgroundColor: colors.input, color: colors.foreground, fontFamily: fonts.body }}
                      />
                      <TouchableOpacity
                        disabled={!draft.trim()}
                        onPress={sendChat}
                        className="h-10 w-10 rounded-full items-center justify-center"
                        style={{ backgroundColor: draft.trim() ? colors.primary : colors.surfaceSoft }}
                      >
                        <Ionicons
                          name="arrow-forward"
                          size={18}
                          color={draft.trim() ? colors.buttonText : colors.mutedText}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              )}
            </>
          ) : phase === "incoming" ? (
            <View className="items-center px-8">
              <View
                className="w-20 h-20 rounded-full items-center justify-center mb-5"
                style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
              >
                <Ionicons name="videocam" size={30} color="#fff" />
              </View>
              <Text style={{ color: "#fff", fontFamily: fonts.heading }} className="text-lg font-black mb-1.5">
                {buddyAlias} is in the call
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: fonts.body }} className="text-xs mb-8">
                Join to connect your camera and mic.
              </Text>
              <View className="flex-row items-center gap-6">
                <TouchableOpacity
                  onPress={dismissIncoming}
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.danger }}
                >
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={enterCall}
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: colors.success }}
                >
                  <Ionicons name="videocam" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : phase === "ended" ? (
            <Text style={{ color: "#fff", fontFamily: fonts.body }} className="text-sm font-semibold">
              {endedReason}
            </Text>
          ) : (
            // waiting / connecting
            <View className="items-center px-8">
              {localStreamUrl && !isCameraOff ? (
                <RTCView
                  streamURL={localStreamUrl}
                  mirror
                  objectFit="cover"
                  style={{ width: 120, height: 160, borderRadius: 18, marginBottom: 20 }}
                />
              ) : (
                <View
                  className="items-center justify-center mb-5"
                  style={{
                    width: 120,
                    height: 160,
                    borderRadius: 18,
                    backgroundColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <Ionicons name="person" size={44} color="rgba(255,255,255,0.8)" />
                </View>
              )}
              <Text style={{ color: "#fff", fontFamily: fonts.heading }} className="text-base font-black mb-1.5">
                {phase === "waiting" ? `Waiting for ${buddyAlias} to join…` : "Connecting…"}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: fonts.body }} className="text-xs mb-8">
                Your camera is on. They&apos;ll appear when connected.
              </Text>
              <TouchableOpacity
                onPress={endCall}
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.danger }}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    );
  },
);
