"use client";

/**
 * PrivyClientWrapper — loaded with { ssr: false } from providers.tsx so that
 * PrivyProvider never executes during Next.js SSR / static generation.
 * This prevents the "invalid Privy app ID" crash at build time when
 * NEXT_PUBLIC_PRIVY_APP_ID is not available in the build environment.
 */

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export default function PrivyClientWrapper({ children }: { children: ReactNode }) {
  // If no valid App ID, render children without Privy.
  // AuthGate has a 6-second timeout and will surface a login button regardless.
  if (!PRIVY_APP_ID) {
    console.warn("[Lineage] NEXT_PUBLIC_PRIVY_APP_ID is not set. Auth unavailable.");
    return <>{children}</>;
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
      {children}
    </PrivyProvider>
  );
}
