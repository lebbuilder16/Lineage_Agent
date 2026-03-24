import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';
import { ENTITY_COLORS } from './FlowGraph';
import type { SolFlowEdge } from '../../types/api';

function shortAddr(addr: string) {
  return addr.length > 12 ? `${addr.slice(0, 5)}…${addr.slice(-4)}` : addr;
}

export interface FlowEdgeCardProps {
  edge: SolFlowEdge;
}

export const FlowEdgeCard = React.memo(function FlowEdgeCard({
  edge,
}: FlowEdgeCardProps) {
  const from = edge.from_label || shortAddr(edge.from_address);
  const to = edge.to_label || shortAddr(edge.to_address);
  const amount = edge.amount_sol ?? 0;
  const hop = edge.hop ?? 0;
  const entityType = edge.entity_type ?? 'unknown';
  const color = ENTITY_COLORS[entityType] ?? tokens.textTertiary;

  return (
    <GlassCard style={styles.edgeCard} noPadding>
      <View style={styles.edgeInner}>
        <View style={styles.hopBadge}>
          <Text style={styles.hopText}>#{hop + 1}</Text>
        </View>
        <View style={styles.edgeFlow}>
          <Text style={styles.edgeAddr} numberOfLines={1}>
            {from}
          </Text>
          <ArrowRight size={12} color={tokens.textTertiary} />
          <Text style={styles.edgeAddr} numberOfLines={1}>
            {to}
          </Text>
        </View>
        <View style={styles.edgeRight}>
          <Text style={styles.edgeAmount}>{amount.toFixed(2)} SOL</Text>
          <View
            style={[
              styles.entityBadge,
              { backgroundColor: `${color}15`, borderColor: `${color}30` },
            ]}
          >
            <Text style={[styles.entityText, { color }]}>
              {entityType.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
});

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
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
});
