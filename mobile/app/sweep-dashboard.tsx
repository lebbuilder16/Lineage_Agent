import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { ChevronLeft, RefreshCw } from 'lucide-react-native';
import { tokens } from '../src/theme/tokens';
import { GlassCard } from '../src/components/ui/GlassCard';
import { useAuthStore } from '../src/store/auth';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

interface DashboardData {
  rescans_24h: number;
  flags_24h: Record<string, number>;
  top_flag_types: { type: string; count: number }[];
  flag_feedback: { useful: number; not_useful: number; snoozed: number };
  rpc_providers: Record<string, { state: string; total_calls: number; failed_calls: number; failure_rate: number }>;
  watched_tokens: number;
}

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

function ProviderCard({ name, data }: { name: string; data: { state: string; total_calls: number; failed_calls: number; failure_rate: number } }) {
  const stateColor = data.state === 'closed' ? tokens.secondary : data.state === 'half_open' ? tokens.risk.medium : tokens.risk.critical;
  return (
    <View style={styles.providerRow}>
      <View style={[styles.providerDot, { backgroundColor: stateColor }]} />
      <Text style={styles.providerName}>{name.replace('solana_rpc_fallback_', 'Fallback #').replace('solana_rpc', 'Primary')}</Text>
      <Text style={styles.providerCalls}>{data.total_calls} calls</Text>
      <Text style={[styles.providerRate, { color: data.failure_rate > 0.5 ? tokens.risk.critical : tokens.textTertiary }]}>
        {(data.failure_rate * 100).toFixed(0)}% fail
      </Text>
    </View>
  );
}

export default function SweepDashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiKey = useAuthStore((s) => s.apiKey);

  const loadData = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BASE_URL}/admin/sweep-dashboard`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalFlags = data ? Object.values(data.flags_24h).reduce((a, b) => a + b, 0) : 0;
  const totalFeedback = data ? data.flag_feedback.useful + data.flag_feedback.not_useful + data.flag_feedback.snoozed : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <ChevronLeft size={24} color={tokens.white100} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>SWEEP DASHBOARD</Text>
        <TouchableOpacity onPress={loadData} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <RefreshCw size={20} color={tokens.textSecondary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>Last 24 hours</Text>

        {loading ? (
          <ActivityIndicator color={tokens.secondary} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={{ alignItems: 'center', marginTop: 40, gap: 12 }}>
            <Text style={{ color: tokens.risk.critical, fontSize: 14 }}>{error}</Text>
            <TouchableOpacity onPress={loadData} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: tokens.glass10, borderRadius: 8 }}>
              <Text style={{ color: tokens.secondary }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            {/* Overview */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>OVERVIEW</Text>
              <StatRow label="Watched tokens" value={data.watched_tokens} />
              <StatRow label="Rescans (24h)" value={data.rescans_24h} />
              <StatRow label="Flags generated" value={totalFlags} />
              <StatRow label="Critical" value={data.flags_24h.critical ?? 0} color={tokens.risk.critical} />
              <StatRow label="Warning" value={data.flags_24h.warning ?? 0} color={tokens.risk.high} />
              <StatRow label="Info" value={data.flags_24h.info ?? 0} />
            </GlassCard>

            {/* Top flag types */}
            {data.top_flag_types.length > 0 && (
              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>TOP FLAGS</Text>
                {data.top_flag_types.slice(0, 5).map((f) => (
                  <StatRow key={f.type} label={f.type.replace(/_/g, ' ')} value={f.count} />
                ))}
              </GlassCard>
            )}

            {/* Feedback */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>FLAG FEEDBACK</Text>
              {totalFeedback > 0 ? (
                <>
                  <StatRow label="Useful" value={data.flag_feedback.useful} color={tokens.secondary} />
                  <StatRow label="Not useful" value={data.flag_feedback.not_useful} color={tokens.risk.critical} />
                  <StatRow label="Snoozed" value={data.flag_feedback.snoozed} color={tokens.risk.medium} />
                </>
              ) : (
                <Text style={styles.emptyText}>No feedback yet. Long-press a flag to rate it.</Text>
              )}
            </GlassCard>

            {/* RPC Providers */}
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>RPC PROVIDERS</Text>
              {Object.entries(data.rpc_providers)
                .filter(([k]) => k.startsWith('solana'))
                .map(([name, info]) => (
                  <ProviderCard key={name} name={name} data={info} />
                ))}
            </GlassCard>
          </>
        ) : (
          <Text style={styles.emptyText}>Failed to load dashboard data</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgMain },
  navbar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 12 },
  navTitle: { fontFamily: 'Lexend-Bold', fontSize: 14, color: tokens.white100, letterSpacing: 1.2 },
  scroll: { padding: 20, paddingBottom: 40 },
  subtitle: { fontFamily: 'Lexend-Regular', fontSize: 14, color: tokens.textTertiary, marginBottom: 20 },
  card: { marginBottom: 16 },
  sectionTitle: { fontFamily: 'Lexend-Medium', fontSize: 10, color: tokens.textTertiary, letterSpacing: 1.2, marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  statLabel: { fontFamily: 'Lexend-Regular', fontSize: 14, color: tokens.white60 },
  statValue: { fontFamily: 'Lexend-Medium', fontSize: 14, color: tokens.white100 },
  providerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  providerDot: { width: 8, height: 8, borderRadius: 4 },
  providerName: { fontFamily: 'Lexend-Medium', fontSize: 13, color: tokens.white100, flex: 1 },
  providerCalls: { fontFamily: 'Lexend-Regular', fontSize: 12, color: tokens.white60 },
  providerRate: { fontFamily: 'Lexend-Medium', fontSize: 12, width: 55, textAlign: 'right' },
  emptyText: { fontFamily: 'Lexend-Regular', fontSize: 13, color: tokens.textTertiary, textAlign: 'center', paddingVertical: 12 },
});
