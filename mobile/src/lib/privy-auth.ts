import { authLogin, getMe } from './api';
import { useAuthStore } from '../store/auth';

interface PrivyUser {
  id: string;
  wallet?: { address: string } | null;
  email?: { address: string } | null;
}

export async function syncPrivyUser(privyUser: PrivyUser): Promise<boolean> {
  const { setApiKey, setUser } = useAuthStore.getState();

  try {
    const result = await authLogin(privyUser.id, {
      wallet_address: privyUser.wallet?.address,
      email: privyUser.email?.address,
    });

    if (!result.api_key) return false;

    setApiKey(result.api_key);

    try {
      const me = await getMe(result.api_key);
      setUser(me);
    } catch { /* best-effort */ }

    return true;
  } catch (err) {
    console.error('[privy-auth] syncPrivyUser failed:', err);
    return false;
  }
}

export async function updateWalletAddress(
  privyId: string,
  walletAddress: string,
): Promise<void> {
  const { apiKey, user } = useAuthStore.getState();
  if (!apiKey) return;
  try {
    await authLogin(privyId, {
      wallet_address: walletAddress,
      email: user?.email ?? undefined,
    });
  } catch (err) {
    console.error('[privy-auth] updateWalletAddress failed:', err);
  }
}

export function clearPrivySession(): void {
  useAuthStore.getState().setApiKey(null);
}
