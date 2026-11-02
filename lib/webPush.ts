/**
 * Web push (browser / PWA). This is the phone build's stand-in: phones use
 * expo-notifications (lib/notifications.ts). The real code is webPush.web.ts.
 */

export type WebPushPermission = "granted" | "denied" | "default" | "unsupported";

export function webPushSupported(): boolean {
  return false;
}

/** iPhone/iPad Safari, not added to the Home Screen (no web push there). */
export function needsHomeScreenForPush(): boolean {
  return false;
}

export function webPushPermission(): WebPushPermission {
  return "unsupported";
}

export async function requestWebPushPermission(): Promise<WebPushPermission> {
  return "unsupported";
}

export async function getWebPushToken(): Promise<string | null> {
  return null;
}

export function captureWebPushTap(): void {}

export function takeWebPushTap(): Record<string, unknown> | null {
  return null;
}

export function subscribeWebPushEvents(_handlers: {
  onTap: (data: Record<string, unknown>) => void;
  onReceived: () => void;
}): () => void {
  return () => {};
}
