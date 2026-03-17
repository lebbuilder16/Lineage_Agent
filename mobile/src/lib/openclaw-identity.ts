// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Device Identity — Ed25519 keypair generation & signing
// Generates a persistent device identity stored in expo-secure-store.
// The gateway requires a signed device field in ConnectParams.
// ─────────────────────────────────────────────────────────────────────────────
import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import * as SecureStore from 'expo-secure-store';

// ─── Constants ───────────────────────────────────────────────────────────────

const SK_KEY = 'openclaw-device-sk';
const ID_KEY = 'openclaw-device-id';
const NONCE_BYTES = 16;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeviceIdentity {
  id: string;
  publicKey: string;   // base64
  signature: string;   // base64
  signedAt: string;    // ISO 8601
  nonce: string;       // base64 random 16 bytes
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a v4-style UUID using crypto.getRandomValues (Hermes-compatible). */
function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Set version 4 (0100) in byte 6
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant 10xx in byte 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Generate cryptographically random bytes. */
function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

/** Encode a string to UTF-8 bytes. */
function encodeUTF8(s: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(s);
}

// ─── Keypair persistence ─────────────────────────────────────────────────────

interface StoredKeypair {
  deviceId: string;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

/** Load or create the device keypair from secure storage. */
async function getOrCreateKeypair(): Promise<StoredKeypair> {
  const storedSk = await SecureStore.getItemAsync(SK_KEY);
  const storedId = await SecureStore.getItemAsync(ID_KEY);

  if (storedSk && storedId) {
    // Reconstruct keypair from stored secret key
    const secretKey = decodeBase64(storedSk);
    // Ed25519 secret keys in tweetnacl are 64 bytes (seed + public key appended)
    const publicKey = secretKey.slice(32);
    return { deviceId: storedId, secretKey, publicKey };
  }

  // First run — generate fresh keypair
  const keyPair = nacl.sign.keyPair();
  const deviceId = generateUUID();

  await SecureStore.setItemAsync(SK_KEY, encodeBase64(keyPair.secretKey));
  await SecureStore.setItemAsync(ID_KEY, deviceId);

  return {
    deviceId,
    secretKey: keyPair.secretKey,
    publicKey: keyPair.publicKey,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns a fresh DeviceIdentity for use in ConnectParams.device.
 *
 * The keypair is generated once and persisted; each call produces a new
 * nonce + timestamp + signature so every connection attempt is unique.
 *
 * Signed message format (UTF-8 bytes):
 *   <nonce_base64> + "." + <deviceId> + "." + <signedAt_ISO>
 */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const { deviceId, secretKey, publicKey } = await getOrCreateKeypair();

  const nonce = randomBytes(NONCE_BYTES);
  const nonceB64 = encodeBase64(nonce);
  const signedAt = new Date().toISOString();

  // Build the message: nonce_base64.deviceId.signedAt
  const message = encodeUTF8(`${nonceB64}.${deviceId}.${signedAt}`);
  const signature = nacl.sign.detached(message, secretKey);

  return {
    id: deviceId,
    publicKey: encodeBase64(publicKey),
    signature: encodeBase64(signature),
    signedAt,
    nonce: nonceB64,
  };
}
