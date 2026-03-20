const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Privy SDK depends on `jose` which ships separate node/browser builds.
// Metro picks the node build by default, which uses Node-only crypto APIs.
// Force Metro to resolve the browser-compatible build instead.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jose' || moduleName.startsWith('jose/')) {
    const browserPath = moduleName.replace(/^jose/, 'jose/dist/browser');
    return context.resolveRequest(context, browserPath, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
