// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Device Identity — Ed25519 keypair + challenge-response signing
//
// Flow:
//   1. WS opens → server sends connect.challenge { nonce, ts }
//   2. App calls signDeviceIdentity(params) with server nonce
//   3. App sends connect frame with device field
//   4. Gateway verifies signature → approves or queues pairing request
// ─────────────────────────────────────────────────────────────────────────────
import nacl from 'tweetnacl';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sha256 } = require('@noble/hashes/sha2') as { sha256: (data: Uint8Array) => Uint8Array };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { bytesToHex } = require('@noble/hashes/utils') as { bytesToHex: (bytes: Uint8Array) => string };

// ─── Constants ───────────────────────────────────────────────────────────────

const SK_KEY = 'openclaw-device-sk';

// ─── base64url (RFC 4648) ─────────────────────────────────────────────────────

export function base64UrlEncode(bytes: Uint8Array): string {
  // btoa operates on Latin-1 — convert byte by byte
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── SHA-256 (pure JS via @noble/hashes — no native deps) ───────────────────

function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

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

  const messageBytes = new TextEncoder().encode(payload);
  const signature = nacl.sign.detached(messageBytes, secretKey);

  return {
    id: deviceId,
    publicKey: base64UrlEncode(publicKey),
    signature: base64UrlEncode(signature),
    signedAt,
    nonce: params.nonce,
  };
}
