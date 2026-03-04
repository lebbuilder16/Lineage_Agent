"use client";

/**
 * Providers — wraps the app in QueryClientProvider + PrivyProvider.
 *
 * PrivyProvider is loaded via `dynamic({ ssr: false })` so it is NEVER rendered
 * during Next.js SSR / static generation.  This prevents the build-time crash:
 *   "Cannot initialize the Privy provider with an invalid Privy app ID"
 * which occurs when NEXT_PUBLIC_PRIVY_APP_ID is absent from the build env.
 *
 * Both AuthGate and WalletButton are also `ssr: false` (see layout.tsx), so
 * usePrivy() is never called server-side — no React-context mismatch.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

// PrivyProvider runs client-only — avoids SSR / build-time crash with no App ID.
const PrivyClientWrapper = dynamic(() => import("./PrivyClientWrapper"), {
  ssr: false,
});

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 5 * 60 * 1000,
          },
        },
      })
  );

  // QueryClientProvider is rendered immediately (SSR + client).
  // PrivyClientWrapper is client-only (ssr: false) — it wraps children in
  // PrivyProvider once the JS chunk loads.  During that brief loading window,
  // PrivyClientWrapper renders null but the page shell is already visible.
  return (
    <QueryClientProvider client={client}>
      <PrivyClientWrapper>{children}</PrivyClientWrapper>
    </QueryClientProvider>
  );
}
