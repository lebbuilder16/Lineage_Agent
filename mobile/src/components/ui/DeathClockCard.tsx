import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { PulsingDot } from './PulsingDot';
import { tokens } from '../../theme/tokens';
import { RiskTimeline } from '../death-clock/RiskTimeline';
import { KeySignals } from '../death-clock/KeySignals';
import { DetailsPanel } from '../death-clock/DetailsPanel';
import { fmtHours } from '../death-clock/fmtHours';
import type { DeathClockForecast, InsiderSellReport, DeployerProfile } from '../../types/api';

// ─── Main Component ───────────────────────────────────────────────────────────

export function DeathClockCard({ dc, riskColor, insiderSell, solExtracted, bundleVerdict, deployerProfile }: {
  dc: DeathClockForecast | null;
  riskColor: string;
  insiderSell?: InsiderSellReport | null;
  solExtracted?: number | null;
  bundleVerdict?: string | null;
  deployerProfile?: DeployerProfile | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isFocused = useIsFocused();

  // Effective badge across all signals
  const effectiveRiskLabel = (() => {
    if (insiderSell?.verdict === 'insider_dump' && insiderSell?.deployer_exited) return 'CRITICAL';
    if (insiderSell?.verdict === 'insider_dump') return 'HIGH';
    if (insiderSell?.verdict === 'suspicious') return 'MEDIUM';
    if (!dc) return 'NO DATA';
    if (dc.risk_level === 'insufficient_data') return 'UNVERIFIED';
    return dc.risk_level.toUpperCase().replace('_', ' ');
  })();

  const effectiveBadgeColor = (() => {
    if (insiderSell?.verdict === 'insider_dump' && insiderSell?.deployer_exited) return tokens.risk.critical;
    if (insiderSell?.verdict === 'insider_dump') return tokens.risk.high;
    if (insiderSell?.verdict === 'suspicious') return tokens.risk.medium;
    if (!dc || dc.risk_level === 'insufficient_data') return tokens.textTertiary;
    return riskColor;
  })();

  // Timeline / countdown logic
  const hasWindowDates = !!(dc?.predicted_window_start && dc?.predicted_window_end);
  const hasDirectHistory = dc != null && dc.median_rug_hours > 0 && dc.sample_count >= 1;
  const hasOperatorHistory = dc != null
    && dc.prediction_basis === 'operator'
    && (dc.operator_sample_count ?? 0) >= 3;
  const hasHistory = hasWindowDates || hasDirectHistory || hasOperatorHistory;

  const timelineConfidence: 'low' | 'medium' | 'high' =
    hasWindowDates || (dc?.sample_count ?? 0) >= 5 ? 'high'
    : (dc?.sample_count ?? 0) >= 3 ? 'medium'
    : 'low';

  const windowStartH = dc ? Math.max(dc.median_rug_hours - dc.stdev_rug_hours, 0) : 0;

  const fetchTimeRef = useRef(Date.now());
  useEffect(() => { fetchTimeRef.current = Date.now(); }, [dc]);

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!hasHistory || !isFocused) return;
    const id = setInterval(() => forceUpdate((n: number) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [hasHistory, isFocused]);

  const localElapsed = dc
    ? dc.elapsed_hours + (Date.now() - fetchTimeRef.current) / 3_600_000
    : 0;

  const windowStartMs = dc?.predicted_window_start ? new Date(dc.predicted_window_start).getTime() : null;
  const windowEndMs = dc?.predicted_window_end ? new Date(dc.predicted_window_end).getTime() : null;
  const nowMs = Date.now();

  const inWindow = windowStartMs != null && windowEndMs != null
    ? nowMs >= windowStartMs && nowMs <= windowEndMs
    : dc != null && localElapsed >= windowStartH && localElapsed <= (dc.median_rug_hours + dc.stdev_rug_hours);

  const pastWindow = windowEndMs != null
    ? nowMs > windowEndMs
    : dc != null && localElapsed > (dc.median_rug_hours + dc.stdev_rug_hours);

  const hoursRemaining = windowStartMs != null
    ? Math.max((windowStartMs - nowMs) / 3_600_000, 0)
    : windowStartH - localElapsed;

  const isActive = insiderSell?.verdict === 'insider_dump' || inWindow;

  const dpTokens = (deployerProfile as Record<string, unknown>)?.tokens;
  const hasDetails = !!(
    deployerProfile ||
    (dc?.basis_breakdown && Object.keys(dc.basis_breakdown).length > 0) ||
    insiderSell?.price_change_24h != null ||
    (Array.isArray(dpTokens) && dpTokens.length > 0)
  );

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <GlassCard style={[styles.card, { borderColor: `${effectiveBadgeColor}30`, borderWidth: 1 }]}>

        {/* ── Zone 1 : Risk identity ── */}
        <View
          style={styles.headerRow}
          accessible={true}
          accessibilityRole="summary"
          accessibilityLabel={`Death Clock: ${effectiveRiskLabel} risk${dc?.rug_probability_pct != null ? `, ${dc.rug_probability_pct.toFixed(0)}% rug probability` : ''}`}
        >
          <View style={styles.headerLeft}>
            <Text style={styles.title}>DEATH CLOCK</Text>
            {dc?.rug_probability_pct != null && (
              <Text style={[styles.probValue, { color: effectiveBadgeColor }]}>
                {dc.rug_probability_pct.toFixed(0)}%
              </Text>
            )}
          </View>
          <View style={[styles.riskBadge, { backgroundColor: `${effectiveBadgeColor}18`, borderColor: `${effectiveBadgeColor}40` }]}>
            {isActive && <PulsingDot color={effectiveBadgeColor} />}
            <Text style={[styles.riskBadgeText, { color: effectiveBadgeColor }]}>{effectiveRiskLabel}</Text>
          </View>
        </View>

        {/* ── Zone 2 : Countdown ── */}
        {dc && (
          hasHistory ? (
            <View
              style={[styles.countdownWrap, {
                backgroundColor: inWindow ? `${riskColor}12` : tokens.bgGlass8,
                borderColor: inWindow ? `${riskColor}30` : tokens.borderSubtle,
              }]}
              accessibilityLiveRegion="polite"
            >
              {inWindow ? (
                <View style={styles.countdownInner}>
                  <PulsingDot color={riskColor} />
                  <Text style={[styles.countdownLabel, { color: riskColor }]}>RUG WINDOW OPEN</Text>
                  {dc.risk_level === 'first_rug' && (
                    <Text style={styles.firstRugNote}>First predicted rug for this deployer</Text>
                  )}
                </View>
              ) : pastWindow ? (
                <View style={styles.countdownInner}>
                  <Text style={[styles.countdownLabel, { color: tokens.textTertiary }]}>PAST WINDOW</Text>
                  <Text style={styles.countdownSub}>Survived — rug still possible</Text>
                </View>
              ) : (
                <View style={styles.countdownInner}>
                  <Text style={styles.countdownTimerLabel}>
                    {dc.risk_level === 'first_rug' ? 'First rug window in' : 'Predicted rug window in'}
                  </Text>
                  <Text style={[styles.countdownTimer, { color: riskColor }]}>{fmtHours(hoursRemaining)}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.countdownWrap, { borderColor: tokens.borderSubtle }]}>
              <Text style={styles.noDataText}>
                {dc.sample_count === 0
                  ? 'New deployer — no timing data'
                  : `${dc.sample_count} sample${dc.sample_count !== 1 ? 's' : ''} — insufficient for prediction`}
              </Text>
            </View>
          )
        )}

        {/* ── Timeline ── */}
        {dc && hasHistory && (
          <RiskTimeline
            dc={dc}
            riskColor={riskColor}
            localElapsed={localElapsed}
            confidence={timelineConfidence}
          />
        )}

        {/* ── Key signals ── */}
        <KeySignals
          dc={dc}
          insiderSell={insiderSell}
          bundleVerdict={bundleVerdict}
          deployerProfile={deployerProfile}
          solExtracted={solExtracted}
        />

        {/* ── Collapsible details ── */}
        {hasDetails && (
          <TouchableOpacity
            onPress={() => setExpanded((e: boolean) => !e)}
            style={styles.expandToggle}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide details' : 'See details'}
            accessibilityState={{ expanded }}
          >
            <Text style={styles.expandToggleText}>
              {expanded ? 'Hide details ↑' : 'See details ↓'}
            </Text>
          </TouchableOpacity>
        )}

        {expanded && (
          <DetailsPanel
            dc={dc}
            insiderSell={insiderSell}
            deployerProfile={deployerProfile}
          />
        )}

      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {},
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  title: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.small, color: tokens.white60, letterSpacing: 1.2 },
  probValue: { fontFamily: 'Lexend-Bold', fontSize: 22, letterSpacing: 0.5 },
  riskBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: tokens.radius.pill, borderWidth: 1 },
  riskBadgeText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.tiny, letterSpacing: 0.8 },
  countdownWrap: { borderRadius: tokens.radius.sm, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 14, alignItems: 'center' },
  countdownInner: { alignItems: 'center', gap: 4 },
  countdownLabel: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, letterSpacing: 1 },
  countdownSub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 2 },
  countdownTimerLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.5, marginBottom: 4 },
  countdownTimer: { fontFamily: 'Lexend-Bold', fontSize: 32, letterSpacing: 1 },
  noDataText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, textAlign: 'center' },
  firstRugNote: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.risk.high, marginTop: 4 },
  expandToggle: { marginTop: 12, paddingVertical: 6, minHeight: tokens.minTouchSize, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderTopColor: tokens.borderSubtle },
  expandToggleText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, letterSpacing: 0.4 },
});
