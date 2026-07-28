import { Ionicons } from "@expo/vector-icons";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";

/**
 * Web counterpart of BuddyVideoCall.tsx. `react-native-webrtc` is native-only
 * (no web implementation, and its RTCView relies on a native view manager),
 * so this file — automatically picked by Metro for web builds instead of the
 * default `.tsx` — uses the browser's own built-in WebRTC APIs
 * (`navigator.mediaDevices.getUserMedia`, `window.RTCPeerConnection`) plus
 * plain DOM `<video>` elements instead. Both sides speak the same standard
 * WebRTC/SDP signaling protocol over the same buddy_<id> WebSocket room, so a
 * web caller and a native (iOS/Android) callee can call each other — this is
 * also the only way to test buddy video calling with two browser
 * tabs/windows without a native build.
 */

type Phase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

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
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const isCallerRef = useRef(false);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

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
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      pendingCandidatesRef.current = [];
      isCallerRef.current = false;
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setIsMuted(false);
      setIsCameraOff(false);
    }, []);

    useEffect(() => cleanup, [cleanup]);

    const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
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

    const setupPeerConnection = useCallback(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user" },
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) send("webrtc_ice_candidate", { candidate: event.candidate.toJSON() });
      };

      pc.ontrack = (event) => {
        const remote = event.streams[0];
        if (remote && remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setPhase("active");
        } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          setEndedReason("Call disconnected");
          cleanup();
          setPhase("ended");
        }
      };

      pcRef.current = pc;
      return pc;
    }, [cleanup, send]);

    const endWithReason = useCallback(
      (reason: string, notifyPeer: boolean) => {
        if (notifyPeer) send("call_end");
        cleanup();
        setEndedReason(reason);
        setPhase("ended");
      },
      [cleanup, send],
    );

    useEffect(() => {
      if (phase !== "ended") return;
      const timer = setTimeout(() => setPhase("idle"), 2200);
      return () => clearTimeout(timer);
    }, [phase]);

    const startCall = useCallback(() => {
      if (phase !== "idle") return;
      isCallerRef.current = true;
      setPhase("outgoing");
      send("call_request");
    }, [phase, send]);

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
              const offer = await pc.createOffer();
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
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />

            {!isCameraOff && (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{
                  position: "absolute",
                  top: 56,
                  right: 20,
                  width: 96,
                  height: 132,
                  borderRadius: 16,
                  objectFit: "cover",
                  border: "2px solid rgba(255,255,255,0.5)",
                  transform: "scaleX(-1)",
                }}
              />
            )}

            <View className="absolute bottom-14 flex-row items-center gap-5">
              <TouchableOpacity
                onPress={() => {
                  const next = !isMuted;
                  setIsMuted(next);
                  localStreamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
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
                  localStreamRef.current?.getVideoTracks().forEach((track) => (track.enabled = !next));
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
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: 120,
                height: 160,
                borderRadius: 18,
                marginBottom: 20,
                objectFit: "cover",
                transform: "scaleX(-1)",
              }}
            />
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
