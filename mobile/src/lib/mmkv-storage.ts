/**
 * Persistent storage adapter for React Query cache.
 * Uses AsyncStorage (compatible with OTA updates).
 * MMKV requires a native rebuild — use this until next EAS build.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const persistStorageAdapter = {
  getItem: (key: string): Promise<string | null> => {
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string): Promise<void> => {
    return AsyncStorage.setItem(key, value).then(() => {});
  },
  removeItem: (key: string): Promise<void> => {
    return AsyncStorage.removeItem(key).then(() => {});
  },
};
