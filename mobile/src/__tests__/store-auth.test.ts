/**
 * Unit tests for the Zustand auth store.
 * Verifies initial state, setUser, logout, and isAuthenticated flag.
 */

// Mock native modules — auth store imports @/lib/purchases which loads RC
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    setLogLevel: jest.fn(),
    configure: jest.fn(),
    logIn: jest.fn().mockResolvedValue({ customerInfo: {}, created: false }),
    logOut: jest.fn().mockResolvedValue({}),
  },
  LOG_LEVEL: { DEBUG: "DEBUG" },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// auth.ts imports from "@/lib/api" which maps to src/lib/api
jest.mock("@/lib/api", () => ({
  getCurrentUser: jest.fn().mockResolvedValue(null),
  saveApiKey: jest.fn().mockResolvedValue(undefined),
  clearApiKey: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/purchases", () => ({
  logoutFromRevenueCat: jest.fn().mockResolvedValue(undefined),
}));

import { useAuthStore } from "@/src/store/auth";
import type { User } from "@/src/types/api";

const fakeUser: User = {
  id: "u1",
  privy_id: "privy_123",
  email: "test@example.com",
  wallet_address: null,
  plan: "free",
  api_key: "test-key",
  created_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null, isPro: false });
});

describe("auth store — initial state", () => {
  it("starts unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("starts with null user", () => {
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe("auth store — setUser", () => {
  it("sets isAuthenticated to true", async () => {
    await useAuthStore.getState().setUser(fakeUser);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it("stores the user object", async () => {
    await useAuthStore.getState().setUser(fakeUser);
    expect(useAuthStore.getState().user).toEqual(fakeUser);
  });

  it("stores the correct email", async () => {
    await useAuthStore.getState().setUser(fakeUser);
    expect(useAuthStore.getState().user?.email).toBe("test@example.com");
  });

  it("stores the plan", async () => {
    await useAuthStore.getState().setUser(fakeUser);
    expect(useAuthStore.getState().user?.plan).toBe("free");
  });
});

describe("auth store — logout", () => {
  it("resets isAuthenticated to false", async () => {
    await useAuthStore.getState().setUser(fakeUser);
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("resets user to null", async () => {
    await useAuthStore.getState().setUser(fakeUser);
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
