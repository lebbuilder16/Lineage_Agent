// src/store/auth.ts
// Zustand store pour l'état d'authentification et l'utilisateur courant

import { create } from "zustand";
import { saveApiKey, clearApiKey } from "@/lib/api";
import type { User } from "@/types/api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isPro: boolean;

  setUser: (user: User) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
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
  },

  logout: async () => {
    await clearApiKey();
    set({
      user: null,
      isAuthenticated: false,
      isPro: false,
    });
  },
}));
