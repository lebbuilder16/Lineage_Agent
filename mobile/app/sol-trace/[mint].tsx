import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { ChevronLeft, ArrowRight } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useSolTrace } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';
import type { SolFlowEdge } from '../../src/types/api';

const ENTITY_COLORS: Record<string, string> = {
  cex: tokens.risk.medium,
  bridge: tokens.secondary,
  contract: tokens.risk.high,
  unknown: tokens.white35,
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function SolTraceScreen() {
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { data, isLoading, error, refetch } = useSolTrace(mint ?? '');

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>SOL FLOW TRACE</Text>
          <View style={{ width: 24 }} />
        </View>

        {isLoading && (
          <View style={styles.loadingWrap}>
            <GlassCard><SkeletonBlock lines={3} /></GlassCard>
          </View>
        )}

        {!isLoading && error && (
          <View style={styles.loadingWrap}>
            <GlassCard>
              <Text style={styles.errorText}>Could not load SOL trace.</Text>
            </GlassCard>
          </View>
        )}

        {data && !isLoading && (
          <>
            {/* Summary */}
            <View style={styles.summaryWrap}>
              <GlassCard style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  {data.total_extracted_sol != null && (
                    <SummaryStat label="Total Extracted" value={`${data.total_extracted_sol.toFixed(2)} SOL`} />
                  )}
                  {data.hop_count != null && (
                    <SummaryStat label="Hops" value={String(data.hop_count)} />
                  )}
                  {data.known_cex_detected != null && (
                    <SummaryStat
                      label="CEX Detected"
                      value={data.known_cex_detected ? 'Yes' : 'No'}
                      color={data.known_cex_detected ? tokens.risk.medium : tokens.white60}
                    />
                  )}
                </View>
              </GlassCard>
            </View>

            {/* Flow edges */}
            <FlatList
              data={data.flows}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.primary} />}
              renderItem={({ item }) => <FlowEdgeCard edge={item} />}
              ListFooterComponent={
                data.cross_chain_exits?.length ? (
                  <GlassCard style={{ marginTop: 8 }}>
                    <Text style={styles.sectionTitle}>CROSS-CHAIN EXITS</Text>
                    {data.cross_chain_exits.map((exit, i) => (
                      <View key={i} style={styles.exitRow}>
                        <Text style={styles.exitBridge}>{exit.bridge_name}</Text>
                        <Text style={styles.exitChain}>→ {exit.destination_chain}</Text>
                        <Text style={styles.exitAmount}>{exit.amount_sol.toFixed(2)} SOL</Text>
                      </View>
                    ))}
                  </GlassCard>
                ) : null
              }
            />
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

function FlowEdgeCard({ edge }: { edge: SolFlowEdge }) {
  const from = edge.from_wallet ?? edge.from_address ?? '';
  const to = edge.to_wallet ?? edge.to_address ?? '';
  const amount = edge.amount_sol ?? edge.sol_amount ?? 0;
  const hop = edge.hop_index ?? edge.hop_number ?? 0;
  const entityType = edge.entity_type ?? 'unknown';
  const color = ENTITY_COLORS[entityType] ?? tokens.white35;

  return (
    <GlassCard style={styles.edgeCard} noPadding>
      <View style={styles.edgeInner}>
        <View style={styles.hopBadge}>
          <Text style={styles.hopText}>#{hop + 1}</Text>
        </View>
        <View style={styles.edgeFlow}>
          <Text style={styles.edgeAddr}>{shortAddr(from)}</Text>
          <ArrowRight size={14} color={tokens.white35} />
          <Text style={styles.edgeAddr}>{shortAddr(to)}</Text>
        </View>
        <View style={styles.edgeRight}>
          <Text style={styles.edgeAmount}>{amount.toFixed(2)} SOL</Text>
          <View style={[styles.entityBadge, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
            <Text style={[styles.entityText, { color }]}>{entityType.toUpperCase()}</Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
}

function SummaryStat({ label, value, color = tokens.white100 }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Lexend-Bold', fontSize: 16, color }}>{value}</Text>
      <Text style={{ fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.white60 }}>{label}</Text>
    </View>
  );
}

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
  loadingWrap: { paddingHorizontal: tokens.spacing.screenPadding },
  summaryWrap: { paddingHorizontal: tokens.spacing.screenPadding, marginBottom: 8 },
  summaryCard: {},
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  listContent: { paddingHorizontal: tokens.spacing.screenPadding, gap: 8, paddingBottom: 48 },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 10,
  },
  edgeCard: {},
  edgeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 10,
  },
  hopBadge: {
    width: 28,
    height: 28,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hopText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  edgeFlow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  edgeAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white100,
  },
  edgeRight: { alignItems: 'flex-end', gap: 4 },
  edgeAmount: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white100,
  },
  entityBadge: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  entityText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  exitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  exitBridge: { fontFamily: 'Lexend-SemiBold', fontSize: 13, color: tokens.white100, flex: 1 },
  exitChain: { fontFamily: 'Lexend-Regular', fontSize: 12, color: tokens.white60 },
  exitAmount: { fontFamily: 'Lexend-SemiBold', fontSize: 13, color: tokens.secondary },
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
