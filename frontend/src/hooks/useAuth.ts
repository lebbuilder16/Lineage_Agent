"use client";

/**
 * useAuth — wraps Privy authentication + backend API key lifecycle.
 *
 * Flow:
 *   1. User clicks "Connect" → Privy login modal opens.
 *   2. On success, Privy provides `user` (privy_id, wallet, email).
 *   3. We POST /auth/login to the backend → receive api_key.
 *   4. api_key is stored in localStorage + React state for the session.
 */

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://lineage-agent.fly.dev";
const LS_KEY = "lineage:api_key";

export interface AuthUser {
  id: number;
  privy_id: string;
  wallet_address: string | null;
  email: string | null;
  plan: "free" | "pro";
  api_key: string;
}

export function useAuth() {
  const { ready, authenticated, user, login, logout: privyLogout } = usePrivy();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore API key from localStorage on mount
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setAuthUser(null);
      return;
    }

    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as AuthUser;
        // Quick sanity check — make sure it belongs to the current user
        if (parsed.privy_id === user?.id) {
          setAuthUser(parsed);
          return;
        }
      } catch {
        // corrupt cache — fall through to fresh login
      }
    }

    // Need to register / fetch API key from backend
    _registerWithBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, user?.id]);

  const _registerWithBackend = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const walletAddress =
        user.wallet?.address ??
        user.linkedAccounts?.find((a: { type: string; address?: string }) => a.type === "wallet")
          ?.address ??
        null;

      const emailAddress =
        user.email?.address ??
        user.linkedAccounts?.find(
          (a: { type: string; address?: string }) => a.type === "email"
        )?.address ??
        null;

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privy_id: user.id,
          wallet_address: walletAddress,
          email: emailAddress,
        }),
      });
      if (!res.ok) throw new Error(`Backend auth failed: ${res.status}`);
      const data = (await res.json()) as AuthUser;
      setAuthUser(data);
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const logout = useCallback(async () => {
    await privyLogout();
    setAuthUser(null);
    localStorage.removeItem(LS_KEY);
  }, [privyLogout]);

  return {
    ready,
    authenticated,
    authUser,
    apiKey: authUser?.api_key ?? null,
    loading,
    error,
    login,
    logout,
  };
}
