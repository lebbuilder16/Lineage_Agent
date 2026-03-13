// src/lib/solanaWallet.ts
// Phantom wallet deeplink protocol (NaCl box encryption)
// Docs: https://docs.phantom.app/phantom-deeplinks/provider-methods/connect

import nacl from "tweetnacl";
import bs58 from "bs58";
import * as SecureStore from "expo-secure-store";

// ── SecureStore keys for ephemeral session persistence ────────────────────
// Written when buildPhantomConnectURL() is called so that if Phantom cold-starts
// the app via deep link, the keypair can be restored before decryption.
const _SK_KEY = "phantom_dapp_sk";
const _PK_KEY = "phantom_dapp_pk";
const _NONCE_KEY = "phantom_connect_nonce";

// ── Module-level session state ────────────────────────────────────────────
// Kept alive across screen re-renders and app backgrounding (single flow).
// Cleared after a successful decryption or a new connect attempt.
let _dappKeypair: nacl.BoxKeyPair | null = null;
// Shared nonce so the deep-link and universal-link fallback use identical bytes
// — prevents NaCl box decryption failure when canOpenURL triggers the fallback.
let _connectNonce: Uint8Array | null = null;

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialises a new Phantom connect session.
 * Returns the URL to open (use Linking.openURL or Linking.canOpenURL first).
 * Call this once per connect attempt — it regenerates the ephemeral keypair.
 */
export async function buildPhantomConnectURL(appScheme = "lineage"): Promise<string> {
  // New keypair + nonce for every connect attempt
  _dappKeypair = nacl.box.keyPair();
  _connectNonce = nacl.randomBytes(24);

  // Await the save so the keypair is guaranteed on disk before the caller
  // calls Linking.openURL() and the OS backgrounds/kills this app.
  await _savePhantomSession();

  const dappPubKeyB58 = bs58.encode(_dappKeypair.publicKey);
  const nonce = bs58.encode(_connectNonce);
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
export async function buildPhantomUniversalConnectURL(appScheme = "lineage"): Promise<string> {
  if (!_dappKeypair || !_connectNonce) await buildPhantomConnectURL(appScheme); // ensure session exists + saved
  const dappPubKeyB58 = bs58.encode(_dappKeypair!.publicKey);
  // Reuse the nonce from buildPhantomConnectURL — regenerating it would cause NaCl decryption failure
  const nonce = bs58.encode(_connectNonce!);
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
 * Self-healing: if the keypair was lost (JS reload, OS reclaim), restores from SecureStore.
 *
 * @param phantomEncPubKeyB58 - `phantom_encryption_public_key` query param
 * @param nonceB58            - `nonce` query param from Phantom callback
 * @param dataB58             - `data` query param from Phantom callback
 */
export async function decryptPhantomResponse(
  phantomEncPubKeyB58: string,
  nonceB58: string,
  dataB58: string
): Promise<PhantomConnectResult> {
  // If keypair was lost (cold-start, JS hot-reload, OS memory reclaim), restore it now.
  if (!_dappKeypair) {
    try {
      const sk = await SecureStore.getItemAsync(_SK_KEY);
      const pk = await SecureStore.getItemAsync(_PK_KEY);
      if (sk && pk) {
        _dappKeypair = { secretKey: bs58.decode(sk), publicKey: bs58.decode(pk) };
        const nonce = await SecureStore.getItemAsync(_NONCE_KEY);
        if (nonce) _connectNonce = bs58.decode(nonce);
        console.log("[Phantom] decryptPhantomResponse: restored keypair from SecureStore");
      } else {
        console.error("[Phantom] decryptPhantomResponse: SecureStore empty — sk:", !!sk, "pk:", !!pk);
      }
    } catch (e) {
      console.error("[Phantom] decryptPhantomResponse: SecureStore restore error:", e);
    }
  }

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

    _dappKeypair = null;
    _connectNonce = null; // clear session after successful use
    void _clearPhantomSession();
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

// ── SecureStore helpers (internal) ────────────────────────────────────────

async function _savePhantomSession(): Promise<void> {
  if (!_dappKeypair || !_connectNonce) return;
  await SecureStore.setItemAsync(_SK_KEY, bs58.encode(_dappKeypair.secretKey));
  await SecureStore.setItemAsync(_PK_KEY, bs58.encode(_dappKeypair.publicKey));
  await SecureStore.setItemAsync(_NONCE_KEY, bs58.encode(_connectNonce));
}

async function _clearPhantomSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(_SK_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(_PK_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(_NONCE_KEY).catch(() => {}),
  ]);
}

/**
 * Restores the ephemeral keypair + nonce from SecureStore.
 * Must be called in the phantom-connect screen before decryptPhantomResponse
 * when the app is cold-started by Phantom's redirect deep link.
 * No-op if the session is already in memory.
 */
export async function restorePhantomSession(): Promise<void> {
  if (_dappKeypair) return; // already live in memory
  try {
    const sk = await SecureStore.getItemAsync(_SK_KEY);
    const pk = await SecureStore.getItemAsync(_PK_KEY);
    const nonce = await SecureStore.getItemAsync(_NONCE_KEY);
    if (!sk || !pk || !nonce) {
      console.warn("[Phantom] restorePhantomSession: SecureStore missing keys", { sk: !!sk, pk: !!pk, nonce: !!nonce });
      return;
    }
    _dappKeypair = {
      secretKey: bs58.decode(sk),
      publicKey: bs58.decode(pk),
    };
    _connectNonce = bs58.decode(nonce);
  } catch (e) {
    console.error("[Phantom] restorePhantomSession failed:", e);
  }
}
