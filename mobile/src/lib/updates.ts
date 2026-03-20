import * as Updates from 'expo-updates';

/**
 * Check for OTA updates and reload if available.
 * No-op in dev builds where Updates is not enabled.
 */
export async function checkForOTAUpdate(): Promise<void> {
  if (__DEV__) return;

  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // Silent fail — update will be retried on next launch
  }
}
