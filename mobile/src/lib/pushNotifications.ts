// src/lib/pushNotifications.ts
// Gestion des push notifications FCM via Expo Notifications

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerFcmToken } from "@/src/lib/api";

// True when running inside Expo Go rather than a standalone / dev build.
// Remote push notifications on Android are not supported in Expo Go SDK 53+.
const isExpoGo = Constants.executionEnvironment === "storeClient";

// setNotificationHandler covers local notifications on all platforms and
// remote notifications on iOS Expo Go / all dev builds. Skip on Android Expo Go
// where remote notification APIs are unavailable.
if (!(Platform.OS === "android" && isExpoGo)) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
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
  if (Platform.OS === "android" && isExpoGo) {
    console.warn(
      "[Push] Skipped — Android remote notifications are not supported in Expo Go (SDK 53+). Use a development build."
    );
    return null;
  }

  if (!Device.isDevice) {
    console.warn("[Push] Skipped — not a physical device");
    return null;
  }

  // ── 1. Vérifier/demander la permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.warn("[Push] Permission denied");
    return null;
  }

  // ── 2. Configurer le canal Android
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Lineage Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00FF9D",
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("critical", {
      name: "Critical Alerts",
      importance: Notifications.AndroidImportance.MAX,
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

    const expoPushToken = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    // Le token Expo commence par "ExponentPushToken[...]"
    // Pour FCM natif direct on peut aussi utiliser getDevicePushTokenAsync()
    // mais Expo's token works through Expo's push relay which wraps FCM.
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
  handler: (notification: Notifications.Notification) => void
): () => void {
  const sub = Notifications.addNotificationReceivedListener(handler);
  return () => sub.remove();
}

/**
 * Abonne un listener aux taps sur une notification (background/killed).
 * Retourne une fonction de nettoyage.
 */
export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}

/**
 * Réinitialise le badge de l'icône de l'app.
 */
export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}
