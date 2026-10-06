import type { ApiError } from "./api";

/**
 * Every video call in the app (doctor consultations, Period Buddy calls) runs
 * on the self-hosted Jitsi server (meet.thenura.care). These are the parts of
 * the call screen that don't touch React Native, shared by
 * components/JitsiCall.tsx (native, WebView) and its .web.tsx variant
 * (iframe), and unit-tested in lib/__tests__/jitsiCall.test.ts.
 *
 * The backend decides who may join and when (period-buddy-be's
 * utils/videoCall.js) and returns a short-lived token for this one room; the
 * Jitsi server refuses anyone without it.
 */

/** Jitsi's own toolbar is hidden: the call screen's buttons are the only controls. */
export const JITSI_CONFIG_OVERWRITE: Record<string, unknown> = {
  prejoinConfig: { enabled: false },
  toolbarButtons: [],
  disableInviteFunctions: true,
  disableDeepLinking: true,
  hideConferenceSubject: true,
  enableInsecureRoomNameWarning: false,
  disableThirdPartyRequests: true,
  p2p: { enabled: false },
  startWithAudioMuted: false,
  remoteVideoMenu: { disableGrantModerator: true, disablePrivateChat: true },
  securityUi: { hideLobbyButton: true },
  breakoutRooms: { hideAddRoomButton: true },
  recordingService: { enabled: false },
  liveStreaming: { enabled: false },
  localRecording: { disable: true },
  transcription: { enabled: false },
  giphy: { enabled: false },
  whiteboard: { enabled: false },
};

export const JITSI_INTERFACE_OVERWRITE: Record<string, unknown> = {
  SHOW_JITSI_WATERMARK: false,
  SHOW_BRAND_WATERMARK: false,
  MOBILE_APP_PROMO: false,
  SHOW_PROMOTIONAL_CLOSE_PAGE: false,
  HIDE_INVITE_MORE_HEADER: true,
};

/** IFrame API events the call screen listens to (names from jitsi-meet's external_api.js). */
export const JITSI_EVENTS = [
  "videoConferenceJoined",
  "videoConferenceLeft",
  "participantJoined",
  "participantLeft",
  "audioMuteStatusChanged",
  "videoMuteStatusChanged",
  "lowBandwidthModeChanged",
  "cameraError",
  "micError",
  "errorOccurred",
  "readyToClose",
] as const;

export type JitsiEventName = (typeof JITSI_EVENTS)[number];

/** The bits of an event payload the screen uses (everything else is dropped in the page). */
export type JitsiEventData = {
  id?: string;
  muted?: boolean;
  enabled?: boolean;
  error?: { name?: string; isFatal?: boolean };
  /** videoConferenceJoined only: everyone in the room, us included. */
  count?: number;
};

export type CallState = {
  joined: boolean;
  /** Ids of the other people in the room (the doctor, for the patient). */
  peers: string[];
  micMuted: boolean;
  cameraOff: boolean;
  audioOnly: boolean;
  /** Set when the browser/WebView refused the mic or camera inside the call. */
  deviceProblem: "mic" | "camera" | null;
  /** A fatal failure: the screen shows it with Rejoin (fresh token). */
  failure: string | null;
  /** The page finished hanging up (after our Leave). */
  closed: boolean;
};

export const initialCallState = (cameraAllowed = true): CallState => ({
  joined: false,
  peers: [],
  micMuted: false,
  cameraOff: !cameraAllowed,
  audioOnly: false,
  deviceProblem: null,
  failure: null,
  closed: false,
});

/**
 * One IFrame API event applied to the call state. `leaving` is true after
 * the user pressed Leave, so the resulting "left" isn't shown as a drop.
 */
export function applyJitsiEvent(
  state: CallState,
  name: string,
  data: JitsiEventData | null | undefined,
  leaving = false,
): CallState {
  const d = data ?? {};
  switch (name) {
    case "videoConferenceJoined": {
      const others = Math.max(0, (d.count ?? 1) - 1);
      const peers = state.peers.length ? state.peers : others > 0 ? ["present"] : [];
      return { ...state, joined: true, failure: null, peers };
    }
    case "participantJoined":
      if (!d.id) return state;
      return { ...state, peers: [...state.peers.filter((p) => p !== "present" && p !== d.id), d.id] };
    case "participantLeft":
      return { ...state, peers: state.peers.filter((p) => p !== "present" && p !== d.id) };
    case "audioMuteStatusChanged":
      return { ...state, micMuted: Boolean(d.muted) };
    case "videoMuteStatusChanged":
      return { ...state, cameraOff: Boolean(d.muted) };
    case "lowBandwidthModeChanged":
      return { ...state, audioOnly: Boolean(d.enabled) };
    case "micError":
      return { ...state, deviceProblem: "mic", micMuted: true };
    case "cameraError":
      return { ...state, deviceProblem: state.deviceProblem ?? "camera", cameraOff: true };
    case "errorOccurred": {
      if (!d.error?.isFatal || leaving) return state;
      const authProblem = /password|auth|notallowed|token/i.test(d.error.name ?? "");
      return {
        ...state,
        joined: false,
        peers: [],
        failure: authProblem
          ? "Your access to this call expired. Rejoin to continue."
          : "The call lost its connection. Rejoin to continue.",
      };
    }
    case "videoConferenceLeft":
      if (leaving) return { ...state, joined: false };
      return { ...state, joined: false, peers: [], failure: "You were disconnected from the call." };
    case "readyToClose":
      return leaving ? { ...state, closed: true } : state;
    default:
      return state;
  }
}

export type JoinProblem = {
  message: string;
  /** Worth a Retry button (network, too early, server hiccup). */
  canRetry: boolean;
};

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

/** An ApiError by shape (no runtime import of lib/api, so this stays testable under Node). */
const asApiError = (err: unknown): ApiError | null =>
  err instanceof Error && err.name === "ApiError" ? (err as ApiError) : null;

/** Why `consultationApi.joinVideo` was refused, in the patient's words. */
export function describeJoinError(err: unknown): JoinProblem {
  const apiError = asApiError(err);
  if (apiError && (apiError.kind === "network" || apiError.kind === "timeout")) {
    return { message: "You're offline. Check your connection and try again.", canRetry: true };
  }
  if (apiError) {
    const err = apiError;
    switch (err.code) {
      case "JOIN_WINDOW_NOT_OPEN": {
        const opensAt = typeof err.details?.opensAt === "string" ? formatTime(err.details.opensAt) : "";
        return {
          message: opensAt ? `The video room opens at ${opensAt}.` : err.message,
          canRetry: true,
        };
      }
      case "BUDDY_OFFLINE":
      case "BUDDY_CHAT_NOT_OPEN":
        return { message: err.message, canRetry: true };
      case "JOIN_WINDOW_CLOSED":
      case "CONSULTATION_NOT_LIVE":
      case "PAYMENT_REQUIRED":
        return { message: err.message, canRetry: false };
      default:
        break;
    }
    if (err.status === 503) {
      return { message: "Video calls are not available right now. Please use the chat.", canRetry: false };
    }
    if (err.status === 429 || err.kind === "server") return { message: err.message, canRetry: true };
    return { message: err.message, canRetry: false };
  }
  return { message: "Couldn't join the call. Please try again.", canRetry: true };
}

/** Whether the Join button should be on now, from the server's `videoCall` window. */
export function isJoinWindowOpen(
  videoCall: { joinOpensAt: string | null; joinClosesAt: string | null } | null | undefined,
  now = Date.now(),
): boolean {
  if (!videoCall) return false;
  const opens = videoCall.joinOpensAt ? new Date(videoCall.joinOpensAt).getTime() : null;
  const closes = videoCall.joinClosesAt ? new Date(videoCall.joinClosesAt).getTime() : null;
  if (opens !== null && now < opens) return false;
  if (closes !== null && now > closes) return false;
  return true;
}

// A hostname, optionally with a port (e.g. a local test server on meet.localtest.me:8443).
const isHostname = (domain: string) => /^[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?$/i.test(domain);

/**
 * The page the native WebView loads (with `baseUrl: https://<domain>`): it
 * pulls Jitsi's IFrame API from our server, embeds the room, forwards the
 * events above to React Native, and exposes `window.__nura.cmd(name, arg)`.
 * Values are JSON-encoded with `<` escaped, so nothing can close the script tag.
 */
export function buildJitsiHtml(options: {
  domain: string;
  roomName: string;
  jwt: string;
  displayName: string;
  startWithVideoMuted: boolean;
}): string {
  if (!isHostname(options.domain)) throw new Error("Invalid video server");
  const payload = JSON.stringify({
    domain: options.domain,
    roomName: options.roomName,
    jwt: options.jwt,
    displayName: options.displayName,
    events: JITSI_EVENTS,
    config: { ...JITSI_CONFIG_OVERWRITE, startWithVideoMuted: options.startWithVideoMuted },
    iface: JITSI_INTERFACE_OVERWRITE,
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body,#meet{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#17212E}</style>
</head><body><div id="meet"></div>
<script>
(function () {
  var cfg = ${payload};
  function post(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  window.addEventListener('online', function () { post({ type: 'network', online: true }); });
  window.addEventListener('offline', function () { post({ type: 'network', online: false }); });
  var s = document.createElement('script');
  s.src = 'https://' + cfg.domain + '/external_api.js';
  s.onerror = function () { post({ type: 'loadError' }); };
  s.onload = function () {
    try {
      var api = new JitsiMeetExternalAPI(cfg.domain, {
        roomName: cfg.roomName, jwt: cfg.jwt, parentNode: document.getElementById('meet'),
        width: '100%', height: '100%', configOverwrite: cfg.config,
        interfaceConfigOverwrite: cfg.iface, userInfo: { displayName: cfg.displayName }
      });
      window.__nura = { cmd: function (c, a) { if (a === undefined) api.executeCommand(c); else api.executeCommand(c, a); } };
      cfg.events.forEach(function (name) {
        api.addListener(name, function (d) {
          d = d || {};
          var data = { id: d.id, muted: d.muted, enabled: d.enabled,
            error: d.error ? { name: d.error.name, isFatal: d.error.isFatal } : undefined };
          if (name === 'videoConferenceJoined') { try { data.count = api.getNumberOfParticipants(); } catch (e) {} }
          post({ type: 'event', name: name, data: data });
        });
      });
    } catch (e) { post({ type: 'loadError' }); }
  };
  document.head.appendChild(s);
})();
</script></body></html>`;
}

/** One message of the existing (saved) chat, shown inside the call. */
export type CallChatMessage = {
  id: string;
  /** Sent by the person holding this phone. */
  mine: boolean;
  text: string;
  sentAt?: string;
  /** Didn't send (shown with a note; resend from the chat screen). */
  failed?: boolean;
};

/**
 * The consultation or buddy chat, passed into the call screen so people can
 * keep writing (links, prescriptions, "can you hear me?") without leaving the
 * call. Same messages, same API as the normal chat: everything is saved.
 */
export type CallChat = {
  messages: CallChatMessage[];
  onSend: (text: string) => void;
  /** False once the session is closed (sending would be refused). */
  canSend: boolean;
  /** A message is on its way: Send waits (the chat sends one at a time). */
  sending?: boolean;
  loading?: boolean;
};

/** Messages from the other person: drives the unread badge on the chat button. */
export const peerMessageCount = (messages: CallChatMessage[]) =>
  messages.reduce((n, m) => (m.mine ? n : n + 1), 0);
