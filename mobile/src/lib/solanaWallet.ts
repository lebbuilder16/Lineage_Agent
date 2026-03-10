// src/lib/solanaWallet.ts
// Phantom wallet deeplink protocol (NaCl box encryption)
// Docs: https://docs.phantom.app/phantom-deeplinks/provider-methods/connect

import nacl from "tweetnacl";
import bs58 from "bs58";

// ── Module-level ephemeral keypair ────────────────────────────────────────
// Kept alive across screen re-renders and app backgrounding (single flow).
// Cleared after a successful decryption or a new connect attempt.
let _dappKeypair: nacl.BoxKeyPair | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialises a new Phantom connect session.
 * Returns the URL to open (use Linking.openURL or Linking.canOpenURL first).
 * Call this once per connect attempt — it regenerates the ephemeral keypair.
 */
export function buildPhantomConnectURL(appScheme = "lineage"): string {
  // New keypair for every connect attempt
  _dappKeypair = nacl.box.keyPair();

  const dappPubKeyB58 = bs58.encode(_dappKeypair.publicKey);
  const nonce = bs58.encode(nacl.randomBytes(24));
  const redirect = encodeURIComponent(`${appScheme}://phantom-connect`);
  const appUrl = encodeURIComponent("https://lineageagent.io");

  return (
    `phantom://v1/connect` +
    `?dapp_encryption_public_key=${dappPubKeyB58}` +
    `&nonce=${nonce}` +
    `&redirect_link=${redirect}` +
    `&cluster=mainnet-beta` +
    `&app_url=${appUrl}`
  );
}

/**
 * Universal link fallback for Android when `phantom://` scheme is not registered.
 */
export function buildPhantomUniversalConnectURL(appScheme = "lineage"): string {
  if (!_dappKeypair) buildPhantomConnectURL(appScheme); // ensure keypair exists
  const dappPubKeyB58 = bs58.encode(_dappKeypair!.publicKey);
  const nonce = bs58.encode(nacl.randomBytes(24));
  const redirect = encodeURIComponent(`${appScheme}://phantom-connect`);
  const appUrl = encodeURIComponent("https://lineageagent.io");

  return (
    `https://phantom.app/ul/v1/connect` +
    `?dapp_encryption_public_key=${dappPubKeyB58}` +
    `&nonce=${nonce}` +
    `&redirect_link=${redirect}` +
    `&cluster=mainnet-beta` +
    `&app_url=${appUrl}`
  );
}

export type PhantomConnectResult =
  | { ok: true; publicKey: string; session: string }
  | { ok: false; error: string };

/**
 * Decrypts the callback URL parameters sent by Phantom after user approval.
 *
 * @param phantomEncPubKeyB58 - `phantom_encryption_public_key` query param
 * @param nonceB58            - `nonce` query param from Phantom callback
 * @param dataB58             - `data` query param from Phantom callback
 */
export function decryptPhantomResponse(
  phantomEncPubKeyB58: string,
  nonceB58: string,
  dataB58: string
): PhantomConnectResult {
  if (!_dappKeypair) {
    return { ok: false, error: "No active connect session — call buildPhantomConnectURL first." };
  }

  try {
    const phantomPubKey = bs58.decode(phantomEncPubKeyB58);
    const nonce = bs58.decode(nonceB58);
    const encryptedData = bs58.decode(dataB58);

    const decrypted = nacl.box.open(
      encryptedData,
      nonce,
      phantomPubKey,
      _dappKeypair.secretKey
    );

    if (!decrypted) {
      return { ok: false, error: "Decryption failed — mismatched keys or tampered data." };
    }

    const payload = JSON.parse(new TextDecoder().decode(decrypted)) as {
      public_key: string;
      session: string;
    };

    _dappKeypair = null; // clear after successful use
    return { ok: true, publicKey: payload.public_key, session: payload.session };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Unknown parse error." };
  }
}

/**
 * Returns true if the given URL is a Phantom connect callback.
 */
export function isPhantomCallback(url: string): boolean {
  return url.includes("phantom-connect");
}

/**
 * Parses query parameters from a Phantom callback URL.
 * Works with both `lineage://phantom-connect?...` and `lineage://phantom-connect/...` forms.
 */
export function parsePhantomCallbackParams(url: string): Record<string, string> {
  const questionMark = url.indexOf("?");
  if (questionMark === -1) return {};
  const queryString = url.slice(questionMark + 1);
  const result: Record<string, string> = {};
  for (const pair of queryString.split("&")) {
    const [key, value] = pair.split("=");
    if (key && value !== undefined) {
      result[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return result;
}
