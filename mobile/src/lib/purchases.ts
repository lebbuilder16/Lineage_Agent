// src/lib/purchases.ts
// RevenueCat in-app purchases layer
// Documentation: https://www.revenuecat.com/docs/getting-started/installation/reactnative

import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  LOG_LEVEL,
} from "react-native-purchases";

// ─── Constants ────────────────────────────────────────────────────────────────

/** RevenueCat entitlement identifier (configured in RC dashboard). */
export const RC_ENTITLEMENT = "pro";

/** Google Play API key — set EXPO_PUBLIC_REVENUECAT_ANDROID_KEY in .env.local */
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";
/** App Store API key — set EXPO_PUBLIC_REVENUECAT_IOS_KEY in .env.local */
const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Initialize RevenueCat SDK. Call once at app startup, AFTER the user is
 * identified (pass the user's API-side ID so RC links purchases to users).
 *
 * Safe to call multiple times — SDK is idempotent after configuration.
 */
export function initRevenueCat(appUserId?: string): void {
  const apiKey = Platform.OS === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;

  if (!apiKey) {
    // Not configured yet — no-op in dev without keys
    if (__DEV__) {
      console.warn("[RC] RevenueCat API key not configured. Set EXPO_PUBLIC_REVENUECAT_ANDROID_KEY.");
    }
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey, appUserID: appUserId ?? null });
}

// ─── Offerings ────────────────────────────────────────────────────────────────

/**
 * Fetch the current RevenueCat offering.
 * Returns null when SDK is not configured (no API key set).
 */
export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!_isConfigured()) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (e) {
    console.warn("[RC] fetchCurrentOffering error:", e);
    return null;
  }
}

// ─── Purchase ─────────────────────────────────────────────────────────────────

export type PurchaseResult =
  | { success: true; customerInfo: CustomerInfo }
  | { success: false; cancelled: boolean; error: string };

/**
 * Trigger a purchase for a given package.
 * Handles user-cancelled flow separately from errors.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (e: any) {
    // RC throws with `userCancelled: true` when user cancels
    if (e?.userCancelled) {
      return { success: false, cancelled: true, error: "Purchase cancelled" };
    }
    return {
      success: false,
      cancelled: false,
      error: e?.message ?? "Purchase failed",
    };
  }
}

// ─── Restore ──────────────────────────────────────────────────────────────────

/**
 * Restore prior purchases (required for App Store compliance).
 * Returns the refreshed CustomerInfo on success.
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!_isConfigured()) return null;
  try {
    return await Purchases.restorePurchases();
  } catch (e) {
    console.warn("[RC] restorePurchases error:", e);
    return null;
  }
}

// ─── Customer Info ────────────────────────────────────────────────────────────

/** Fetch latest CustomerInfo from RevenueCat servers. */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!_isConfigured()) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.warn("[RC] getCustomerInfo error:", e);
    return null;
  }
}

/**
 * Returns true if the user has an active "pro" entitlement.
 * Use this as the source of truth for gating features client-side.
 */
export function isPremiumActive(info: CustomerInfo): boolean {
  return !!info.entitlements.active[RC_ENTITLEMENT];
}

// ─── Identity ─────────────────────────────────────────────────────────────────

/**
 * Log in a user to RevenueCat by their app user ID.
 * Call this after authentication so purchases are linked to the backend user.
 */
export async function loginToRevenueCat(appUserId: string): Promise<void> {
  if (!_isConfigured()) return;
  try {
    await Purchases.logIn(appUserId);
  } catch (e) {
    console.warn("[RC] logIn error:", e);
  }
}

/** Log out of RevenueCat (reset to anonymous ID). Call on app logout. */
export async function logoutFromRevenueCat(): Promise<void> {
  if (!_isConfigured()) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn("[RC] logOut error:", e);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _isConfigured(): boolean {
  try {
    return !!(Purchases as any).isConfigured;
  } catch {
    return false;
  }
}
