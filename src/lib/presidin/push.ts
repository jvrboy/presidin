/**
 * PRESIDIN — Push Notifications (Firebase Cloud Messaging + Capacitor)
 *
 * For mobile (iOS/Android) push notifications:
 *   1. Create a Firebase project at https://console.firebase.google.com
 *   2. Add an iOS app + Android app to the project
 *   3. Download google-services.json (Android) + GoogleService-Info.plist (iOS)
 *   4. Place them in the native project folders after `npx cap add ios/android`
 *   5. Fill in firebase.config.json with your Firebase credentials
 *   6. Run the app — push permission will be requested on first launch
 *
 * For web push (PWA):
 *   1. Generate VAPID keys: npx web-push generate-vapid-keys
 *   2. Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in .env
 *   3. Subscribe to push via the Web Push API
 */

interface PushConfig {
  firebase: {
    apiKey?: string;
    projectId?: string;
    messagingSenderId?: string;
    appId?: string;
  };
}

let firebaseConfig: PushConfig | null = null;

try {
  // Loaded at build time — user must fill in firebase.config.json
  firebaseConfig = require("../../../firebase.config.json");
} catch {
  firebaseConfig = null;
}

export function isPushConfigured(): boolean {
  return Boolean(firebaseConfig?.firebase?.apiKey && firebaseConfig?.firebase?.projectId);
}

export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  // Web Push API
  if ("Notification" in window) {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  // Capacitor PushNotifications plugin (loaded on native)
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === "prompt") {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== "granted") return false;
      await PushNotifications.register();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function sendPushToTopic(topic: string, payload: {
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<boolean> {
  if (!isPushConfigured()) return false;
  // In production, this would call the Firebase Admin SDK to send a message
  // to a topic (e.g. "signals") or a specific device token.
  // For now, this is a stub that logs the intent.
  console.log(`[push] would send to topic "${topic}":`, payload);
  return true;
}
