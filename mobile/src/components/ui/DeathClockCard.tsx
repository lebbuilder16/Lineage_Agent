import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  FadeIn,
  Easing,
} from 'react-native-reanimated';
import { GlassCard } from './GlassCard';
import { tokens } from '../../theme/tokens';
import type { DeathClockForecast, InsiderSellReport, DeployerProfile } from '../../types/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtHours(h: number): string {
  if (h <= 0) return '0m';
  const totalMins = Math.floor(h * 60);
  const days = Math.floor(totalMins / (60 * 24));
  const hrs = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

// ─── Pulsing dot ──────────────────────────────────────────────────────────────

function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
    scale.value = withRepeat(
      withTiming(1.35, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[styles.pulsingDot, { backgroundColor: color }, animStyle]} />;
}

// ─── Timeline (compact) ───────────────────────────────────────────────────────

function Timeline({ dc, riskColor, localElapsed, confidence }: {
  dc: DeathClockForecast;
  riskColor: string;
  localElapsed: number;
  confidence: 'low' | 'medium' | 'high';
}) {
  const scale = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);

  const markerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const total = Math.max(dc.median_rug_hours + dc.stdev_rug_hours + 24, localElapsed + 12);
  const nowPct = localElapsed / total;
  const winStartPct = Math.max((dc.median_rug_hours - dc.stdev_rug_hours) / total, 0);
  const winEndPct = Math.min((dc.median_rug_hours + dc.stdev_rug_hours) / total, 0.98);

  const pastWindow = localElapsed > (dc.median_rug_hours + dc.stdev_rug_hours);
  const windowColor = pastWindow ? tokens.white35 : riskColor;
  const inWindow = localElapsed >= Math.max(dc.median_rug_hours - dc.stdev_rug_hours, 0)
    && localElapsed <= (dc.median_rug_hours + dc.stdev_rug_hours);
  const markerColor = inWindow ? riskColor : pastWindow ? tokens.white35 : tokens.secondary;

  return (
    <View style={styles.timelineWrap}>
      <View style={styles.timelineTrack}>
        <View style={[styles.timelineSegment, {
          left: 0, width: `${winStartPct * 100}%`,
          backgroundColor: `${tokens.risk.low}20`,
        }]} />
        <View style={[styles.timelineSegment, {
          left: `${winStartPct * 100}%`,
          width: `${(winEndPct - winStartPct) * 100}%`,
          backgroundColor: `${windowColor}30`,
          borderLeftWidth: 1, borderRightWidth: 1,
          borderColor: `${windowColor}50`,
        }]} />
        <View style={[styles.timelineMarkerWrap, { left: `${nowPct * 100}%` }]}>
          <Animated.View style={[styles.timelineMarker, { backgroundColor: markerColor }, markerStyle]} />
        </View>
      </View>
      <View style={styles.timelineLabels}>
        <Text style={styles.tlLabel}>Launch</Text>
        <Text style={[styles.tlLabel, { color: markerColor }]}>Now</Text>
        {dc.median_rug_hours > 0 && (
          <Text style={[styles.tlLabel, { color: `${windowColor}80` }]}>
            ~{Math.round(dc.median_rug_hours)}h
          </Text>
        )}
      </View>
      {confidence === 'low' && (
        <Text style={styles.timelineWarning}>
          {dc.basis_breakdown && Object.keys(dc.basis_breakdown).some(m => m === 'liquidity_drain_rug')
            ? 'Estimate includes soft rugs — window is approximate'
            : dc.sample_count <= 1
              ? 'Based on 1 sample — treat as indicative only'
              : `${dc.sample_count} samples — estimate may vary`}
        </Text>
      )}
    </View>
  );
}

// ─── Key Signals — 2-3 bullets, actionable ───────────────────────────────────

function KeySignals({ dc, insiderSell, bundleVerdict, deployerProfile, solExtracted }: {
  dc: DeathClockForecast | null;
  insiderSell?: InsiderSellReport | null;
  bundleVerdict?: string | null;
  deployerProfile?: DeployerProfile | null;
  solExtracted?: number | null;
}) {
  const signals: { color: string; text: string }[] = [];

  // 1. Deployer track record — most important
  if (deployerProfile?.rug_rate_pct != null && deployerProfile.total_tokens_launched != null) {
    const rate = deployerProfile.rug_rate_pct;
    const total = deployerProfile.total_tokens_launched;
    const rugged = deployerProfile.confirmed_rug_count ?? 0;
    const color = rate > 60 ? tokens.risk.critical : rate > 30 ? tokens.risk.high : rate > 10 ? tokens.risk.medium : tokens.risk.low;
    signals.push({
      color,
      text: rugged === 0
        ? `Deployer launched ${total} token${total !== 1 ? 's' : ''} — no confirmed rugs`
        : `Deployer rugged ${rugged} of ${total} tokens (${Math.round(rate)}%)`,
    });
  } else if (dc && dc.historical_rug_count > 0) {
    signals.push({
      color: tokens.risk.high,
      text: `Deployer confirmed ${dc.historical_rug_count} previous rug${dc.historical_rug_count !== 1 ? 's' : ''}`,
    });
  } else if (dc && dc.sample_count === 0) {
    signals.push({ color: tokens.white35, text: 'New deployer — no rug history on record' });
  }

  // 2. Insider / market signal
  if (insiderSell?.verdict === 'insider_dump' && insiderSell.deployer_exited) {
    signals.push({ color: tokens.risk.critical, text: 'Deployer wallet fully exited — active dump' });
  } else if (insiderSell?.verdict === 'insider_dump') {
    signals.push({ color: tokens.risk.high, text: 'Insider selling detected' });
  } else if (insiderSell?.verdict === 'suspicious') {
    const sp = insiderSell.sell_pressure_24h;
    signals.push({
      color: tokens.risk.medium,
      text: sp != null
        ? `Suspicious activity — ${Math.round(sp * 100)}% sell pressure`
        : 'Suspicious trading activity',
    });
  } else if (insiderSell?.price_change_24h != null && insiderSell.price_change_24h <= -40) {
    signals.push({
      color: tokens.risk.high,
      text: `Price down ${Math.abs(Math.round(insiderSell.price_change_24h))}% in 24h`,
    });
  }

  // 3. Bundle / extraction
  if (bundleVerdict === 'confirmed_team_extraction') {
    signals.push({ color: tokens.risk.critical, text: 'Team wallet extraction confirmed' });
  } else if (bundleVerdict === 'suspected_team_extraction') {
    signals.push({ color: tokens.risk.high, text: 'Suspected team extraction' });
  } else if (solExtracted != null && solExtracted > 10) {
    signals.push({ color: tokens.risk.high, text: `${solExtracted.toFixed(1)} SOL extracted` });
  }

  if (signals.length === 0) return null;

  return (
    <View style={styles.signalsWrap}>
      {signals.slice(0, 3).map((sig, i) => (
        <View key={i} style={styles.signalRow}>
          <View style={[styles.signalDot, { backgroundColor: sig.color }]} />
          <Text style={[styles.signalText, { color: sig.color === tokens.risk.low ? tokens.white60 : tokens.white100 }]}>
            {sig.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Details panel (collapsible) ─────────────────────────────────────────────

function DetailsPanel({ dc, insiderSell, deployerProfile }: {
  dc: DeathClockForecast | null;
  insiderSell?: InsiderSellReport | null;
  deployerProfile?: DeployerProfile | null;
}) {
  const hasMechanisms = dc?.basis_breakdown != null && Object.keys(dc.basis_breakdown).length > 0;
  const hasTokenHistory = (deployerProfile?.tokens?.length ?? 0) > 0;

  return (
    <View style={styles.detailsWrap}>
      <View style={styles.sectionDivider} />

      {/* Deployer DNA — stats only, no full token list */}
      {deployerProfile && (
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>DEPLOYER</Text>
          <View style={styles.detailRow}>
            {deployerProfile.total_tokens_launched != null && (
              <View style={styles.detailStat}>
                <Text style={styles.detailStatValue}>{deployerProfile.total_tokens_launched}</Text>
                <Text style={styles.detailStatLabel}>launched</Text>
              </View>
            )}
            {deployerProfile.confirmed_rug_count != null && (
              <View style={styles.detailStat}>
                <Text style={[styles.detailStatValue, deployerProfile.confirmed_rug_count > 0 && { color: tokens.risk.critical }]}>
                  {deployerProfile.confirmed_rug_count}
                </Text>
                <Text style={styles.detailStatLabel}>rugged</Text>
              </View>
            )}
            {deployerProfile.avg_lifespan_days != null && (
              <View style={styles.detailStat}>
                <Text style={styles.detailStatValue}>{deployerProfile.avg_lifespan_days.toFixed(1)}d</Text>
                <Text style={styles.detailStatLabel}>avg life</Text>
              </View>
            )}
            {dc && (
              <View style={styles.detailStat}>
                <Text style={styles.detailStatValue}>{Math.round(dc.elapsed_hours)}h</Text>
                <Text style={styles.detailStatLabel}>elapsed</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Rug mechanisms — only if present */}
      {hasMechanisms && (
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>HOW THEY RUG</Text>
          <View style={styles.pillsRow}>
            {Object.entries(dc!.basis_breakdown!).map(([mech, count]) => {
              const isDrain = mech === 'liquidity_drain_rug';
              return (
                <View key={mech} style={[styles.mechPill, isDrain && styles.mechPillDrain]}>
                  <Text style={[styles.mechPillText, isDrain && { color: tokens.risk.medium }]}>
                    {mech.replace(/_/g, ' ')} ×{count}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Price performance — only if data exists and notable */}
      {insiderSell && (insiderSell.price_change_1h != null || insiderSell.price_change_24h != null) && (
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>PRICE</Text>
          <View style={styles.detailRow}>
            {insiderSell.price_change_1h != null && (
              <View style={styles.detailStat}>
                <Text style={[styles.detailStatValue, {
                  color: insiderSell.price_change_1h < -10 ? tokens.risk.critical
                    : insiderSell.price_change_1h < 0 ? tokens.risk.high
                    : tokens.risk.low,
                }]}>
                  {insiderSell.price_change_1h >= 0 ? '+' : ''}{insiderSell.price_change_1h.toFixed(0)}%
                </Text>
                <Text style={styles.detailStatLabel}>1h</Text>
              </View>
            )}
            {insiderSell.price_change_6h != null && (
              <View style={styles.detailStat}>
                <Text style={[styles.detailStatValue, {
                  color: insiderSell.price_change_6h < -20 ? tokens.risk.critical
                    : insiderSell.price_change_6h < 0 ? tokens.risk.high
                    : tokens.risk.low,
                }]}>
                  {insiderSell.price_change_6h >= 0 ? '+' : ''}{insiderSell.price_change_6h.toFixed(0)}%
                </Text>
                <Text style={styles.detailStatLabel}>6h</Text>
              </View>
            )}
            {insiderSell.price_change_24h != null && (
              <View style={styles.detailStat}>
                <Text style={[styles.detailStatValue, {
                  color: insiderSell.price_change_24h < -40 ? tokens.risk.critical
                    : insiderSell.price_change_24h < 0 ? tokens.risk.high
                    : tokens.risk.low,
                }]}>
                  {insiderSell.price_change_24h >= 0 ? '+' : ''}{insiderSell.price_change_24h.toFixed(0)}%
                </Text>
                <Text style={styles.detailStatLabel}>24h</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Recent token history — capped at 5 */}
      {hasTokenHistory && deployerProfile?.tokens && (
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>RECENT TOKENS</Text>
          {deployerProfile.tokens.slice(0, 5).map((t) => (
            <View key={t.mint} style={styles.tokenHistoryRow}>
              <View style={[styles.tokenHistoryDot, {
                backgroundColor: t.rugged_at ? tokens.risk.critical : tokens.white35,
              }]} />
              <Text style={styles.tokenHistoryName} numberOfLines={1}>{t.name}</Text>
              <Text style={[styles.tokenHistoryOutcome, {
                color: t.rugged_at ? tokens.risk.critical : tokens.white35,
              }]}>
                {t.rugged_at ? 'RUGGED' : 'active'}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

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
    if (!dc || dc.risk_level === 'insufficient_data') return tokens.white35;
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (!hasHistory) return;
    intervalRef.current = setInterval(() => forceUpdate((n: number) => n + 1), 30_000);
    return () => clearInterval(intervalRef.current);
  }, [hasHistory]);

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

  const hasDetails = !!(
    deployerProfile ||
    (dc?.basis_breakdown && Object.keys(dc.basis_breakdown).length > 0) ||
    insiderSell?.price_change_24h != null ||
    (deployerProfile?.tokens?.length ?? 0) > 0
  );

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <GlassCard style={[styles.card, { borderColor: `${effectiveBadgeColor}30`, borderWidth: 1 }]}>

        {/* ── Zone 1 : Identité du risque ── */}
        <View style={styles.headerRow}>
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
            <View style={[styles.countdownWrap, {
              backgroundColor: inWindow ? `${riskColor}12` : tokens.bgGlass8,
              borderColor: inWindow ? `${riskColor}30` : tokens.borderSubtle,
            }]}>
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
                  <Text style={[styles.countdownLabel, { color: tokens.white35 }]}>PAST WINDOW</Text>
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

        {/* ── Timeline (si données suffisantes) ── */}
        {dc && hasHistory && (
          <Timeline
            dc={dc}
            riskColor={riskColor}
            localElapsed={localElapsed}
            confidence={timelineConfidence}
          />
        )}

        {/* ── Zone 3 : Signaux clés ── */}
        <KeySignals
          dc={dc}
          insiderSell={insiderSell}
          bundleVerdict={bundleVerdict}
          deployerProfile={deployerProfile}
          solExtracted={solExtracted}
        />

        {/* ── Détails collapsibles ── */}
        {hasDetails && (
          <TouchableOpacity
            onPress={() => setExpanded((e: boolean) => !e)}
            style={styles.expandToggle}
            activeOpacity={0.7}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {},

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.2,
  },
  probValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: 22,
    letterSpacing: 0.5,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
  },
  riskBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
    letterSpacing: 0.8,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Countdown
  countdownWrap: {
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  countdownInner: { alignItems: 'center', gap: 4 },
  countdownLabel: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    letterSpacing: 1,
  },
  countdownSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 2,
  },
  countdownTimerLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  countdownTimer: {
    fontFamily: 'Lexend-Bold',
    fontSize: 32,
    letterSpacing: 1,
  },
  noDataText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
    textAlign: 'center',
  },
  firstRugNote: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.risk.high,
    marginTop: 4,
  },

  // Timeline
  timelineWrap: { marginBottom: 14, gap: 6 },
  timelineTrack: {
    height: 6,
    backgroundColor: tokens.white10,
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  timelineSegment: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderRadius: 3,
  },
  timelineMarkerWrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -6,
    marginLeft: -6,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tlLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  timelineWarning: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Key signals
  signalsWrap: {
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  signalText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    flex: 1,
    lineHeight: 18,
  },

  // Expand toggle
  expandToggle: {
    marginTop: 12,
    paddingVertical: 6,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
  },
  expandToggleText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 0.4,
  },

  // Details panel
  detailsWrap: { marginTop: 4 },
  sectionDivider: {
    height: 1,
    backgroundColor: tokens.borderSubtle,
    marginBottom: 12,
  },
  detailSection: { marginBottom: 14 },
  detailLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  detailStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.xs,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    gap: 2,
  },
  detailStatValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  detailStatLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },

  // Rug mechanisms pills
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mechPill: {
    backgroundColor: `${tokens.accent}15`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${tokens.accent}30`,
  },
  mechPillDrain: {
    backgroundColor: `${tokens.risk.medium}15`,
    borderColor: `${tokens.risk.medium}30`,
  },
  mechPillText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.accent,
    textTransform: 'capitalize',
  },

  // Token history
  tokenHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  tokenHistoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tokenHistoryName: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  tokenHistoryOutcome: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
});
