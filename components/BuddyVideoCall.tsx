import { Ionicons } from "@expo/vector-icons";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
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
 * Consent-gated 1:1 video call between two anonymous Period Buddies.
 * Signaling rides the same WebSocket room the parent screen already joins
 * for chat (`buddy_<id>`) — the parent forwards every non-chat message here
 * via `handleSignal`, and this component sends through the same socket via
 * `socketRef`. Camera/mic permission is requested up front — before the
 * caller rings (`startCall`) and before the callee's stream is opened
 * (`acceptCall`) — but the camera/mic itself only turns on once both sides
 * have agreed to the call.
 *
 * No TURN server is available (no backend infra for one), so calls behind
 * restrictive/symmetric NAT may fail to connect — STUN only.
 */

type Phase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

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

export type BuddyVideoCallHandle = {
  startCall: () => void;
  handleSignal: (data: any) => void;
};

type Props = {
  buddyAlias: string;
  roomId: string;
  socketRef: React.RefObject<WebSocket | null>;
};

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export const BuddyVideoCall = forwardRef<BuddyVideoCallHandle, Props>(
  function BuddyVideoCall({ buddyAlias, roomId, socketRef }, ref) {
    const { colors, fonts } = useTheme();

    const [phase, setPhase] = useState<Phase>("idle");
    const [endedReason, setEndedReason] = useState("");
    const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
    const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);

    const pcRef = useRef<PC | null>(null);
    const localStreamObjRef = useRef<MediaStream | null>(null);
    const pendingCandidatesRef = useRef<any[]>([]);
    const isCallerRef = useRef(false);

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
      isCallerRef.current = false;
      setLocalStreamUrl(null);
      setRemoteStreamUrl(null);
      setIsMuted(false);
      setIsCameraOff(false);
    }, []);

    // Always release the camera/mic if this screen unmounts mid-call.
    useEffect(() => cleanup, [cleanup]);

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
        } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          setEndedReason("Call disconnected");
          cleanup();
          setPhase("ended");
        }
      });

      pcRef.current = pc;
      return pc;
    }, [cleanup, ensureMediaPermissions, send]);

    const endWithReason = useCallback(
      (reason: string, notifyPeer: boolean) => {
        if (notifyPeer) send("call_end");
        cleanup();
        setEndedReason(reason);
        setPhase("ended");
      },
      [cleanup, send],
    );

    // Auto-clear the transient "ended" banner back to idle.
    useEffect(() => {
      if (phase !== "ended") return;
      const timer = setTimeout(() => setPhase("idle"), 2200);
      return () => clearTimeout(timer);
    }, [phase]);

    const startCall = useCallback(async () => {
      if (phase !== "idle") return;
      try {
        await ensureMediaPermissions();
      } catch (err) {
        console.warn("Failed to start buddy call:", err);
        setEndedReason("Camera/mic permission required");
        setPhase("ended");
        return;
      }
      isCallerRef.current = true;
      setPhase("outgoing");
      send("call_request");
    }, [ensureMediaPermissions, phase, send]);

    const acceptCall = useCallback(async () => {
      setPhase("connecting");
      try {
        await setupPeerConnection();
        send("call_accept");
      } catch (err) {
        console.warn("Failed to accept buddy call:", err);
        endWithReason("Couldn't access camera/mic", true);
      }
    }, [endWithReason, send, setupPeerConnection]);

    const declineCall = useCallback(() => {
      send("call_decline");
      cleanup();
      setPhase("idle");
    }, [cleanup, send]);

    const endCall = useCallback(() => {
      endWithReason("Call ended", true);
    }, [endWithReason]);

    const handleSignal = useCallback(
      async (data: any) => {
        switch (data?.type) {
          case "call_request": {
            if (phase !== "idle") {
              // Already busy — let the caller know without any UI on our side.
              send("call_decline");
              return;
            }
            isCallerRef.current = false;
            setPhase("incoming");
            return;
          }
          case "call_decline": {
            if (phase === "outgoing") endWithReason("Declined", false);
            return;
          }
          case "call_end": {
            if (phase !== "idle") endWithReason("Call ended", false);
            return;
          }
          case "call_accept": {
            if (!isCallerRef.current || phase !== "outgoing") return;
            setPhase("connecting");
            try {
              const pc = await setupPeerConnection();
              const offer = await pc.createOffer({});
              await pc.setLocalDescription(offer);
              send("webrtc_offer", { sdp: pc.localDescription });
            } catch (err) {
              console.warn("Failed to start buddy call as caller:", err);
              endWithReason("Couldn't access camera/mic", true);
            }
            return;
          }
          case "webrtc_offer": {
            const pc = pcRef.current;
            if (!pc || isCallerRef.current) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              await flushPendingCandidates(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              send("webrtc_answer", { sdp: pc.localDescription });
            } catch (err) {
              console.warn("Failed to handle buddy call offer:", err);
              endWithReason("Connection failed", true);
            }
            return;
          }
          case "webrtc_answer": {
            const pc = pcRef.current;
            if (!pc || !isCallerRef.current) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              await flushPendingCandidates(pc);
            } catch (err) {
              console.warn("Failed to handle buddy call answer:", err);
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
          default:
            return;
        }
      },
      [endWithReason, flushPendingCandidates, phase, send, setupPeerConnection],
    );

    useImperativeHandle(ref, () => ({ startCall, handleSignal }), [startCall, handleSignal]);

    if (phase === "idle") return null;

    return (
      <View
        className="absolute inset-0 z-50 items-center justify-center"
        style={{ backgroundColor: "rgba(10, 8, 12, 0.96)" }}
      >
        {phase === "active" ? (
          <>
            {remoteStreamUrl ? (
              <RTCView
                streamURL={remoteStreamUrl}
                style={{ position: "absolute", inset: 0 }}
                objectFit="cover"
              />
            ) : (
              <View className="items-center">
                <Text style={{ color: "#fff", fontFamily: fonts.body }} className="text-sm font-semibold">
                  Waiting for {buddyAlias}&apos;s video…
                </Text>
              </View>
            )}

            {localStreamUrl && !isCameraOff && (
              <RTCView
                streamURL={localStreamUrl}
                mirror
                objectFit="cover"
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
                }}
              />
            )}

            <View className="absolute bottom-14 flex-row items-center gap-5">
              <TouchableOpacity
                onPress={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  localStreamObjRef.current
                    ?.getAudioTracks()
                    .forEach((track) => (track.enabled = !next));
                }}
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: isMuted ? "#fff" : "rgba(255,255,255,0.18)" }}
              >
                <Ionicons name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? "#111" : "#fff"} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={endCall}
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.danger }}
              >
                <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const next = !isCameraOff;
                  setIsCameraOff(next);
                  localStreamObjRef.current
                    ?.getVideoTracks()
                    .forEach((track) => (track.enabled = !next));
                }}
                className="w-14 h-14 rounded-full items-center justify-center"
                style={{ backgroundColor: isCameraOff ? "#fff" : "rgba(255,255,255,0.18)" }}
              >
                <Ionicons
                  name={isCameraOff ? "videocam-off" : "videocam"}
                  size={22}
                  color={isCameraOff ? "#111" : "#fff"}
                />
              </TouchableOpacity>
            </View>
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
              {buddyAlias} is calling
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: fonts.body }} className="text-xs mb-8">
              Video and audio start only after you accept.
            </Text>
            <View className="flex-row items-center gap-6">
              <TouchableOpacity
                onPress={declineCall}
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.danger }}
              >
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={acceptCall}
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.success }}
              >
                <Ionicons name="videocam" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ) : phase === "outgoing" ? (
          <View className="items-center px-8">
            <Text style={{ color: "#fff", fontFamily: fonts.heading }} className="text-lg font-black mb-1.5">
              Calling {buddyAlias}…
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontFamily: fonts.body }} className="text-xs mb-8">
              Waiting for them to accept
            </Text>
            <TouchableOpacity
              onPress={() => endWithReason("Call canceled", true)}
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.danger }}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : phase === "connecting" ? (
          <View className="items-center px-8">
            {localStreamUrl && (
              <RTCView
                streamURL={localStreamUrl}
                mirror
                objectFit="cover"
                style={{ width: 120, height: 160, borderRadius: 18, marginBottom: 20 }}
              />
            )}
            <Text style={{ color: "#fff", fontFamily: fonts.heading }} className="text-sm font-black mb-6">
              Connecting…
            </Text>
            <TouchableOpacity
              onPress={endCall}
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.danger }}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={{ color: "#fff", fontFamily: fonts.body }} className="text-sm font-semibold">
            {endedReason}
          </Text>
        )}
      </View>
    );
  },
);
