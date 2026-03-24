import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import Svg, { Line, Rect, Text as SvgText, G } from 'react-native-svg';
import { ChevronLeft, GitBranch } from 'lucide-react-native';
import { useLineageGraph } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';
import type { GraphNode, GraphEdge } from '../../src/types/api';

const SCREEN_W = Dimensions.get('window').width;
const NODE_W = 96;
const NODE_H = 52;
const H_GAP = 24;
const V_GAP = 72;
const PAD = 24;

function riskFill(score?: number): string {
  if (score == null) return `${tokens.secondary}25`;
  if (score >= 0.75) return `${tokens.risk.critical}25`;
  if (score >= 0.5) return `${tokens.risk.high}25`;
  if (score >= 0.25) return `${tokens.risk.medium}25`;
  return `${tokens.risk.low}25`;
}

function riskStroke(score?: number): string {
  if (score == null) return `${tokens.secondary}80`;
  if (score >= 0.75) return tokens.risk.critical;
  if (score >= 0.5) return tokens.risk.high;
  if (score >= 0.25) return tokens.risk.medium;
  return tokens.risk.low;
}

function computePositions(
  nodes: GraphNode[],
  edges: GraphEdge[],
  rootMint: string,
): { positions: Map<string, { x: number; y: number }>; canvasW: number; canvasH: number } {
  if (!nodes.length) return { positions: new Map(), canvasW: SCREEN_W, canvasH: 200 };

  // Build adjacency list (source → children)
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  // BFS from root to assign generation depth
  const rootNode = nodes.find((n) => n.mint === rootMint) ?? nodes[0];
  const gen = new Map<string, number>();
  const queue: string[] = rootNode ? [rootNode.id] : [];
  if (rootNode) gen.set(rootNode.id, 0);
  const visited = new Set(queue);

  while (queue.length) {
    const id = queue.shift()!;
    const g = gen.get(id) ?? 0;
    for (const child of adj.get(id) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        gen.set(child, g + 1);
        queue.push(child);
      }
    }
  }

  // Assign generation to nodes not reached by BFS
  for (const n of nodes) {
    if (!gen.has(n.id)) gen.set(n.id, n.generation ?? 0);
  }

  // Group nodes by generation
  const byGen = new Map<number, string[]>();
  for (const n of nodes) {
    const g = gen.get(n.id) ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(n.id);
  }

  // Compute canvas width based on widest generation
  let canvasW = SCREEN_W - 32;
  for (const ids of byGen.values()) {
    const needed = PAD * 2 + ids.length * NODE_W + (ids.length - 1) * H_GAP;
    if (needed > canvasW) canvasW = needed;
  }

  // Assign x,y per node
  const positions = new Map<string, { x: number; y: number }>();
  const sortedGens = Array.from(byGen.entries()).sort(([a], [b]) => a - b);

  for (const [g, ids] of sortedGens) {
    const totalW = ids.length * NODE_W + (ids.length - 1) * H_GAP;
    const startX = (canvasW - totalW) / 2;
    ids.forEach((id, i) => {
      positions.set(id, {
        x: startX + i * (NODE_W + H_GAP),
        y: PAD + g * (NODE_H + V_GAP),
      });
    });
  }

  const maxGen = sortedGens[sortedGens.length - 1]?.[0] ?? 0;
  const canvasH = PAD + (maxGen + 1) * (NODE_H + V_GAP);

  return { positions, canvasW, canvasH };
}

export default function FamilyTreeScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { data, isLoading, error } = useLineageGraph(mint ?? '');

  const { positions, canvasW, canvasH } = useMemo(() => {
    if (!data?.nodes.length) return { positions: new Map<string, { x: number; y: number }>(), canvasW: SCREEN_W - 32, canvasH: 200 };
    return computePositions(data.nodes, data.edges, data.root_mint);
  }, [data]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.safe}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <View style={styles.navCenter}>
            <GitBranch size={15} color={tokens.secondary} />
            <Text style={styles.navTitle}>FAMILY TREE</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={tokens.secondary} size="large" />
            <Text style={styles.statusText}>Tracing lineage…</Text>
          </View>
        )}

        {!isLoading && (error || !data || !data.nodes.length) && (
          <View style={styles.center}>
            <GitBranch size={48} color={tokens.white20} />
            <Text style={styles.emptyTitle}>No lineage graph</Text>
            <Text style={styles.emptySubtitle}>
              No connected tokens found for this mint address.
            </Text>
          </View>
        )}

        {data && data.nodes.length > 0 && !isLoading && (
          <>
            <Text style={styles.legend}>
              {data.nodes.length} token{data.nodes.length !== 1 ? 's' : ''} · {data.edges.length} connection{data.edges.length !== 1 ? 's' : ''}
            </Text>

            {/* Bidirectional scrollable SVG canvas */}
            <ScrollView
              style={styles.treeScroll}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ padding: 0 }}
              >
                <Svg width={canvasW} height={canvasH}>
                  {/* Edges — draw first so nodes render on top */}
                  {data.edges.map((edge, i) => {
                    const s = positions.get(edge.source);
                    const t = positions.get(edge.target);
                    if (!s || !t) return null;
                    return (
                      <Line
                        key={`e-${i}`}
                        x1={s.x + NODE_W / 2}
                        y1={s.y + NODE_H}
                        x2={t.x + NODE_W / 2}
                        y2={t.y}
                        stroke={tokens.borderSubtle}
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                      />
                    );
                  })}

                  {/* Nodes */}
                  {data.nodes.map((node) => {
                    const pos = positions.get(node.id);
                    if (!pos) return null;
                    const isRoot = node.mint === data.root_mint;
                    const label = (node.symbol ?? node.name ?? '').slice(0, 9) || '—';
                    const fill = riskFill(node.risk_score);
                    const stroke = riskStroke(node.risk_score);
                    const scoreLabel = node.risk_score != null
                      ? `${Math.round(node.risk_score * 100)}%`
                      : null;

                    return (
                      <G key={node.id}>
                        {/* Background rect */}
                        <Rect
                          x={pos.x}
                          y={pos.y}
                          width={NODE_W}
                          height={NODE_H}
                          rx={10}
                          ry={10}
                          fill={fill}
                          stroke={isRoot ? tokens.secondary : stroke}
                          strokeWidth={isRoot ? 2 : 1}
                        />
                        {/* Inner glow for root */}
                        {isRoot && (
                          <Rect
                            x={pos.x + 2}
                            y={pos.y + 2}
                            width={NODE_W - 4}
                            height={NODE_H - 4}
                            rx={8}
                            ry={8}
                            fill="none"
                            stroke={`${tokens.secondary}35`}
                            strokeWidth={1}
                          />
                        )}
                        {/* Symbol label */}
                        <SvgText
                          x={pos.x + NODE_W / 2}
                          y={pos.y + (scoreLabel ? NODE_H / 2 - 4 : NODE_H / 2 + 5)}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight="600"
                          fill={tokens.white100}
                        >
                          {label}
                        </SvgText>
                        {/* Risk score sub-label */}
                        {scoreLabel && (
                          <SvgText
                            x={pos.x + NODE_W / 2}
                            y={pos.y + NODE_H / 2 + 11}
                            textAnchor="middle"
                            fontSize={9}
                            fontWeight="400"
                            fill={stroke}
                          >
                            {scoreLabel}
                          </SvgText>
                        )}
                        {/* Transparent hit area for tap */}
                        <Rect
                          x={pos.x}
                          y={pos.y}
                          width={NODE_W}
                          height={NODE_H}
                          rx={10}
                          ry={10}
                          fill="transparent"
                          onPress={() => router.push(`/token/${node.mint}` as any)}
                        />
                      </G>
                    );
                  })}
                </Svg>
              </ScrollView>
            </ScrollView>

            {/* Legend */}
            <View style={styles.riskLegend}>
              {[
                { label: 'Low', color: tokens.risk.low },
                { label: 'Medium', color: tokens.risk.medium },
                { label: 'High', color: tokens.risk.high },
                { label: 'Critical', color: tokens.risk.critical },
              ].map((item) => (
                <View key={item.label} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
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
  navCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.5,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  statusText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white60,
    marginTop: 12,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
  },

  legend: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    textAlign: 'center',
    paddingVertical: 4,
    letterSpacing: 0.5,
  },

  treeScroll: { flex: 1 },

  riskLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
    paddingBottom: 24,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
});
