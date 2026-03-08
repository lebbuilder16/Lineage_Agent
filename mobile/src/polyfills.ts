import "react-native-get-random-values";
import "@ethersproject/shims";

// Some libraries still read from the legacy global object in React Native.
if (typeof globalThis.crypto !== "undefined" && typeof global.crypto === "undefined") {
  (global as typeof globalThis & { crypto?: Crypto }).crypto = globalThis.crypto;
}
