/**
 * Unit tests for src/lib/purchases.ts
 * Verifies that _isConfigured() correctly reflects the module-level flag.
 * RC_IOS_KEY is read at module load time, so tests reload the module via
 * jest.resetModules() to test different env var scenarios.
 */

jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    setLogLevel: jest.fn(),
    configure: jest.fn(),
    logIn: jest.fn().mockResolvedValue({ customerInfo: {}, created: false }),
    logOut: jest.fn().mockResolvedValue({}),
    getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }),
  },
  LOG_LEVEL: { DEBUG: "DEBUG" },
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

beforeEach(() => {
  jest.resetModules(); // force fresh module load — jest.mock() registrations survive
  jest.clearAllMocks();
});

describe("initRevenueCat — no API key", () => {
  it("does NOT call Purchases.configure when API key is empty", () => {
    delete (process.env as any).EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    delete (process.env as any).EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RC = require("react-native-purchases").default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initRevenueCat } = require("@/src/lib/purchases");
    initRevenueCat("user123");
    expect(RC.configure).not.toHaveBeenCalled();
  });
});

describe("initRevenueCat — with API key", () => {
  it("calls Purchases.configure with the api key", () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_test_key";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RC = require("react-native-purchases").default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initRevenueCat } = require("@/src/lib/purchases");
    initRevenueCat("user_abc");
    expect(RC.configure).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "appl_test_key" })
    );
    delete (process.env as any).EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  });

  it("passes appUserID to Purchases.configure", () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_test_key";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RC = require("react-native-purchases").default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initRevenueCat } = require("@/src/lib/purchases");
    initRevenueCat("user_abc");
    expect(RC.configure).toHaveBeenCalledWith(
      expect.objectContaining({ appUserID: "user_abc" })
    );
    delete (process.env as any).EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  });
});

describe("fetchCurrentOffering — not configured", () => {
  it("returns null when SDK not configured", async () => {
    delete (process.env as any).EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fetchCurrentOffering } = require("@/src/lib/purchases");
    const result = await fetchCurrentOffering();
    expect(result).toBeNull();
  });
});
