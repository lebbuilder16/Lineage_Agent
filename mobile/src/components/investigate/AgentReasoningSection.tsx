import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  Brain,
  Search,
  Package,
  ArrowRightLeft,
  User,
  Network,
  TrendingDown,
  Fingerprint,
  GitCompareArrows,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { AgentStep } from '../../store/investigate';
import { GlassCard } from '../ui/GlassCard';
import { Spinner } from '../ui/Spinner';
import { tokens } from '../../theme/tokens';

// ─── Tool meta ────────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; Icon: React.ElementType }> = {
  scan_token:          { label: 'Lineage Scan',     Icon: Search },
  get_deployer_profile:{ label: 'Deployer Profile', Icon: User },
  get_bundle_report:   { label: 'Bundle Analysis',  Icon: Package },
  trace_sol_flow:      { label: 'SOL Flow Trace',   Icon: ArrowRightLeft },
  get_cartel_report:   { label: 'Cartel Network',   Icon: Network },
  get_insider_sell:    { label: 'Insider Sells',     Icon: TrendingDown },
  get_operator_impact: { label: 'Operator Impact',  Icon: Fingerprint },
  compare_tokens:      { label: 'Token Compare',    Icon: GitCompareArrows },
};

// ─── Tool call deduplication ──────────────────────────────────────────────────

interface GroupedTool {
  toolName: string;
  callCount: number;
  latestResult: AgentStep | null;
  latestCall: AgentStep | null;
  hasError: boolean;
}

function groupToolCalls(steps: AgentStep[]): GroupedTool[] {
  const map = new Map<string, GroupedTool>();
  for (const step of steps) {
    if (step.type !== 'tool_call' && step.type !== 'tool_result') continue;
    const tool = String(step.data.tool ?? 'unknown');
    const existing = map.get(tool) ?? { toolName: tool, callCount: 0, latestResult: null, latestCall: null, hasError: false };
    if (step.type === 'tool_call') {
      existing.callCount++;
      existing.latestCall = step;
    }
    if (step.type === 'tool_result') {
      existing.latestResult = step;
      if (step.data.error) existing.hasError = true;
    }
    map.set(tool, existing);
  }
  return Array.from(map.values());
}

// ─── GroupedToolCard ──────────────────────────────────────────────────────────

function GroupedToolCard({ group }: { group: GroupedTool }) {
  const meta = TOOL_META[group.toolName] ?? { label: group.toolName, Icon: Search };
  const ToolIcon = meta.Icon;
  const isDone = group.latestResult != null;
  const hasError = group.hasError;
  const durationMs = isDone ? Number(group.latestResult?.data.durationMs ?? group.latestResult?.data.duration_ms ?? 0) : 0;

  return (
    <View
      style={styles.groupedToolRow}
      accessibilityLabel={`${meta.label} — ${hasError ? 'error' : isDone ? 'complete' : 'running'}${group.callCount > 1 ? `, called ${group.callCount} times` : ''}`}
    >
      {isDone ? (
        hasError ? <AlertTriangle size={16} color={tokens.risk?.high ?? '#FF6B6B'} /> : <CheckCircle size={16} color={tokens.success} />
      ) : (
        <Spinner size={16} color={tokens.secondary} />
      )}
      <ToolIcon size={14} color={tokens.secondary} />
      <Text style={[styles.toolLabel, hasError && styles.errorText]}>{meta.label}</Text>
      {group.callCount > 1 && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>x{group.callCount}</Text>
        </View>
      )}
      {isDone && !hasError && durationMs > 0 && (
        <Text style={styles.stepMeta}>{durationMs}ms</Text>
      )}
    </View>
  );
}

// ─── AgentReasoningSection ────────────────────────────────────────────────────

export function AgentReasoningSection({ steps, isReasoning }: { steps: AgentStep[]; isReasoning: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const groupedTools = useMemo(() => groupToolCalls(steps), [steps]);
  const textSteps = useMemo(() => steps.filter(s => s.type === 'text'), [steps]);
  const thinkingSteps = useMemo(() => steps.filter(s => s.type === 'thinking'), [steps]);
  const maxTurn = useMemo(() => Math.max(...steps.map(s => s.turn), 0), [steps]);

  // Auto-collapse when reasoning done
  useEffect(() => {
    if (!isReasoning && steps.length > 0) {
      const timer = setTimeout(() => setExpanded(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isReasoning, steps.length]);

  return (
    <Animated.View entering={FadeInDown.duration(250).springify()}>
      <GlassCard>
        <TouchableOpacity
          onPress={() => setExpanded(e => !e)}
          style={styles.sectionHeaderRow}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Agent reasoning, ${maxTurn} turn${maxTurn !== 1 ? 's' : ''}`}
          accessibilityState={{ expanded }}
        >
          <View style={styles.sectionHeaderLeft}>
            <Brain size={16} color={tokens.secondary} />
            <Text style={styles.sectionLabel}>AGENT REASONING</Text>
          </View>
          <View style={styles.sectionHeaderRight}>
            <Text style={styles.sectionMeta}>{maxTurn} turn{maxTurn !== 1 ? 's' : ''}</Text>
            {isReasoning && <Spinner size={14} color={tokens.secondary} />}
            <ChevronDown
              size={16}
              color={tokens.textTertiary}
              style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </View>
        </TouchableOpacity>
        {expanded && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {/* Grouped tool calls */}
            {groupedTools.map(g => (
              <GroupedToolCard key={g.toolName} group={g} />
            ))}
            {/* Thinking excerpts (last only) */}
            {thinkingSteps.length > 0 && (
              <View style={styles.stepRow}>
                <Brain size={14} color={tokens.white60} />
                <Text style={styles.thinkingText} numberOfLines={3}>
                  {String(thinkingSteps[thinkingSteps.length - 1].data.text ?? 'Reasoning...')}
                </Text>
              </View>
            )}
            {/* Narrative text blocks */}
            {textSteps.map((s, i) => (
              <Text key={`tx-${i}`} style={styles.narrativeText}>{String(s.data.text ?? '')}</Text>
            ))}
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 32,
  },
  sectionHeaderLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sectionHeaderRight: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  sectionLabel: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small,
    color: tokens.white60, letterSpacing: 0.5,
  },
  sectionMeta: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  toolLabel: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white80,
    flex: 1,
  },
  stepMeta: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary,
  },
  thinkingText: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, fontStyle: 'italic',
  },
  narrativeText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white80, lineHeight: 22,
  },
  errorText: {
    flex: 1, fontFamily: 'Lexend-Medium', fontSize: tokens.font.body,
    color: tokens.risk?.high ?? '#FF6B6B',
  },
  groupedToolRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  countBadge: {
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: tokens.radius.xs,
    backgroundColor: tokens.bgGlass12 ?? 'rgba(255,255,255,0.12)',
  },
  countBadgeText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
});
