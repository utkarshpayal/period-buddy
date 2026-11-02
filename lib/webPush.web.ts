/**
 * Web push for the web app / PWA, through Firebase Cloud Messaging (the same
 * FCM project the phones use, so the backend sends with firebase-admin as
 * usual). The page gets a browser token here and uploads it with
 * `platform: "web"` (lib/notifications.ts); public/sw.js shows each push and
 * reports taps back (lib/webPushData.ts). Off until the Firebase web config
 * is filled in (lib/webPushConfig.ts). iPhone/iPad only get web push once the
 * site is added to the Home Screen (iOS 16.4+).
 */
import { getFirebaseWebConfig } from "./webPushConfig";
import { parseWebPushTapParam, readWebPushMessage, WEB_PUSH_TAP_PARAM } from "./webPushData";

export type WebPushPermission = "granted" | "denied" | "default" | "unsupported";

const FIREBASE_APP_NAME = "nura-web-push";

function browserHasPush(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function webPushSupported(): boolean {
  return browserHasPush() && getFirebaseWebConfig() !== null;
}

/** iPhone/iPad Safari, not added to the Home Screen (no web push there). */
export function needsHomeScreenForPush(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  if (!getFirebaseWebConfig()) return false;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function webPushPermission(): WebPushPermission {
  if (!webPushSupported()) return "unsupported";
  return Notification.permission;
}

/** Shows the browser's prompt. Call straight from a tap (Safari needs one). */
export async function requestWebPushPermission(): Promise<WebPushPermission> {
  if (!webPushSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  // public/index.html registers sw.js in exported builds only; the Metro dev
  // server has none, so there's no web push in development.
  if (!existing) {
    if (__DEV__) return null;
    await navigator.serviceWorker.register("/sw.js");
  }
  return navigator.serviceWorker.ready;
}

/** This browser's FCM token, only when permission is already granted. */
export async function getWebPushToken(): Promise<string | null> {
  const config = getFirebaseWebConfig();
  if (!config || !browserHasPush() || Notification.permission !== "granted") return null;
  const registration = await serviceWorkerRegistration();
  if (!registration) return null;
  const [{ getApps, initializeApp }, { getMessaging, getToken, isSupported }] = await Promise.all([
    import("@firebase/app"),
    import("@firebase/messaging"),
  ]);
  if (!(await isSupported())) return null;
  const app =
    getApps().find((a) => a.name === FIREBASE_APP_NAME) ??
    initializeApp(
      {
        apiKey: config.apiKey,
        appId: config.appId,
        projectId: config.projectId,
        messagingSenderId: config.messagingSenderId,
      },
      FIREBASE_APP_NAME,
    );
  const token = await getToken(getMessaging(app), {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration,
  });
  return token || null;
}

let capturedTap: Record<string, unknown> | null = null;
let didCapture = false;

/**
 * A push tapped while no tab was open opens `/?nuraPush=…`. Read it once at
 * startup and clear it from the address bar.
 */
export function captureWebPushTap(): void {
  if (didCapture || typeof window === "undefined") return;
  didCapture = true;
  const search = window.location.search;
  if (!search.includes(WEB_PUSH_TAP_PARAM)) return;
  capturedTap = parseWebPushTapParam(search);
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  } catch {}
}

export function takeWebPushTap(): Record<string, unknown> | null {
  const tap = capturedTap;
  capturedTap = null;
  return tap;
}

/** Taps and arrivals reported by the service worker to an open tab. */
export function subscribeWebPushEvents(handlers: {
  onTap: (data: Record<string, unknown>) => void;
  onReceived: () => void;
}): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const listener = (event: MessageEvent) => {
    const message = readWebPushMessage(event.data);
    if (message?.kind === "tap") handlers.onTap(message.data);
    else if (message?.kind === "received") handlers.onReceived();
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
