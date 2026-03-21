import { useReducer, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useLoginWithSiws } from '@privy-io/expo';
import {
  usePhantomDeeplinkWalletConnector,
  useBackpackDeeplinkWalletConnector,
  useDeeplinkWalletConnector,
} from '@privy-io/expo/connectors';
import type { User } from '@privy-io/api-types';
import { syncPrivyUser } from '../lib/privy-auth';
import { router } from 'expo-router';

// ── Constants ────────────────────────────────────────────────────────────────

const APP_URL = 'https://lineageagent.app';
const REDIRECT_URI = '/(auth)/login';
const CALLBACK_TIMEOUT_MS = 60_000;

// ── Types ────────────────────────────────────────────────────────────────────

export type WalletBrandId = 'phantom' | 'solflare' | 'backpack';

export type WalletAuthState =
  | { status: 'idle' }
  | { status: 'connecting'; walletId: WalletBrandId }
  | { status: 'awaiting_callback'; walletId: WalletBrandId }
  | { status: 'signing'; walletId: WalletBrandId; address: string }
  | { status: 'authenticating'; walletId: WalletBrandId; address: string }
  | { status: 'done'; walletId: WalletBrandId }
  | { status: 'error'; walletId: WalletBrandId; error: string };

type Action =
  | { type: 'CONNECT'; walletId: WalletBrandId }
  | { type: 'AWAITING_CALLBACK' }
  | { type: 'WALLET_CONNECTED'; address: string }
  | { type: 'SIGNING_COMPLETE' }
  | { type: 'AUTH_SUCCESS' }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' };

// ── Reducer ──────────────────────────────────────────────────────────────────

const initialState: WalletAuthState = { status: 'idle' };

function reducer(state: WalletAuthState, action: Action): WalletAuthState {
  switch (action.type) {
    case 'CONNECT':
      return { status: 'connecting', walletId: action.walletId };
    case 'AWAITING_CALLBACK':
      if (state.status !== 'connecting') return state;
      return { status: 'awaiting_callback', walletId: state.walletId };
    case 'WALLET_CONNECTED':
      if (state.status !== 'awaiting_callback' && state.status !== 'connecting') return state;
      return { status: 'signing', walletId: state.walletId, address: action.address };
    case 'SIGNING_COMPLETE':
      if (state.status !== 'signing') return state;
      return { status: 'authenticating', walletId: state.walletId, address: state.address };
    case 'AUTH_SUCCESS':
      if (state.status !== 'authenticating') return state;
      return { status: 'done', walletId: state.walletId };
    case 'ERROR':
      if (state.status === 'idle' || state.status === 'done') return state;
      return { status: 'error', walletId: (state as any).walletId, error: action.error };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFromLinkedAccounts(user: User) {
  let walletAddress: string | undefined;
  let emailAddress: string | undefined;

  for (const acct of user.linked_accounts) {
    if (!emailAddress && acct.type === 'email' && 'address' in acct) {
      emailAddress = acct.address;
    }
    if (!walletAddress && acct.type === 'wallet' && 'chain_type' in acct && acct.chain_type === 'solana') {
      walletAddress = acct.address;
    }
  }

  return { walletAddress, emailAddress };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useExternalWalletAuth() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Privy hooks ──────────────────────────────────────────────────────────
  const { generateMessage, login: siwsLogin } = useLoginWithSiws();

  const phantom = usePhantomDeeplinkWalletConnector({
    appUrl: APP_URL,
    redirectUri: REDIRECT_URI,
    autoReconnect: false,
  });

  const backpack = useBackpackDeeplinkWalletConnector({
    appUrl: APP_URL,
    redirectUri: REDIRECT_URI,
    autoReconnect: false,
  });

  const solflare = useDeeplinkWalletConnector({
    appUrl: APP_URL,
    redirectUri: REDIRECT_URI,
    baseUrl: 'https://solflare.com',
    encryptionPublicKeyName: 'solflare_encryption_public_key',
    autoReconnect: false,
  });

  const connectors = { phantom, solflare, backpack };

  // ── Cleanup helper ───────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // ── Watch for wallet connection (only the active connector) ──────────────
  useEffect(() => {
    if (state.status !== 'awaiting_callback' && state.status !== 'connecting') return;

    const walletId = state.walletId;
    const connector = connectors[walletId];

    if (connector.isConnected && connector.address) {
      dispatch({ type: 'WALLET_CONNECTED', address: connector.address });
    }
  }, [
    state.status,
    // Only watch the active connector's state
    ...(state.status === 'awaiting_callback' || state.status === 'connecting'
      ? [connectors[state.walletId].isConnected, connectors[state.walletId].address]
      : []),
  ]);

  // ── Run SIWS flow when wallet connects ───────────────────────────────────
  useEffect(() => {
    if (state.status !== 'signing') return;

    const { walletId, address } = state;
    const connector = connectors[walletId];
    const signal = abortRef.current?.signal;

    (async () => {
      try {
        if (signal?.aborted) return;

        const { message } = await generateMessage({
          wallet: { address },
          from: {
            domain: 'lineageagent.app',
            uri: 'https://lineageagent.app',
          },
        });

        if (signal?.aborted) return;

        const { signature } = await connector.signMessage(message);

        if (signal?.aborted) return;

        dispatch({ type: 'SIGNING_COMPLETE' });

        const user = await siwsLogin({
          signature,
          message,
          wallet: { walletClientType: walletId, connectorType: 'deeplink' },
        });

        if (signal?.aborted) return;

        const { walletAddress, emailAddress } = extractFromLinkedAccounts(user);
        const ok = await syncPrivyUser({
          id: user.id,
          wallet: walletAddress ? { address: walletAddress } : null,
          email: emailAddress ? { address: emailAddress } : null,
        });

        if (signal?.aborted) return;

        if (ok) {
          dispatch({ type: 'AUTH_SUCCESS' });
          router.replace('/(tabs)/radar');
        } else {
          dispatch({ type: 'ERROR', error: 'Could not sync your account.' });
        }
      } catch (err: any) {
        if (signal?.aborted) return;
        const msg = err?.message || 'Wallet authentication failed.';
        if (!msg.includes('cancel') && !msg.includes('dismiss')) {
          dispatch({ type: 'ERROR', error: msg });
        } else {
          dispatch({ type: 'RESET' });
        }
      }
    })();
  }, [state.status === 'signing' ? state.address : null]);

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(
    async (walletId: WalletBrandId) => {
      // Abort any in-flight flow
      cleanup();

      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: 'CONNECT', walletId });

      const connector = connectors[walletId];

      try {
        await connector.connect();

        if (controller.signal.aborted) return;

        // If connect returned synchronously with an address, the useEffect will pick it up.
        // Otherwise, we're awaiting the deep-link callback.
        dispatch({ type: 'AWAITING_CALLBACK' });

        // Start timeout
        timeoutRef.current = setTimeout(() => {
          if (!controller.signal.aborted) {
            dispatch({ type: 'ERROR', error: 'Connection timed out. Please try again.' });
          }
        }, CALLBACK_TIMEOUT_MS);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        const msg = err?.message || 'Wallet connection failed.';
        if (!msg.includes('cancel') && !msg.includes('dismiss')) {
          dispatch({ type: 'ERROR', error: msg });
        } else {
          dispatch({ type: 'RESET' });
        }
      }
    },
    [connectors, cleanup],
  );

  // ── Cancel ───────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    cleanup();
    dispatch({ type: 'RESET' });
  }, [cleanup]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  // ── Clear timeout once we leave awaiting_callback ────────────────────────
  useEffect(() => {
    if (state.status !== 'awaiting_callback' && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [state.status]);

  return { state, connect, cancel };
}
