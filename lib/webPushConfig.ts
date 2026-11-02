import Constants from "expo-constants";
import { resolveFirebaseWebConfig, type FirebaseWebConfig } from "./webPushData";

export type { FirebaseWebConfig };

/**
 * Firebase web app config for web push (the web app / PWA). Public values:
 * they ship in every page, like the Google OAuth client IDs. An
 * EXPO_PUBLIC_FIREBASE_WEB_* env var wins, else app.json's
 * `extra.firebaseWeb`. Web push stays off until every field is filled in
 * (Firebase console → Project settings → General → Your apps → the web app,
 * and Cloud Messaging → Web Push certificates for the VAPID key).
 */
export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  return resolveFirebaseWebConfig(
    Constants.expoConfig?.extra?.firebaseWeb as Partial<Record<keyof FirebaseWebConfig, unknown>> | undefined,
    {
      // Spelled out in full so Expo inlines them at build time.
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_WEB_API_KEY,
      appId: process.env.EXPO_PUBLIC_FIREBASE_WEB_APP_ID,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_WEB_PROJECT_ID,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_WEB_SENDER_ID,
      vapidKey: process.env.EXPO_PUBLIC_FIREBASE_WEB_VAPID_KEY,
    },
  );
}
