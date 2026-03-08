// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Exclude react-native Android/iOS source patch dirs that don't exist in dev containers
const rnPatchDir = path.resolve(__dirname, "node_modules/.react-native-tZu5T8ru");
config.watchFolders = (config.watchFolders ?? []).filter(
  (f) => !f.startsWith(rnPatchDir)
);
config.resolver = config.resolver ?? {};
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  new RegExp(rnPatchDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
];
// Prefer browser/react-native distributions over Node.js ones (fixes jose zlib etc.)
config.resolver.mainFields = ["react-native", "browser", "main", "module"];
// Use browser export condition so packages like jose resolve to browser dist
config.resolver.unstable_conditionNames = ["browser", "require", "default"];

module.exports = withNativeWind(config, { input: "./src/global.css" });
