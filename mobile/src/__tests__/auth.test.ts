import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/auth';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockGetItem = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>;
const mockSetItem = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>;
const mockDeleteItem = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>;

beforeEach(() => {
  // Reset store to initial state
  useAuthStore.setState({
    apiKey: null,
    user: null,
    watches: [],
    scanCount: 0,
    hydrated: false,
  });
  jest.clearAllMocks();
});

describe('useAuthStore', () => {
  describe('hydrate()', () => {
    it('sets hydrated=true and loads key from SecureStore', async () => {
      mockGetItem.mockResolvedValueOnce('test-key-123');
      await useAuthStore.getState().hydrate();

      const { apiKey, hydrated } = useAuthStore.getState();
      expect(hydrated).toBe(true);
      expect(apiKey).toBe('test-key-123');
    });

    it('sets apiKey=null and hydrated=true when SecureStore returns null', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      await useAuthStore.getState().hydrate();

      const { apiKey, hydrated } = useAuthStore.getState();
      expect(hydrated).toBe(true);
      expect(apiKey).toBeNull();
    });

    it('sets hydrated=true even when SecureStore throws', async () => {
      mockGetItem.mockRejectedValueOnce(new Error('storage failure'));
      await useAuthStore.getState().hydrate();

      const { hydrated } = useAuthStore.getState();
      expect(hydrated).toBe(true);
    });
  });

  describe('setApiKey()', () => {
    it('calls SecureStore.setItemAsync when key is truthy', () => {
      mockSetItem.mockResolvedValueOnce(undefined);
      useAuthStore.getState().setApiKey('my-key');

      expect(mockSetItem).toHaveBeenCalledWith('lineage_api_key', 'my-key');
      expect(useAuthStore.getState().apiKey).toBe('my-key');
    });

    it('calls SecureStore.deleteItemAsync and clears state when key is null', () => {
      mockDeleteItem.mockResolvedValueOnce(undefined);
      useAuthStore.setState({ apiKey: 'old-key', user: { id: '1' } as any, watches: [{ id: 'w1' } as any] });
      useAuthStore.getState().setApiKey(null);

      expect(mockDeleteItem).toHaveBeenCalledWith('lineage_api_key');
      const state = useAuthStore.getState();
      expect(state.apiKey).toBeNull();
      expect(state.user).toBeNull();
      expect(state.watches).toEqual([]);
    });
  });

  describe('removeWatch()', () => {
    it('filters out the watch with the given id', () => {
      useAuthStore.setState({
        watches: [
          { id: 'a', mint: 'mint1' } as any,
          { id: 'b', mint: 'mint2' } as any,
          { id: 'c', mint: 'mint3' } as any,
        ],
      });
      useAuthStore.getState().removeWatch('b');

      const { watches } = useAuthStore.getState();
      expect(watches).toHaveLength(2);
      expect(watches.map((w) => w.id)).toEqual(['a', 'c']);
    });

    it('is a no-op when id does not exist', () => {
      useAuthStore.setState({ watches: [{ id: 'x', mint: 'mint1' } as any] });
      useAuthStore.getState().removeWatch('nonexistent');

      expect(useAuthStore.getState().watches).toHaveLength(1);
    });
  });

  describe('addWatch()', () => {
    it('prepends the new watch', () => {
      useAuthStore.setState({ watches: [{ id: 'existing' } as any] });
      useAuthStore.getState().addWatch({ id: 'new' } as any);

      const { watches } = useAuthStore.getState();
      expect(watches[0].id).toBe('new');
      expect(watches).toHaveLength(2);
    });
  });

  describe('incrementScanCount()', () => {
    it('increments by 1 each call', () => {
      useAuthStore.getState().incrementScanCount();
      useAuthStore.getState().incrementScanCount();

      expect(useAuthStore.getState().scanCount).toBe(2);
    });
  });
});
