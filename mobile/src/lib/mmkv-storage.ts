/**
 * MMKV-based storage for React Query persistence.
 * ~30x faster than AsyncStorage for reads/writes.
 */
import { MMKV } from 'react-native-mmkv';

export const mmkv = new MMKV({ id: 'lineage-query-cache' });

/**
 * AsyncStorage-compatible adapter for @tanstack/query-async-storage-persister.
 * MMKV is synchronous but the persister expects async — we wrap with Promise.resolve.
 */
export const mmkvStorageAdapter = {
  getItem: (key: string): Promise<string | null> => {
    const value = mmkv.getString(key);
    return Promise.resolve(value ?? null);
  },
  setItem: (key: string, value: string): Promise<void> => {
    mmkv.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    mmkv.delete(key);
    return Promise.resolve();
  },
};
