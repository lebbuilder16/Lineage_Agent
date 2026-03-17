import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import Svg, { Line, Rect, Text as SvgText, G, Path } from 'react-native-svg';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { ChevronLeft, ArrowRight, GitMerge, Wallet, ExternalLink } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useSolTrace } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';
import type { SolFlowEdge, SolFlowReport } from '../../src/types/api';

const ENTITY_COLORS: Record<string, string> = {
  cex: tokens.risk.medium,
  dex: tokens.secondary,
  bridge: tokens.risk.high,
  contract: tokens.risk.high,
  unknown: tokens.white35,
};

// ── SVG flow graph ────────────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const NODE_W = 102;
const NODE_H = 44;
const H_GAP = 52;
const V_GAP = 14;
const PAD = 16;

import { shortAddr } from '../../src/lib/format';

function nodeLabel(addr: string, label?: string | null) {
  return label || shortAddr(addr);
}

interface NodeInfo {
  addr: string;
  label?: string | null;
  entityType?: string | null;
  totalSol: number;
}

function buildGraphLayout(flows: SolFlowEdge[]) {
  // Map addr → column: hop-0 senders = col 0, hop-N receivers = col N+1
  const addrCol = new Map<string, number>();
  const colNodes = new Map<number, Map<string, NodeInfo>>();
  const addrMeta = new Map<string, { label?: string | null; entityType?: string | null; totalSol: number }>();

  const upsertNode = (col: number, addr: string, label?: string | null, entity?: string | null, sol = 0) => {
    if (!addrCol.has(addr)) addrCol.set(addr, col);
    if (!colNodes.has(col)) colNodes.set(col, new Map());
    const existing = colNodes.get(col)!.get(addr);
    colNodes.get(col)!.set(addr, {
      addr,
      label: label ?? existing?.label,
      entityType: entity ?? existing?.entityType,
      totalSol: (existing?.totalSol ?? 0) + sol,
    });
  };

  for (const f of flows) {
    upsertNode(f.hop, f.from_address, f.from_label, undefined, 0);
    upsertNode(f.hop + 1, f.to_address, f.to_label, f.entity_type, f.amount_sol);
  }

  // Build position lookup
  const nodePos = new Map<string, { x: number; y: number }>();
  const sortedCols = Array.from(colNodes.entries()).sort(([a], [b]) => a - b);
  for (const [col, nodes] of sortedCols) {
    Array.from(nodes.values()).forEach((n, row) => {
      nodePos.set(n.addr, {
        x: PAD + col * (NODE_W + H_GAP),
        y: PAD + row * (NODE_H + V_GAP),
      });
    });
  }

  const maxCol = sortedCols[sortedCols.length - 1]?.[0] ?? 0;
  const maxRows = Math.max(...Array.from(colNodes.values()).map((m) => m.size));
  const canvasW = Math.max(SCREEN_W - 32, PAD * 2 + (maxCol + 1) * (NODE_W + H_GAP));
  const canvasH = PAD * 2 + maxRows * (NODE_H + V_GAP);

  const allNodes: NodeInfo[] = Array.from(colNodes.values()).flatMap((m) => Array.from(m.values()));

  return { nodePos, canvasW, canvasH, allNodes, colNodes };
}

function FlowGraph({ flows }: { flows: SolFlowEdge[] }) {
  const { nodePos, canvasW, canvasH, allNodes } = useMemo(() => buildGraphLayout(flows), [flows]);

  if (!flows.length) return null;

  return (
    <View style={styles.graphWrap}>
      <View style={styles.graphHeader}>
        <GitMerge size={13} color={tokens.secondary} />
        <Text style={styles.graphLabel}>CAPITAL FLOW</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <Svg width={canvasW} height={canvasH}>
          {/* Edges */}
          {flows.map((f, i) => {
            const from = nodePos.get(f.from_address);
            const to = nodePos.get(f.to_address);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const color = ENTITY_COLORS[f.entity_type ?? 'unknown'] ?? tokens.white35;
            // Cubic bezier for smooth curves
            const cx = (x1 + x2) / 2;
            return (
              <G key={`e-${i}`}>
                <Path
                  d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
                  stroke={`${color}60`}
                  strokeWidth={Math.max(1, Math.min(4, f.amount_sol / 2))}
                  fill="none"
                />
              </G>
            );
          })}

          {/* Nodes */}
          {allNodes.map((node) => {
            const pos = nodePos.get(node.addr);
            if (!pos) return null;
            const color = ENTITY_COLORS[node.entityType ?? 'unknown'] ?? tokens.white35;
            const label = nodeLabel(node.addr, node.label);
            const solStr = node.totalSol > 0 ? `${node.totalSol.toFixed(1)} SOL` : null;

            return (
              <G key={node.addr}>
                <Rect
                  x={pos.x}
                  y={pos.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={`${color}15`}
                  stroke={`${color}60`}
                  strokeWidth={1}
                />
                <SvgText
                  x={pos.x + NODE_W / 2}
                  y={pos.y + (solStr ? NODE_H / 2 - 4 : NODE_H / 2 + 5)}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight="600"
                  fill={tokens.white100}
                >
                  {label}
                </SvgText>
                {solStr && (
                  <SvgText
                    x={pos.x + NODE_W / 2}
                    y={pos.y + NODE_H / 2 + 10}
                    textAnchor="middle"
                    fontSize={9}
                    fill={color}
                  >
                    {solStr}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SolTraceScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { data, isLoading, error, refetch } = useSolTrace(mint ?? '');
  const [showAllTerminal, setShowAllTerminal] = useState(false);

  const flows = data?.flows ?? [];
  const terminalWallets = data?.terminal_wallets ?? [];
  const visibleTerminal = showAllTerminal ? terminalWallets : terminalWallets.slice(0, 3);

  return (
    <View style={styles.container}>
      <AuroraBackground />
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
                    {data.cross_chain_exits!.map((exit, i) => (
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
      </View>
    </View>
  );
}

const FlowEdgeCard = React.memo(function FlowEdgeCard({ edge }: { edge: SolFlowEdge }) {
  const from = edge.from_label || shortAddr(edge.from_address);
  const to = edge.to_label || shortAddr(edge.to_address);
  const amount = edge.amount_sol ?? 0;
  const hop = edge.hop ?? 0;
  const entityType = edge.entity_type ?? 'unknown';
  const color = ENTITY_COLORS[entityType] ?? tokens.white35;

  return (
    <GlassCard style={styles.edgeCard} noPadding>
      <View style={styles.edgeInner}>
        <View style={styles.hopBadge}>
          <Text style={styles.hopText}>#{hop + 1}</Text>
        </View>
        <View style={styles.edgeFlow}>
          <Text style={styles.edgeAddr} numberOfLines={1}>{from}</Text>
          <ArrowRight size={12} color={tokens.white35} />
          <Text style={styles.edgeAddr} numberOfLines={1}>{to}</Text>
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
});

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

  padded: { paddingHorizontal: tokens.spacing.screenPadding },
  listContent: { paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 48 },

  // Summary
  summaryCard: { marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  rugTs: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.3,
  },

  // Graph
  graphWrap: { paddingHorizontal: PAD, paddingBottom: 8 },
  graphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  graphLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1,
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
    color: tokens.white35,
  },

  // Edge cards
  edgeCard: { marginBottom: 6 },
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
  edgeFlow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  edgeAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white100,
    flex: 1,
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
