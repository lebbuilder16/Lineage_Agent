import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

let _conn: Connection | null = null;
function getConnection(): Connection {
  if (!_conn) _conn = new Connection(RPC_URL, 'confirmed');
  return _conn;
}

export function useUsdcBalance(address?: string | null) {
  const { data: balance = null, isLoading, refetch } = useQuery<number | null>({
    queryKey: ['usdc-balance', address],
    queryFn: async () => {
      if (!address) return null;
      const conn = getConnection();
      const owner = new PublicKey(address);
      const resp = await conn.getParsedTokenAccountsByOwner(owner, { mint: USDC_MINT });
      if (!resp.value.length) return 0;
      let total = 0;
      for (const account of resp.value) {
        const info = account.account.data.parsed?.info;
        total += info?.tokenAmount?.uiAmount ?? 0;
      }
      return total;
    },
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return { balance, isLoading, refetch };
}
