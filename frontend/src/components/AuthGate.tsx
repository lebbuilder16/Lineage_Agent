"use client";

/**
 * AuthGate — bloque l'accès aux pages protégées jusqu'à l'authentification Privy.
 * La page d'accueil "/" reste publique.
 */

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

// Routes accessibles sans connexion
const PUBLIC_PATHS = ["/"];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, authenticated, login } = usePrivy();
  const [timedOut, setTimedOut] = useState(false);

  // Fallback si Privy ne répond pas dans les 4 secondes
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [ready]);

  // Page publique → toujours accessible
  if (PUBLIC_PATHS.includes(pathname ?? "/")) return <>{children}</>;

  // Privy en cours d'initialisation → spinner
  if (!ready && !timedOut) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 rounded-full border-2 border-neon/30 border-t-neon animate-spin" />
      </div>
    );
  }

  // Non authentifié → mur de connexion
  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
        {/* Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neon text-black text-2xl font-black font-display mb-6">
          L
        </div>

        <h1 className="text-2xl font-bold font-display text-white mb-2">
          Accès réservé
        </h1>
        <p className="text-white/50 text-sm max-w-xs mb-8">
          Connecte ton wallet Solana ou utilise ton email pour accéder aux analyses Lineage.
        </p>

        <button
          onClick={login}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-neon text-black font-bold text-sm hover:bg-neon/90 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Se connecter
        </button>

        <p className="mt-6 text-xs text-white/20">
          Wallet Solana · Email · Accès gratuit
        </p>
      </div>
    );
  }

  // Authentifié → contenu normal
  return <>{children}</>;
}
