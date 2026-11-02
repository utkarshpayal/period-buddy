import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Linking, Platform } from 'react-native';
import { authApi, type AppNotification } from './api';
import { showPermissionModal } from './modal-host';
import { notificationStoreUrl, storeUrlCandidates } from './storeLink';
import {
  getWebPushToken,
  needsHomeScreenForPush,
  requestWebPushPermission,
  webPushPermission,
} from './webPush';

// Configure notification behavior for when the app is in the foreground.
// This module is imported statically by app/_layout.tsx (for
// resolveNotificationTarget), so the handler is in place before the first notification
// can arrive — without it, pushes received while the app is open are silently
// swallowed instead of showing a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Must match the channel id the backend targets in every FCM message
// (period-buddy-be's utils/fcm.js → ANDROID_CHANNEL_ID). A notification the
// system displays while the app is killed/backgrounded goes to this channel;
// if it doesn't exist yet, Android falls back to a low-importance
// "Miscellaneous" channel with no heads-up banner.
//
// Keep the id 'default'. Android locks a channel's settings after first
// creation, so on devices that already created an older silent 'default'
// channel, the sound below only applies after a reinstall.
export const ANDROID_CHANNEL_ID = 'default';

export async function ensureAndroidNotificationChannelAsync() {
  if (Platform.OS !== 'android') return;
  // The custom sound must be referenced by its bundled filename *with*
  // extension (expo-notifications copies ./assets/sounds/notification.wav into
  // res/raw/notification.wav at build time).
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'General',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    sound: 'notification.wav',
    enableVibrate: true,
  });
}

export type NotificationPermissionResult = { granted: boolean; canAskAgain: boolean };

/**
 * Asks for the OS notification permission (Android 13+ POST_NOTIFICATIONS
 * runtime prompt / iOS alert). Safe to call before login — it never touches
 * the backend. The Android channel is created first: on Android 13+ the
 * permission prompt is only shown once at least one channel exists.
 */
export async function requestNotificationPermissionAsync(): Promise<NotificationPermissionResult> {
  if (Platform.OS === 'web') {
    // Browser prompt (web push, lib/webPush.web.ts). Unsupported browsers
    // and an unconfigured build answer "not granted, can't ask".
    const permission = await requestWebPushPermission();
    return { granted: permission === 'granted', canAskAgain: permission === 'default' };
  }

  await ensureAndroidNotificationChannelAsync().catch(() => {});

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted || !existing.canAskAgain) {
    return { granted: existing.granted, canAskAgain: existing.canAskAgain };
  }
  const requested = await Notifications.requestPermissionsAsync();
  return { granted: requested.granted, canAskAgain: requested.canAskAgain };
}

/**
 * Registers this device for push for the signed-in user: makes sure the
 * permission is granted, reads the native FCM (Android) / APNs (iOS) device
 * token — the backend sends through firebase-admin directly, not the Expo
 * push service, so this must be getDevicePushTokenAsync, not
 * getExpoPushTokenAsync — and uploads it.
 *
 * Only call this with an authenticated session (components/auth-context.tsx
 * does, on every launch/login — which also covers a token that changed after
 * an app update or reinstall). Returns the token, or null if unavailable.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    // Runs on every launch without a tap, so it never prompts: browsers
    // (Safari especially) only allow the prompt from a tap. Onboarding's
    // finish screen and the Notifications switch ask instead.
    try {
      if (webPushPermission() !== 'granted') return null;
      const token = await getWebPushToken();
      if (!token) return null;
      await authApi.updateFcmToken(token, 'web');
      return token;
    } catch (error) {
      console.warn('Failed to register for web push:', error);
      return null;
    }
  }

  try {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    const { granted } = await requestNotificationPermissionAsync();
    if (!granted) return null;

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (typeof token !== 'string' || !token) return null;

    await authApi.updateFcmToken(token);
    return token;
  } catch (error) {
    console.error('Failed to register for push notifications:', error);
    return null;
  }
}

/**
 * This device's current native push token for the logout call, or null.
 * Never prompts (only reads the token when permission is already granted),
 * never throws, and gives up after `timeoutMs` so logout is never blocked.
 */
export async function getCurrentPushTokenQuietlyAsync(timeoutMs = 1500): Promise<string | null> {
  const lookup = (async () => {
    try {
      if (Platform.OS === 'web') return await getWebPushToken();
      if (!Device.isDevice) return null;
      const { granted } = await Notifications.getPermissionsAsync();
      if (!granted) return null;
      const { data: token } = await Notifications.getDevicePushTokenAsync();
      return typeof token === 'string' && token ? token : null;
    } catch {
      return null;
    }
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([lookup, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * For a Profile → Notifications toggle being switched on: the backend
 * preference alone does nothing if the OS permission is off, so ask for it
 * (or, once Android/iOS will no longer show the prompt, offer the app's
 * Settings page) and make sure this device's token is registered.
 */
export async function enablePushOnDeviceAsync(): Promise<void> {
  if (Platform.OS === 'web' && needsHomeScreenForPush()) {
    showPermissionModal({
      title: 'Add The Nura to your Home Screen',
      message:
        "On iPhone and iPad, notifications work once The Nura is on your Home Screen: tap Share, then Add to Home Screen, and open it from there.",
      icon: 'notifications-outline',
    });
    return;
  }
  // A browser without web push (or a build without the Firebase web config):
  // nothing to ask, and nothing blocked to point at.
  if (Platform.OS === 'web' && webPushPermission() === 'unsupported') return;
  try {
    const { granted, canAskAgain } = await requestNotificationPermissionAsync();
    if (!granted) {
      // Only point at Settings once the OS will no longer show the prompt; a
      // user who just declined (canAskAgain still true) made their choice.
      if (canAskAgain) return;
      showPermissionModal({
        title: 'Notifications are blocked',
        message:
          Platform.OS === 'web'
            ? "Allow notifications for this site in your browser's settings (the icon beside the address) to get period, ovulation and reminder alerts."
            : "Allow notifications for The Nura in your phone's Settings to get period, ovulation and reminder alerts.",
        icon: 'notifications-outline',
      });
      return;
    }
    await registerForPushNotificationsAsync();
  } catch {
    // Never block saving the preference on a permission/registration failure.
  }
}

/**
 * FCM can rotate a device token at any time (restore from backup, app data
 * cleared, Firebase-side refresh). Uploads the new one as soon as it arrives.
 * Returns the unsubscribe function.
 */
export function addPushTokenRefreshListener(): () => void {
  if (Platform.OS === 'web') return () => {};
  const subscription = Notifications.addPushTokenListener(({ data }) => {
    if (typeof data === 'string' && data) {
      authApi.updateFcmToken(data).catch(() => {});
    }
  });
  return () => subscription.remove();
}

// Plain in-app path, optionally with a query string: "/tracker",
// "/blogs?slug=abc". Mirrors period-buddy-be's utils/notificationRoute.js.
const IN_APP_ROUTE_PATTERN = /^\/[A-Za-z0-9\-_/()]*(\?[A-Za-z0-9\-_=&%.~+]*)?$/;

function toInAppRoute(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let candidate = value.trim();
  if (!candidate) return null;

  // Accept the app's own link shapes too, unwrapped to their in-app path:
  // thenura://tracker and https://thenura.care/app?deeplink=tracker.
  if (candidate.startsWith('thenura://')) {
    candidate = `/${candidate.slice('thenura://'.length)}`;
  } else if (/^https:\/\/(www\.)?thenura\.care\/app\?/i.test(candidate)) {
    const match = candidate.match(/[?&]deeplink=([^&#]+)/);
    if (!match) return null;
    try {
      candidate = `/${decodeURIComponent(match[1]).replace(/^\/+/, '')}`;
    } catch {
      return null;
    }
  }

  if (candidate.length > 200 || candidate.startsWith('//') || candidate.includes('..')) return null;
  return IN_APP_ROUTE_PATTERN.test(candidate) ? candidate : null;
}

/**
 * The explicit destination a notification payload asks for (`data.route`, or
 * `data.url` as an alias), validated to be an in-app path — anything else
 * (external URLs, malformed input) is ignored so a tap can never leave the app.
 */
export function explicitNotificationRoute(data: Record<string, unknown>): string | null {
  return toInAppRoute(data.route) ?? toInAppRoute(data.url);
}

// Where tapping a push notification (or its in-app banner) should land,
// keyed by Notification.type (see period-buddy-be's models/Notification.js
// — sent through FCM as a stringified `data.type` field, see utils/fcm.js).
// Split by role: a partner 'viewer' can't use the owner dashboard (its layout
// redirects viewers away), so each viewer entry points at the partner-view
// equivalent instead. Types with no unambiguous destination for a role
// (buddy_message, and system/admin broadcasts without an explicit route)
// fall back to the notifications list rather than risk navigating somewhere
// wrong.
const NOTIFICATION_TAP_ROUTES: Partial<Record<AppNotification['type'], string>> = {
  community_reply: '/(app)/(dashboard)/community',
  consultation_update: '/(app)/consultation',
  habit_reminder: '/(app)/habits',
  ovulation_reminder: '/(app)/(dashboard)/tracker',
  period_reminder: '/(app)/(dashboard)/tracker',
  reward_earned: '/(app)/(dashboard)/home',
  streak_bonus: '/(app)/(dashboard)/home',
};

const PARTNER_VIEWER_TAP_ROUTES: Partial<Record<AppNotification['type'], string>> = {
  community_reply: '/(app)/(partner-view)/forum',
  // Sent to the viewer when the owner updates their cycle log/settings
  // (createPartnerNotification) — the shared overview shows that data.
  partner_message: '/(app)/(partner-view)/overview',
  ovulation_reminder: '/(app)/(partner-view)/overview',
  period_reminder: '/(app)/(partner-view)/overview',
};

// Owner-dashboard screens a viewer can't open, mapped to their partner-view
// counterpart — applied to an explicit `data.route` from an admin push.
const VIEWER_ROUTE_EQUIVALENTS: Record<string, string> = {
  '/home': '/(app)/(partner-view)/overview',
  '/tracker': '/(app)/(partner-view)/overview',
  '/community': '/(app)/(partner-view)/forum',
  '/profile': '/(app)/(partner-view)/account',
  '/ai-chat': '/(app)/(partner-view)/voice',
};

// Explicit routes a viewer can open as-is (partner-view tabs plus the shared
// screens reachable from them). Any other owner screen with no equivalent
// above falls back to the notifications list.
const VIEWER_ALLOWED_ROUTES = new Set([
  '/overview',
  '/chat',
  '/voice',
  '/forum',
  '/account',
  '/notifications',
  '/app-lock',
]);

export const NOTIFICATIONS_LIST_ROUTE = '/(app)/notifications';

/**
 * Open a store link (Play Store / App Store), trying each of
 * storeUrlCandidates() in turn: on Android `market://` (the Play app) first,
 * then the https page. Resolves false when nothing could be opened.
 */
export async function openStoreLink(url: string): Promise<boolean> {
  for (const candidate of storeUrlCandidates(url, Platform.OS)) {
    try {
      await Linking.openURL(candidate);
      return true;
    } catch {
      // No handler for this one (e.g. market:// without the Play app): try the next.
    }
  }
  return false;
}

/**
 * A notification that carries a store link (admin "Update the app" pushes:
 * `data.storeUrl` / `data.iosStoreUrl`, allowlisted in lib/storeLink.ts)
 * opens the store instead of a screen. Returns true when it was such a
 * notification, so the caller skips in-app routing. Not on web.
 */
export function openNotificationStoreLink(data: Record<string, unknown> | null | undefined): boolean {
  if (Platform.OS === 'web') return false;
  const url = notificationStoreUrl(data, Platform.OS);
  if (!url) return false;
  void openStoreLink(url);
  return true;
}

/**
 * A consultation push opens that consultation's chat (`?id=`); a ringing
 * call (`kind: 'incoming_call'`) also joins the call (`&call=1`). Without a
 * valid id it opens the consultation screen itself.
 */
function consultationRoute(data: Record<string, unknown>, joinCall: boolean): string {
  const base = '/(app)/consultation';
  const id = typeof data.consultationId === 'string' ? data.consultationId : '';
  if (!/^[0-9a-f]{24}$/i.test(id)) return base;
  return `${base}?id=${id}${joinCall && data.kind === 'incoming_call' ? '&call=1' : ''}`;
}

/**
 * Where a tapped notification should land — a push (app/_layout.tsx, resolved
 * when the navigation actually happens, not at tap time, so a cold-start tap
 * uses the role of the account that ends up signed in) or a row in the in-app
 * list (app/(app)/notifications.tsx). `data` is the push's data payload / the
 * Notification doc's `data` plus its `type`. `joinCall: false` (the list, where
 * a ring is long over) opens a call notification's chat without joining.
 */
export function resolveNotificationTarget(
  data: Record<string, unknown>,
  isViewer: boolean,
  { joinCall = true }: { joinCall?: boolean } = {},
): string {
  // A store-link push (data.storeUrl) is opened by openNotificationStoreLink()
  // before this runs; if it couldn't be, the list is the safe landing.
  if (!explicitNotificationRoute(data) && notificationStoreUrl(data, Platform.OS)) return NOTIFICATIONS_LIST_ROUTE;
  // An explicit in-app route (admin pushes pick one in the Content Studio)
  // wins; explicitNotificationRoute() rejects anything that isn't an in-app path.
  let route = explicitNotificationRoute(data);
  // A list row for an old call ("… started a video call") opens the screen
  // without joining a call that may be long over.
  if (route && !joinCall) {
    route = route.replace(/([?&])call=1(&|$)/, (_, lead: string, tail: string) => (tail ? lead : '')) || route;
  }
  if (route) {
    if (!isViewer) return route;
    const bare = route.split('?')[0].replace(/\/\([^)]*\)/g, '') || '/';
    return (
      VIEWER_ROUTE_EQUIVALENTS[bare] ??
      (VIEWER_ALLOWED_ROUTES.has(bare) ? route : NOTIFICATIONS_LIST_ROUTE)
    );
  }

  const type = typeof data.type === 'string' ? (data.type as AppNotification['type']) : undefined;
  if (!type) return NOTIFICATIONS_LIST_ROUTE;
  if (isViewer) return PARTNER_VIEWER_TAP_ROUTES[type] ?? NOTIFICATIONS_LIST_ROUTE;
  // The daily 'log today' nudge (period-buddy-be's dailyNotificationScheduler)
  // is a `system` notification, but it's about the tracker.
  if (type === 'system' && data.kind === 'daily_nudge') return '/(app)/(dashboard)/tracker';
  if (type === 'consultation_update') return consultationRoute(data, joinCall);
  return NOTIFICATION_TAP_ROUTES[type] ?? NOTIFICATIONS_LIST_ROUTE;
}
