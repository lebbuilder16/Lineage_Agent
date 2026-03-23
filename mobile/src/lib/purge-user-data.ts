/**
 * Purge ALL user-scoped data from memory and AsyncStorage.
 * Called on logout AND before switching to a different user account
 * to prevent cross-account data leaks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient } from './query-client';

export async function purgeUserData(): Promise<void> {
  // ── 1. React Query cache ──────────────────────────────────────────────
  queryClient.clear();

  // ── 2. In-memory Zustand stores ───────────────────────────────────────
  const { useAlertsStore } = await import('../store/alerts');
  useAlertsStore.setState({ alerts: [], wsConnected: false });

  const { useHistoryStore } = await import('../store/history');
  useHistoryStore.setState({ investigations: [], hydrated: false });

  const { useInvestigateStore } = await import('../store/investigate');
  useInvestigateStore.getState().reset();

  const { useAgentStore } = await import('../store/agent');
  useAgentStore.getState().reset();

  const { useAgentPrefsStore } = await import('../store/agent-prefs');
  useAgentPrefsStore.setState({
    alertOnDeployerLaunch: true, alertOnHighRisk: true, autoInvestigate: false,
    dailyBriefing: true, briefingHour: 8, riskThreshold: 70,
    alertTypes: ['deployer_exit', 'bundle', 'sol_extraction', 'price_crash', 'cartel', 'operator_match', 'deployer_rug'],
    solExtractionMin: 20, sweepInterval: 7200, investigationDepth: 'standard',
    quietHoursStart: null, quietHoursEnd: null, hydrated: false,
  });

  const { useAlertPrefsStore } = await import('../store/alert-prefs');
  useAlertPrefsStore.persist.clearStorage();

  const { useOpenClawStore } = await import('../store/openclaw');
  useOpenClawStore.getState().reset();

  const { useBriefingStore } = await import('./openclaw-briefing');
  useBriefingStore.getState().clear();

  const { useSubscriptionStore } = await import('../store/subscription');
  useSubscriptionStore.getState().reset();

  const { resetNotificationDedup } = await import('./notifications');
  resetNotificationDedup();

  // ── 3. AsyncStorage — fixed keys ──────────────────────────────────────
  await Promise.all([
    AsyncStorage.removeItem('lineage-alerts'),
    AsyncStorage.removeItem('lineage_investigation_history'),
    AsyncStorage.removeItem('lineage_agent_prefs'),
    AsyncStorage.removeItem('lineage-alert-dedup'),
    AsyncStorage.removeItem('lineage-openclaw'),
    AsyncStorage.removeItem('lineage-alert-prefs'),
  ]).catch(() => {});

  // ── 4. AsyncStorage — dynamic per-mint keys ───────────────────────────
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const stale = allKeys.filter(
      (k) => k.startsWith('investigate-result:') || k.startsWith('agent-result:'),
    );
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
  } catch { /* best-effort */ }
}
