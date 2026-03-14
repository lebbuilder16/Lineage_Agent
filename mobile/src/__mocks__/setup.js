/**
 * Jest setup file for component tests.
 *
 * Root cause: vm.SourceTextModule is unavailable => supportsDynamicImport=false
 * => any require() from a lazy getter while isInsideTestCode=false throws.
 *
 * expo/src/winter/runtime.native.ts installs lazy getters for:
 *   TextDecoder, TextDecoderStream, TextEncoderStream, URL, URLSearchParams,
 *   __ExpoImportMetaRegistry, structuredClone
 *
 * Eagerly resolve each one AFTER the expo runtime has installed its lazy
 * getters (this file runs after the preset setupFiles but still in setup phase).
 * Using Object.defineProperty with configurable:true overwrites the lazy getter.
 */

// __ExpoImportMetaRegistry
Object.defineProperty(globalThis, '__ExpoImportMetaRegistry', {
  value: { url: null },
  writable: true,
  configurable: true,
  enumerable: false,
});

// structuredClone — use v8 for proper deep-clone semantics
;(function() {
  const sc = (obj) => {
    const v8 = require('v8');
    return v8.deserialize(v8.serialize(obj));
  };
  Object.defineProperty(globalThis, 'structuredClone', {
    value: sc,
    writable: true,
    configurable: true,
    enumerable: true,
  });
})();

// TextDecoder / TextEncoder
;(function() {
  const { TextDecoder, TextEncoder } = require('util');
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, writable: true, configurable: true, enumerable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, writable: true, configurable: true, enumerable: true });
})();

// URL / URLSearchParams
;(function() {
  const { URL, URLSearchParams } = require('url');
  Object.defineProperty(globalThis, 'URL', { value: URL, writable: true, configurable: true, enumerable: true });
  Object.defineProperty(globalThis, 'URLSearchParams', { value: URLSearchParams, writable: true, configurable: true, enumerable: true });
})();
