// src/lib/pushNotifications.ts
// Gestion des push notifications FCM via Expo Notifications

import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerFcmToken } from "@/src/lib/api";

// True when running inside Expo Go rather than a standalone / dev build.
// Remote push notifications on Android are not supported in Expo Go SDK 53+.
const isExpoGo = Constants.executionEnvironment === "storeClient";

// Suppress expo-notifications import on Android Expo Go (SDK 53+) since the
// library itself throws a console error just from being imported in that env.
const isAndroidExpoGo = Platform.OS === "android" && isExpoGo;

type NotificationsModule = typeof import("expo-notifications");
let _Notifications: NotificationsModule | null = null;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (isAndroidExpoGo) return null;
  if (!_Notifications) {
    _Notifications = await import("expo-notifications");
  }
  return _Notifications;
}

// Eagerly initialize on supported platforms so setNotificationHandler runs
// before any notification can arrive.
if (!isAndroidExpoGo) {
  getNotifications().then((N) => {
    N?.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  });
}

/**
 * Demande la permission de notifications, récupère le token Expo/FCM
 * et l'enregistre auprès du backend.
 *
 * À appeler après que l'utilisateur soit connecté.
 * Ne lance pas d'exception — logs les erreurs silencieusement.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (isAndroidExpoGo) {
    console.warn(
      "[Push] Skipped — Android remote notifications are not supported in Expo Go (SDK 53+). Use a development build."
    );
    return null;
  }

  if (!Device.isDevice) {
    console.warn("[Push] Skipped — not a physical device");
    return null;
  }

  const N = await getNotifications();
  if (!N) return null;

  // ── 1. Vérifier/demander la permission
  const { status: existingStatus } = await N.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await N.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[Push] Permission denied");
    return null;
  }

  // ── 2. Configurer le canal Android
  if (Platform.OS === "android") {
    await N.setNotificationChannelAsync("default", {
      name: "Lineage Alerts",
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00FF9D",
      sound: "default",
    });
    await N.setNotificationChannelAsync("critical", {
      name: "Critical Alerts",
      importance: N.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500],
      lightColor: "#FF3B5C",
      sound: "default",
      bypassDnd: true,
    });
  }

  // ── 3. Récupérer l'Expo Push Token puis le FCM token natif
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const expoPushToken = await N.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const token = expoPushToken.data;
    console.info("[Push] Expo Push Token obtained:", token.slice(0, 30) + "…");

    // ── 4. Enregistrer auprès du backend
    await registerFcmToken(token);
    console.info("[Push] Token registered with backend ✓");
    return token;
  } catch (err) {
    console.warn("[Push] Failed to get/register push token:", err);
    return null;
  }
}

/**
 * Abonne un listener aux notifications reçues en foreground.
 * Retourne une fonction de nettoyage pour le useEffect.
 */
export function addNotificationReceivedListener(
  handler: (notification: import("expo-notifications").Notification) => void
): () => void {
  if (isAndroidExpoGo) return () => {};
  const N = _Notifications;
  if (!N) return () => {};
  const sub = N.addNotificationReceivedListener(handler);
  return () => sub.remove();
}

/**
 * Abonne un listener aux taps sur une notification (background/killed).
 * Retourne une fonction de nettoyage.
 */
export function addNotificationResponseListener(
  handler: (response: import("expo-notifications").NotificationResponse) => void
): () => void {
  if (isAndroidExpoGo) return () => {};
  const N = _Notifications;
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}

/**
 * Réinitialise le badge de l'icône de l'app.
 */
export async function clearBadge(): Promise<void> {
  const N = await getNotifications();
  await N?.setBadgeCountAsync(0);
}
