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

  // If App ID is missing, skip PrivyProvider entirely to avoid silent crash —
  // AuthGate will time out and show the login button.
  if (!PRIVY_APP_ID) {
    console.warn("[Lineage] NEXT_PUBLIC_PRIVY_APP_ID is not set. Auth will be unavailable.");
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
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
