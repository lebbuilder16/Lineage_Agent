import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText, G, Path } from 'react-native-svg';
import { GitMerge } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import type { SolFlowEdge } from '../../types/api';

// ── Entity colour map (shared across sol-trace) ─────────────────────────────
export const ENTITY_COLORS: Record<string, string> = {
  cex: tokens.risk.medium,
  dex: tokens.secondary,
  bridge: tokens.risk.high,
  contract: tokens.risk.high,
  unknown: tokens.textTertiary,
};

// ── SVG layout constants ────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const NODE_W = 102;
const NODE_H = 44;
const H_GAP = 52;
const V_GAP = 14;
const PAD = 16;

// ── Helpers ─────────────────────────────────────────────────────────────────
function shortAddr(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 5)}…${addr.slice(-4)}` : addr;
}

function nodeLabel(addr: string, label?: string | null) {
  return label || shortAddr(addr);
}

// ── Graph layout ────────────────────────────────────────────────────────────
interface NodeInfo {
  addr: string;
  label?: string | null;
  entityType?: string | null;
  totalSol: number;
}

function buildGraphLayout(flows: SolFlowEdge[]) {
  const addrCol = new Map<string, number>();
  const colNodes = new Map<number, Map<string, NodeInfo>>();

  const upsertNode = (
    col: number,
    addr: string,
    label?: string | null,
    entity?: string | null,
    sol = 0,
  ) => {
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

  const allNodes: NodeInfo[] = Array.from(colNodes.values()).flatMap((m) =>
    Array.from(m.values()),
  );

  return { nodePos, canvasW, canvasH, allNodes, colNodes };
}

// ── Component ───────────────────────────────────────────────────────────────
export interface FlowGraphProps {
  flows: SolFlowEdge[];
}

export function FlowGraph({ flows }: FlowGraphProps) {
  const { nodePos, canvasW, canvasH, allNodes } = useMemo(
    () => buildGraphLayout(flows),
    [flows],
  );

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
            const color =
              ENTITY_COLORS[f.entity_type ?? 'unknown'] ?? tokens.textTertiary;
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
            const color =
              ENTITY_COLORS[node.entityType ?? 'unknown'] ?? tokens.textTertiary;
            const label = nodeLabel(node.addr, node.label);
            const solStr =
              node.totalSol > 0 ? `${node.totalSol.toFixed(1)} SOL` : null;

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

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
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
    color: tokens.textTertiary,
    letterSpacing: 1,
  },
});
