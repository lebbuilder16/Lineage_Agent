// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Prefer react-native/browser distributions over Node.js (fixes uuid, jose, etc.)
config.resolver.mainFields = ["react-native", "browser", "main", "module"];
config.resolver.unstable_conditionNames = ["browser", "require", "default"];

// Redirect Node.js 'crypto' to a React Native shim so uuid v9+ works in Expo Go.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  crypto: path.resolve(__dirname, "crypto-rn-shim.js"),
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
