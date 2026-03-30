import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { mmkvStorageAdapter } from './mmkv-storage';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24, // 24h — keep cached data longer for offline
    },
  },
});

/**
 * MMKV-backed persister for React Query.
 * Persists query cache to disk via MMKV (~30x faster than AsyncStorage).
 * On app restart, cached data is available immediately while fresh data loads.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: mmkvStorageAdapter,
  key: 'lineage-rq-cache',
  throttleTime: 2000, // batch writes every 2s to avoid thrashing
});
