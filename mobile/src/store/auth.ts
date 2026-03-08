// src/store/auth.ts
// Zustand store pour l'état d'authentification et l'utilisateur courant

import { create } from "zustand";
import { saveApiKey, clearApiKey, getCurrentUser } from "@/lib/api";
import { logoutFromRevenueCat } from "@/lib/purchases";
import { sentrySetUser } from "@/lib/sentry";
import type { User } from "@/types/api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isPro: boolean;

  setUser: (user: User) => Promise<void>;
  upgradeToPro: () => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isPro: false,

  setUser: async (user: User) => {
    await saveApiKey(user.api_key);
    set({
      user,
      isAuthenticated: true,
      isPro: user.plan === "pro",
    });
    sentrySetUser({ id: user.privy_id, email: user.email });
  },

  /** Optimistically mark the user as Pro (called right after successful purchase). */
  upgradeToPro: () => {
    const { user } = get();
    if (!user) return;
    set({ user: { ...user, plan: "pro" }, isPro: true });
  },

  /** Re-fetch the user record from the backend to sync plan status. */
  refreshUser: async () => {
    try {
      const user = await getCurrentUser();
      set({ user, isPro: user.plan === "pro" });
    } catch {
      // Non-critical — silently ignore
    }
  },

  logout: async () => {
    await clearApiKey();
    await logoutFromRevenueCat();
    sentrySetUser(null);
    set({
      user: null,
      isAuthenticated: false,
      isPro: false,
    });
  },
}));
