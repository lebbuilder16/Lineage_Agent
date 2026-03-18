// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Device Identity — Ed25519 keypair + challenge-response signing
//
// Flow:
//   1. WS opens → server sends connect.challenge { nonce, ts }
//   2. App calls signDeviceIdentity(params) with server nonce
//   3. App sends connect frame with device field
//   4. Gateway verifies signature → approves or queues pairing request
//
// All crypto is pure JS — no native deps, no TextEncoder, no btoa/atob.
// ─────────────────────────────────────────────────────────────────────────────
import nacl from 'tweetnacl';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ─── Pure JS helpers (Hermes-safe — no Web APIs) ─────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += B64[(b0 >> 2) & 63];
    result += B64[((b0 << 4) | (b1 >> 4)) & 63];
    result += i + 1 < len ? B64[((b1 << 2) | (b2 >> 6)) & 63] : '=';
    result += i + 2 < len ? B64[b2 & 63] : '=';
  }
  return result;
}

function base64ToBytes(str: string): Uint8Array {
  const cleaned = str.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((cleaned.length * 3) / 4));
  let j = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const a = B64.indexOf(cleaned[i]);
    const b = B64.indexOf(cleaned[i + 1]);
    const c = i + 2 < cleaned.length ? B64.indexOf(cleaned[i + 2]) : 0;
    const d = i + 3 < cleaned.length ? B64.indexOf(cleaned[i + 3]) : 0;
    out[j++] = (a << 2) | (b >> 4);
    if (i + 2 < cleaned.length) out[j++] = ((b << 4) | (c >> 2)) & 255;
    if (i + 3 < cleaned.length) out[j++] = ((c << 6) | d) & 255;
  }
  return out.slice(0, j);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return base64ToBytes(padded);
}

/** UTF-8 string → Uint8Array (pure JS, no TextEncoder) */
function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const lo = str.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        c = ((c - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/** bytes → hex string (pure JS, no @noble/hashes dependency for this) */
function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// ─── SHA-256 (pure JS via @noble/hashes) ────────────────────────────────────

let sha256Fn: ((data: Uint8Array) => Uint8Array) | null = null;

function getSha256(): (data: Uint8Array) => Uint8Array {
  if (sha256Fn) return sha256Fn;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@noble/hashes/sha2');
    sha256Fn = mod.sha256;
    return sha256Fn!;
  } catch {
    // fallback: try sha256 directly
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@noble/hashes/sha256');
    sha256Fn = mod.sha256;
    return sha256Fn!;
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(getSha256()(bytes));
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SK_KEY = 'openclaw-device-sk';

// ─── Keypair persistence ──────────────────────────────────────────────────────

interface Keypair {
  secretKey: Uint8Array; // 64 bytes (seed + public)
  publicKey: Uint8Array; // 32 bytes
}

async function getOrCreateKeypair(): Promise<Keypair> {
  const stored = await SecureStore.getItemAsync(SK_KEY);
  if (stored) {
    const secretKey = base64UrlDecode(stored);
    const publicKey = secretKey.slice(32);
    return { secretKey, publicKey };
  }
  const kp = nacl.sign.keyPair();
  await SecureStore.setItemAsync(SK_KEY, base64UrlEncode(kp.secretKey));
  return { secretKey: kp.secretKey, publicKey: kp.publicKey };
}

// ─── Public types ─────────────────────────────────────────────────────────────

/** Fields sent in ConnectParams.device */
export interface DeviceIdentity {
  id: string;        // SHA-256(publicKey) as hex — 64 hex chars
  publicKey: string; // base64url-encoded 32-byte Ed25519 public key
  signature: string; // base64url-encoded Ed25519 signature
  signedAt: number;  // milliseconds since epoch (integer)
  nonce: string;     // server-issued nonce from connect.challenge
}

export interface SignParams {
  /** Server-issued nonce from the connect.challenge event */
  nonce: string;
  clientId: 'openclaw-android' | 'openclaw-ios' | 'node-host';
  clientMode: string;
  role: string;
  scopes: string[];
  /** Gateway auth token */
  token: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sign a device identity using the server-issued nonce.
 *
 * Payload format (v3):
 *   v3|{deviceId}|{clientId}|{mode}|{role}|{scopes,}|{signedAtMs}|{token}|{nonce}|{platform}|{deviceFamily}
 */
export async function signDeviceIdentity(params: SignParams): Promise<DeviceIdentity> {
  const { secretKey, publicKey } = await getOrCreateKeypair();

  // Device ID = SHA-256 of raw 32-byte public key, hex-encoded
  const deviceId = sha256Hex(publicKey);

  const signedAt = Date.now();
  const platform = Platform.OS; // 'ios' | 'android'

  const payload = [
    'v3',
    deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(signedAt),
    params.token,
    params.nonce,
    platform,
    'mobile', // deviceFamily
  ].join('|');

  const messageBytes = utf8Encode(payload);
  const signature = nacl.sign.detached(messageBytes, secretKey);

  return {
    id: deviceId,
    publicKey: base64UrlEncode(publicKey),
    signature: base64UrlEncode(signature),
    signedAt,
    nonce: params.nonce,
  };
}
