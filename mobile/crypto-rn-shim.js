"use strict";
// crypto-rn-shim.js
// Provides a Node.js-compatible `crypto` interface for React Native.
// Needed by uuid v9 which calls `require('crypto').randomFillSync`.
// `global.crypto.getRandomValues` is polyfilled by 'react-native-get-random-values'
// (imported earlier in src/polyfills.ts / _layout.tsx).

function randomFillSync(buf) {
  const bytes = new Uint8Array(buf.byteLength ?? buf.length);
  global.crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes[i];
  return buf;
}

module.exports = {
  randomFillSync,
  getRandomValues: (buf) => global.crypto.getRandomValues(buf),
};
