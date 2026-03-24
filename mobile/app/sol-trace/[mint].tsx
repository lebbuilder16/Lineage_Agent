import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { ChevronLeft, GitMerge, ExternalLink, Wallet } from 'lucide-react-native';
import { FeatureGate } from '../../src/components/ui/FeatureGate';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { FlowGraph, FlowEdgeCard } from '../../src/components/sol-trace';
import { useSolTrace } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';
import { Breadcrumbs } from '../../src/components/investigate/Breadcrumbs';

// ── Summary stat ────────────────────────────────────────────────────────────
function SummaryStat({
  label,
  value,
  color = tokens.white100,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Lexend-Bold', fontSize: 16, color }}>{value}</Text>
      <Text style={{ fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.white60 }}>
        {label}
      </Text>
    </View>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────
export default function SolTraceScreen() {
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { data, isLoading, error, refetch } = useSolTrace(mint ?? '');
  const [showAllTerminal, setShowAllTerminal] = useState(false);

  const flows = data?.flows ?? [];
  const terminalWallets = data?.terminal_wallets ?? [];
  const visibleTerminal = showAllTerminal ? terminalWallets : terminalWallets.slice(0, 3);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.safe}>
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>SOL FLOW TRACE</Text>
          <View style={{ width: 24 }} />
        </View>

        <Breadcrumbs trail={[
          { label: `${mint?.slice(0, 6) ?? ''}…`, route: `/token/${mint}` },
          { label: 'SOL Trace', active: true },
        ]} />

        <FeatureGate feature="SOL Flow Trace" requiredPlan="pro">
        {isLoading && (
          <View style={styles.padded}>
            <GlassCard><SkeletonBlock lines={3} /></GlassCard>
          </View>
        )}

        {!isLoading && error && (
          <View style={styles.padded}>
            <GlassCard>
              <Text style={styles.errorText}>Could not load SOL trace.</Text>
            </GlassCard>
          </View>
        )}

        {data && !isLoading && (
          <FlashList
            data={flows}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.secondary} />
            }
            ListHeaderComponent={
              <>
                {/* Summary */}
                <GlassCard style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <SummaryStat
                      label="Extracted"
                      value={`${data.total_extracted_sol.toFixed(2)} SOL`}
                      color={tokens.accent}
                    />
                    {data.total_extracted_usd != null && (
                      <SummaryStat
                        label="USD Value"
                        value={`$${data.total_extracted_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        color={tokens.risk.high}
                      />
                    )}
                    <SummaryStat label="Hops" value={String(data.hop_count)} />
                    <SummaryStat
                      label="CEX"
                      value={data.known_cex_detected ? 'YES' : 'NO'}
                      color={data.known_cex_detected ? tokens.risk.medium : tokens.white60}
                    />
                  </View>
                  {data.rug_timestamp && (
                    <Text style={styles.rugTs}>
                      First extraction: {new Date(data.rug_timestamp).toLocaleDateString(undefined, {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  )}
                </GlassCard>

                {/* SVG Flow Graph */}
                {flows.length > 0 && (
                  <GlassCard style={{ paddingHorizontal: 0, paddingVertical: 12 }} noPadding>
                    <FlowGraph flows={flows} />
                  </GlassCard>
                )}

                {/* Section header for list */}
                {flows.length > 0 && (
                  <Text style={styles.sectionTitle}>
                    TRANSFER LOG ({flows.length})
                  </Text>
                )}

                {flows.length === 0 && (
                  <View style={styles.emptyWrap}>
                    <GitMerge size={40} color={tokens.white20} />
                    <Text style={styles.emptyText}>No flow data available</Text>
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => <FlowEdgeCard edge={item} />}
            ListFooterComponent={
              <>
                {/* Cross-chain exits */}
                {(data.cross_chain_exits?.length ?? 0) > 0 && (
                  <GlassCard style={{ marginTop: 8 }}>
                    <Text style={styles.sectionTitle}>CROSS-CHAIN EXITS</Text>
                    {(data.cross_chain_exits ?? []).map((exit, i) => (
                      <View key={i} style={styles.exitRow}>
                        <ExternalLink size={14} color={tokens.risk.high} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exitBridge}>{exit.bridge_name}</Text>
                          <Text style={styles.exitChain}>→ {exit.dest_chain}</Text>
                        </View>
                        <Text style={styles.exitAmount}>{exit.amount_sol.toFixed(2)} SOL</Text>
                      </View>
                    ))}
                  </GlassCard>
                )}

                {/* Terminal wallets */}
                {terminalWallets.length > 0 && (
                  <GlassCard style={{ marginTop: 8 }}>
                    <View style={styles.terminalHeader}>
                      <Wallet size={13} color={tokens.white60} />
                      <Text style={styles.sectionTitle}>TERMINAL WALLETS ({terminalWallets.length})</Text>
                    </View>
                    {visibleTerminal.map((addr, i) => (
                      <View key={i} style={styles.terminalRow}>
                        <Text style={styles.terminalAddr}>{addr}</Text>
                      </View>
                    ))}
                    {terminalWallets.length > 3 && (
                      <TouchableOpacity onPress={() => setShowAllTerminal((v) => !v)}>
                        <Text style={styles.showMore}>
                          {showAllTerminal ? 'Show less' : `Show ${terminalWallets.length - 3} more…`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </GlassCard>
                )}
              </>
            }
          />
        )}
        </FeatureGate>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 12,
  },
  navTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.5,
  },

  padded: { paddingHorizontal: tokens.spacing.screenPadding },
  listContent: { paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 48 },

  // Summary
  summaryCard: { marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  rugTs: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.3,
  },

  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },

  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.textTertiary,
  },

  // Cross-chain exits
  exitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  exitBridge: { fontFamily: 'Lexend-SemiBold', fontSize: 13, color: tokens.white100 },
  exitChain: { fontFamily: 'Lexend-Regular', fontSize: 12, color: tokens.white60 },
  exitAmount: { fontFamily: 'Lexend-SemiBold', fontSize: 13, color: tokens.risk.high },

  // Terminal wallets
  terminalHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  terminalRow: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  terminalAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  showMore: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
    marginTop: 10,
    textAlign: 'center',
  },

  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
