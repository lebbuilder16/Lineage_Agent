/**
 * RevenueCat integration — subscription purchase flow.
 *
 * Handles SDK initialization, user identification, offering fetches,
 * and purchase/restore flows. The backend remains authoritative for
 * plan state via webhooks — this module handles the client-side purchase UX.
 */

import { Platform } from 'react-native';
import Purchases, {
  type PurchasesOfferings,
  type PurchasesPackage,
  type CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';

// RevenueCat public API keys (safe to embed — not secrets)
const RC_API_KEY_IOS = process.env.EXPO_PUBLIC_RC_API_KEY_IOS ?? '';
const RC_API_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID ?? '';

let _initialized = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize RevenueCat SDK. Call once at app startup.
 * Must be called before any purchase/offering calls.
 */
export async function initRevenueCat(appUserId?: string): Promise<void> {
  if (_initialized) return;
  if (Platform.OS === 'web') return;

  const apiKey = Platform.OS === 'ios' ? RC_API_KEY_IOS : RC_API_KEY_ANDROID;
  if (!apiKey) {
    console.warn('[RevenueCat] No API key configured for', Platform.OS);
    return;
  }

  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({
      apiKey,
      appUserID: appUserId ?? undefined,
    });

    _initialized = true;
    console.log('[RevenueCat] Initialized for', Platform.OS);
  } catch (err) {
    console.error('[RevenueCat] Init failed:', err);
  }
}

/**
 * Identify the user after login. Links RevenueCat purchases to
 * the backend user ID so webhooks route correctly.
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!_initialized) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.error('[RevenueCat] logIn failed:', err);
  }
}

/**
 * Log out from RevenueCat (generates anonymous user).
 */
export async function logOutRevenueCat(): Promise<void> {
  if (!_initialized) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    console.error('[RevenueCat] logOut failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Offerings
// ---------------------------------------------------------------------------

/**
 * Fetch available offerings (plan packages) from RevenueCat.
 * Returns null if not configured or on error.
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!_initialized) return null;
  try {
    return await Purchases.getOfferings();
  } catch (err) {
    console.error('[RevenueCat] getOfferings failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Purchase
// ---------------------------------------------------------------------------

export type PurchaseResult =
  | { success: true; plan: string; customerInfo: CustomerInfo }
  | { success: false; cancelled: boolean; error?: string };

/**
 * Purchase a package. Returns the result with the active plan.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  if (!_initialized) {
    return { success: false, cancelled: false, error: 'RevenueCat not initialized' };
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const plan = resolveActivePlan(customerInfo);
    return { success: true, plan, customerInfo };
  } catch (err: any) {
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, cancelled: false, error: err.message ?? String(err) };
  }
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

/**
 * Restore purchases (e.g. after reinstall). Returns active plan.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!_initialized) {
    return { success: false, cancelled: false, error: 'RevenueCat not initialized' };
  }

  try {
    const customerInfo = await Purchases.restorePurchases();
    const plan = resolveActivePlan(customerInfo);
    return { success: true, plan, customerInfo };
  } catch (err: any) {
    return { success: false, cancelled: false, error: err.message ?? String(err) };
  }
}

// ---------------------------------------------------------------------------
// Customer info
// ---------------------------------------------------------------------------

/**
 * Get current customer info (active entitlements, plan).
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!_initialized) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.error('[RevenueCat] getCustomerInfo failed:', err);
    return null;
  }
}

/**
 * Resolve the active plan from RevenueCat entitlements.
 * Entitlement IDs should match: "pro", "elite"
 */
export function resolveActivePlan(info: CustomerInfo): string {
  const entitlements = info.entitlements.active;
  if ('elite' in entitlements) return 'elite';
  if ('pro' in entitlements) return 'pro';
  return 'free';
}

/**
 * Check if RevenueCat is initialized and ready.
 */
export function isReady(): boolean {
  return _initialized;
}
