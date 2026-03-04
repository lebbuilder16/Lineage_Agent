"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";

// NEXT_PUBLIC_PRIVY_APP_ID must be set in Vercel env vars.
// Without a valid App ID, Privy will not initialise (AuthGate handles this with a timeout).
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

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

  // ALWAYS render PrivyProvider — skipping it causes usePrivy() hooks (AuthGate,
  // WalletButton) to crash because they're called outside the provider tree.
  // Use a placeholder when the real App ID isn't baked in yet; Privy will simply
  // fail to initialise and AuthGate's 6s timeout will show the login button.
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID || "placeholder-app-id"}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#c8f135",
          logo: "/favicon.ico",
        },
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </PrivyProvider>
  );
}
