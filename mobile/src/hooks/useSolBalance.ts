import { useQuery } from '@tanstack/react-query';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const RPC_URL =
  process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

let _conn: Connection | null = null;
function getConnection(): Connection {
  if (!_conn) _conn = new Connection(RPC_URL, 'confirmed');
  return _conn;
}

export function useSolBalance(address?: string | null) {
  const { data: balance = null, isLoading, refetch } = useQuery<number | null>({
    queryKey: ['sol-balance', address],
    queryFn: async () => {
      if (!address) return null;
      const conn = getConnection();
      const lamports = await conn.getBalance(new PublicKey(address));
      return lamports / LAMPORTS_PER_SOL;
    },
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return { balance, isLoading, refetch };
}
