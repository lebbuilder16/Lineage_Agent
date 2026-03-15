import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

function fmtPct(n: number | null | undefined, decimals = 0): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  low: tokens.white35,
  medium: tokens.risk.medium,
  high: tokens.success,
};

const CONFIDENCE_DOTS: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const VERDICT_COLOR: Record<string, string> = {
  insider_dump: tokens.risk.critical,
  suspicious: tokens.risk.medium,
  clean: tokens.risk.low,
};

const BUNDLE_COLOR: Record<string, string> = {
  confirmed_team_extraction: tokens.risk.critical,
  suspected_team_extraction: tokens.risk.high,
  coordinated_dump_unknown_team: tokens.risk.high,
  early_buyers_no_link_proven: tokens.risk.low,
};

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

// ─── Sell pressure bar ────────────────────────────────────────────────────────

function PressureBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(Math.max(value, 0), 1);
  return (
    <View style={styles.pressureTrack}>
      <View style={[styles.pressureFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ dc, riskColor }: { dc: DeathClockForecast; riskColor: string }) {
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

  const total = dc.median_rug_hours + dc.stdev_rug_hours + 24;
  const nowPct = Math.min(dc.elapsed_hours / total, 0.94);
  const winStartPct = Math.max((dc.median_rug_hours - dc.stdev_rug_hours) / total, 0);
  const winEndPct = Math.min((dc.median_rug_hours + dc.stdev_rug_hours) / total, 0.98);

  const inWindow = dc.elapsed_hours >= (dc.median_rug_hours - dc.stdev_rug_hours)
    && dc.elapsed_hours <= (dc.median_rug_hours + dc.stdev_rug_hours);
  const pastWindow = dc.elapsed_hours > (dc.median_rug_hours + dc.stdev_rug_hours);

  const windowColor = pastWindow ? tokens.risk.low : riskColor;
  const markerColor = inWindow ? riskColor : pastWindow ? tokens.risk.low : tokens.secondary;
  const winStartH = Math.max(dc.median_rug_hours - dc.stdev_rug_hours, 0);
  const winEndH = dc.median_rug_hours + dc.stdev_rug_hours;

  return (
    <View style={styles.timelineWrap}>
      <View style={styles.timelineTrack}>
        <View style={[styles.timelineSegment, {
          left: 0, width: `${winStartPct * 100}%`,
          backgroundColor: `${tokens.risk.low}25`,
        }]} />
        <View style={[styles.timelineSegment, {
          left: `${winStartPct * 100}%`,
          width: `${(winEndPct - winStartPct) * 100}%`,
          backgroundColor: `${windowColor}35`,
          borderLeftWidth: 1, borderRightWidth: 1,
          borderColor: `${windowColor}60`,
        }]} />
        <View style={[styles.timelineMarkerWrap, { left: `${nowPct * 100}%` }]}>
          <Animated.View style={[styles.timelineMarker, { backgroundColor: markerColor }, markerStyle]} />
        </View>
      </View>
      <View style={styles.timelineLabels}>
        <Text style={styles.tlLabel}>Launch</Text>
        <Text style={[styles.tlLabel, { color: markerColor }]}>Now ({Math.round(dc.elapsed_hours)}h)</Text>
        {dc.median_rug_hours > 0 && (
          <Text style={[styles.tlLabel, { color: `${windowColor}99` }]}>
            Window ({Math.round(winStartH)}h–{Math.round(winEndH)}h)
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Deployer DNA Panel ───────────────────────────────────────────────────────

function DeployerDNAPanel({ dp }: { dp: DeployerProfile }) {
  const tokens_list = dp.tokens ?? [];
  const hasTokens = tokens_list.length > 0;

  const narrativeLabel = dp.preferred_narrative
    ? dp.preferred_narrative.replace(/_/g, ' ').toUpperCase()
    : null;

  // Mechanism summary from rug_mechanism_counts
  const mechanisms = dp.rug_mechanism_counts
    ? Object.entries(dp.rug_mechanism_counts).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <View style={styles.signalsWrap}>
      <View style={styles.sectionDivider} />
      <Text style={styles.signalsTitle}>DEPLOYER DNA</Text>

      {/* Pattern summary row */}
      <View style={styles.dnaSummaryRow}>
        {dp.total_tokens_launched != null && (
          <View style={styles.dnaStatItem}>
            <Text style={styles.statValue}>{dp.total_tokens_launched}</Text>
            <Text style={styles.statLabel}>Launched</Text>
          </View>
        )}
        {dp.confirmed_rug_count != null && (
          <View style={styles.dnaStatItem}>
            <Text style={[styles.statValue, dp.confirmed_rug_count > 0 ? { color: tokens.risk.critical } : undefined]}>
              {dp.confirmed_rug_count}
            </Text>
            <Text style={styles.statLabel}>Rugged</Text>
          </View>
        )}
        {dp.rug_rate_pct != null && (
          <View style={styles.dnaStatItem}>
            <Text style={[styles.statValue, {
              color: dp.rug_rate_pct > 60 ? tokens.risk.critical
                : dp.rug_rate_pct > 30 ? tokens.risk.high
                : dp.rug_rate_pct > 10 ? tokens.risk.medium
                : tokens.risk.low,
            }]}>
              {dp.rug_rate_pct.toFixed(0)}%
            </Text>
            <Text style={styles.statLabel}>Rug rate</Text>
          </View>
        )}
        {dp.avg_lifespan_days != null && (
          <View style={styles.dnaStatItem}>
            <Text style={styles.statValue}>{dp.avg_lifespan_days.toFixed(1)}d</Text>
            <Text style={styles.statLabel}>Avg life</Text>
          </View>
        )}
      </View>

      {/* Narrative + mechanisms */}
      <View style={styles.dnaTagsRow}>
        {narrativeLabel && (
          <View style={styles.dnaTag}>
            <Text style={styles.dnaTagText}>{narrativeLabel}</Text>
          </View>
        )}
        {mechanisms.slice(0, 3).map(([mech, count]) => (
          <View key={mech} style={[styles.dnaTag, styles.dnaTagDanger]}>
            <Text style={styles.dnaTagDangerText}>{mech.replace(/_/g, ' ')} ×{count}</Text>
          </View>
        ))}
      </View>

      {/* Token history timeline */}
      {hasTokens && (
        <View style={styles.dnaTimeline}>
          {tokens_list.slice(0, 8).map((t, i) => {
            const isRugged = !!t.rugged_at;
            const isLast = i === Math.min(tokens_list.length, 8) - 1;
            const dotColor = isRugged ? tokens.risk.critical : tokens.risk.low;
            const mcap = t.mcap_usd != null && t.mcap_usd > 0
              ? t.mcap_usd >= 1_000_000 ? `$${(t.mcap_usd / 1_000_000).toFixed(1)}M`
              : t.mcap_usd >= 1_000 ? `$${(t.mcap_usd / 1_000).toFixed(0)}K`
              : `$${t.mcap_usd.toFixed(0)}`
              : null;

            return (
              <View key={t.mint} style={styles.dnaTimelineItem}>
                {/* Spine */}
                <View style={styles.dnaSpineCol}>
                  <View style={[styles.dnaDot, { backgroundColor: dotColor }]} />
                  {!isLast && <View style={[styles.dnaLine, { backgroundColor: `${dotColor}40` }]} />}
                </View>
                {/* Content */}
                <View style={[styles.dnaItemContent, isLast ? { borderBottomWidth: 0 } : undefined]}>
                  <View style={styles.dnaItemRow}>
                    <Text style={styles.dnaItemName} numberOfLines={1}>{t.name}</Text>
                    {mcap && <Text style={styles.dnaItemMcap}>{mcap}</Text>}
                    <View style={[styles.dnaOutcomeBadge, { backgroundColor: isRugged ? `${tokens.risk.critical}20` : `${tokens.risk.low}15` }]}>
                      <Text style={[styles.dnaOutcomeText, { color: isRugged ? tokens.risk.critical : tokens.risk.low }]}>
                        {isRugged ? 'RUGGED' : 'ACTIVE'}
                      </Text>
                    </View>
                  </View>
                  {t.rug_mechanism && (
                    <Text style={styles.dnaItemMeta}>{t.rug_mechanism.replace(/_/g, ' ')}</Text>
                  )}
                </View>
              </View>
            );
          })}
          {tokens_list.length > 8 && (
            <Text style={styles.dnaMore}>+{tokens_list.length - 8} more tokens</Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Market Signals Panel ─────────────────────────────────────────────────────

function MarketSignalsPanel({
  ins,
  solExtracted,
  bundleVerdict,
  riskColor,
}: {
  ins: InsiderSellReport;
  solExtracted: number | null;
  bundleVerdict: string | null;
  riskColor: string;
}) {
  const insiderColor = VERDICT_COLOR[ins.verdict] ?? tokens.white60;
  const bundleColor = bundleVerdict ? (BUNDLE_COLOR[bundleVerdict] ?? tokens.white60) : null;
  const sp24 = ins.sell_pressure_24h ?? 0;
  const pressureColor = sp24 > 0.6 ? tokens.risk.critical : sp24 > 0.4 ? tokens.risk.high : tokens.risk.medium;

  return (
    <View style={styles.signalsWrap}>
      <View style={styles.sectionDivider} />
      <Text style={styles.signalsTitle}>MARKET SIGNALS</Text>

      {/* Insider dump status */}
      <View style={styles.signalRow}>
        <View style={[styles.signalIconWrap, { backgroundColor: `${insiderColor}15` }]}>
          <PulsingDot color={insiderColor} />
        </View>
        <View style={styles.signalInfo}>
          <Text style={[styles.signalLabel, { color: insiderColor }]}>
            {ins.verdict === 'insider_dump' ? 'INSIDER DUMP CONFIRMED' : ins.verdict === 'suspicious' ? 'SUSPICIOUS ACTIVITY' : 'CLEAN'}
          </Text>
          {ins.deployer_exited && (
            <Text style={[styles.signalSub, { color: tokens.risk.critical }]}>Deployer wallet fully exited</Text>
          )}
        </View>
        <Text style={[styles.signalScore, { color: insiderColor }]}>
          {(ins.risk_score * 100).toFixed(0)}%
        </Text>
      </View>

      {/* Price performance */}
      {(ins.price_change_1h != null || ins.price_change_24h != null) && (
        <View style={styles.priceRow}>
          {ins.price_change_1h != null && (
            <View style={styles.priceItem}>
              <Text style={[styles.priceValue, { color: ins.price_change_1h < -10 ? tokens.risk.critical : ins.price_change_1h < 0 ? tokens.risk.high : tokens.risk.low }]}>
                {fmtPct(ins.price_change_1h)}
              </Text>
              <Text style={styles.priceLabel}>1h</Text>
            </View>
          )}
          {ins.price_change_6h != null && (
            <View style={styles.priceItem}>
              <Text style={[styles.priceValue, { color: ins.price_change_6h < -20 ? tokens.risk.critical : ins.price_change_6h < 0 ? tokens.risk.high : tokens.risk.low }]}>
                {fmtPct(ins.price_change_6h)}
              </Text>
              <Text style={styles.priceLabel}>6h</Text>
            </View>
          )}
          {ins.price_change_24h != null && (
            <View style={styles.priceItem}>
              <Text style={[styles.priceValue, { color: ins.price_change_24h < -40 ? tokens.risk.critical : ins.price_change_24h < 0 ? tokens.risk.high : tokens.risk.low }]}>
                {fmtPct(ins.price_change_24h)}
              </Text>
              <Text style={styles.priceLabel}>24h</Text>
            </View>
          )}
        </View>
      )}

      {/* Sell pressure */}
      {ins.sell_pressure_24h != null && (
        <View style={styles.pressureRow}>
          <View style={styles.pressureHeader}>
            <Text style={styles.pressureLabel}>Sell pressure 24h</Text>
            <Text style={[styles.pressureValue, { color: pressureColor }]}>
              {(sp24 * 100).toFixed(0)}%
            </Text>
          </View>
          <PressureBar value={sp24} color={pressureColor} />
        </View>
      )}

      {/* SOL extracted */}
      {solExtracted != null && solExtracted > 0 && (
        <View style={styles.extractedRow}>
          <Text style={styles.extractedLabel}>SOL extracted</Text>
          <Text style={[styles.extractedValue, { color: tokens.accent }]}>
            {solExtracted.toFixed(2)} SOL
          </Text>
        </View>
      )}

      {/* Bundle verdict */}
      {bundleVerdict && bundleVerdict !== 'early_buyers_no_link_proven' && bundleColor && (
        <View style={[styles.bundlePill, { backgroundColor: `${bundleColor}15`, borderColor: `${bundleColor}30` }]}>
          <Text style={[styles.bundlePillText, { color: bundleColor }]}>
            {bundleVerdict.replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>
      )}

      {/* Insider flags */}
      {(ins.flags?.length ?? 0) > 0 && (
        <View style={styles.flagsRow}>
          {ins.flags!.map((flag) => (
            <View key={flag} style={styles.flagPill}>
              <Text style={styles.flagPillText}>{flag.replace(/_/g, ' ')}</Text>
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
  // Determine the effective badge — strongest signal across all sources
  const effectiveRiskLabel = (() => {
    if (insiderSell?.verdict === 'insider_dump' && insiderSell?.deployer_exited) return 'CRITICAL';
    if (insiderSell?.verdict === 'insider_dump') return 'HIGH';
    if (insiderSell?.verdict === 'suspicious') return 'MEDIUM';
    if (!dc) return 'NO DATA';
    if (dc.risk_level === 'insufficient_data') return 'UNVERIFIED';
    return dc.risk_level.toUpperCase().replace('_', ' ');
  })();

  const effectiveBadgeColor = (() => {
    if (insiderSell?.verdict === 'insider_dump') return tokens.risk.critical;
    if (insiderSell?.verdict === 'suspicious') return tokens.risk.medium;
    if (!dc || dc.risk_level === 'insufficient_data') return tokens.white35;
    return riskColor; // dc-based risk color (low/medium/high/critical)
  })();

  const hasHistory = dc != null && dc.sample_count >= 3 && dc.median_rug_hours > 0;
  const windowStartH = dc ? Math.max(dc.median_rug_hours - dc.stdev_rug_hours, 0) : 0;
  const hoursRemaining = dc ? windowStartH - dc.elapsed_hours : 0;
  const pastWindow = dc ? dc.elapsed_hours > (dc.median_rug_hours + dc.stdev_rug_hours) : false;
  const inWindow = dc
    ? dc.elapsed_hours >= windowStartH && dc.elapsed_hours <= (dc.median_rug_hours + dc.stdev_rug_hours)
    : false;

  // Live countdown — refreshes every 60s
  const [, forceUpdate] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    if (!hasHistory || hoursRemaining <= 0) return;
    intervalRef.current = setInterval(() => forceUpdate((n) => n + 1), 60_000);
    return () => clearInterval(intervalRef.current);
  }, [hasHistory, hoursRemaining]);

  const confidenceDots = dc ? (CONFIDENCE_DOTS[dc.confidence_level] ?? 1) : 0;
  const confidenceColor = dc ? (CONFIDENCE_COLOR[dc.confidence_level] ?? tokens.white35) : tokens.white35;
  const hasBreakdown = dc?.basis_breakdown != null && Object.keys(dc.basis_breakdown).length > 0;
  const isActive = insiderSell?.verdict === 'insider_dump' || inWindow;

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <GlassCard style={[styles.card, { borderColor: `${effectiveBadgeColor}35`, borderWidth: 1 }]}>

        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>DEATH CLOCK</Text>
          <View style={[styles.riskBadge, { backgroundColor: `${effectiveBadgeColor}18`, borderColor: `${effectiveBadgeColor}40` }]}>
            {isActive && <PulsingDot color={effectiveBadgeColor} />}
            <Text style={[styles.riskBadgeText, { color: effectiveBadgeColor }]}>{effectiveRiskLabel}</Text>
          </View>
        </View>

        {/* Confidence note (deployer history) */}
        {dc && <Text style={styles.note}>{dc.confidence_note}</Text>}

        {/* Countdown / status box */}
        {dc && (
          hasHistory ? (
            <View style={[styles.countdownWrap, {
              backgroundColor: inWindow ? `${riskColor}12` : pastWindow ? `${tokens.risk.low}12` : tokens.bgGlass8,
              borderColor: inWindow ? `${riskColor}30` : pastWindow ? `${tokens.risk.low}30` : tokens.borderSubtle,
            }]}>
              {inWindow ? (
                <View style={styles.countdownInner}>
                  <PulsingDot color={riskColor} />
                  <Text style={[styles.countdownLabel, { color: riskColor }]}>WINDOW OPEN</Text>
                  <Text style={styles.countdownSub}>Rug may occur at any time</Text>
                </View>
              ) : pastWindow ? (
                <View style={styles.countdownInner}>
                  <Text style={[styles.countdownLabel, { color: tokens.risk.low }]}>PAST WINDOW</Text>
                  <Text style={styles.countdownSub}>Survived beyond predicted range</Text>
                </View>
              ) : (
                <View style={styles.countdownInner}>
                  <Text style={styles.countdownTimerLabel}>Window opens in</Text>
                  <Text style={[styles.countdownTimer, { color: riskColor }]}>{fmtHours(hoursRemaining)}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.countdownWrap, { borderColor: tokens.borderSubtle }]}>
              <Text style={styles.noDataText}>
                {dc.sample_count === 0
                  ? 'New deployer — no historical rug data'
                  : `Only ${dc.sample_count} sample${dc.sample_count === 1 ? '' : 's'} — more data needed`}
              </Text>
            </View>
          )
        )}

        {/* Timeline */}
        {dc && hasHistory && <Timeline dc={dc} riskColor={riskColor} />}

        {/* Deployer history stats strip */}
        {dc && (
          <View style={styles.statsStrip}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, dc.historical_rug_count > 0 ? { color: tokens.risk.critical } : undefined]}>
                {dc.historical_rug_count}
              </Text>
              <Text style={styles.statLabel}>Rugs</Text>
            </View>
            {dc.median_rug_hours > 0 && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{Math.round(dc.median_rug_hours)}h</Text>
                <Text style={styles.statLabel}>Median rug</Text>
              </View>
            )}
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{Math.round(dc.elapsed_hours)}h</Text>
              <Text style={styles.statLabel}>Elapsed</Text>
            </View>
            <View style={styles.statItem}>
              <View style={styles.dotsRow}>
                {[1, 2, 3].map((d) => (
                  <View key={d} style={[styles.dot, { backgroundColor: d <= confidenceDots ? confidenceColor : tokens.white10 }]} />
                ))}
              </View>
              <Text style={styles.statLabel}>Confidence</Text>
            </View>
          </View>
        )}

        {dc && dc.sample_count > 0 && (
          <Text style={styles.sampleNote}>
            Based on {dc.sample_count} historical sample{dc.sample_count === 1 ? '' : 's'}
          </Text>
        )}

        {/* Basis breakdown */}
        {hasBreakdown && (
          <View style={styles.breakdownWrap}>
            <View style={styles.sectionDivider} />
            <Text style={styles.signalsTitle}>RUG MECHANISMS</Text>
            <View style={styles.pillsWrap}>
              {Object.entries(dc!.basis_breakdown!).map(([mechanism, count]) => (
                <View key={mechanism} style={styles.pill}>
                  <Text style={styles.pillText}>{mechanism.replace(/_/g, ' ')} ×{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Predicted window dates */}
        {dc?.predicted_window_start && dc?.predicted_window_end && (
          <View style={styles.windowDates}>
            <Text style={styles.windowDatesLabel}>Predicted window</Text>
            <Text style={[styles.windowDatesValue, { color: riskColor }]}>
              {new Date(dc.predicted_window_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' – '}
              {new Date(dc.predicted_window_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        {/* Market signals panel — live data */}
        {insiderSell && (
          <MarketSignalsPanel
            ins={insiderSell}
            solExtracted={solExtracted ?? null}
            bundleVerdict={bundleVerdict ?? null}
            riskColor={effectiveBadgeColor}
          />
        )}

        {/* Deployer DNA — historical pattern */}
        {deployerProfile && <DeployerDNAPanel dp={deployerProfile} />}
      </GlassCard>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {},

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.2,
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

  note: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    lineHeight: 18,
    marginBottom: 12,
  },

  countdownWrap: {
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
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
    fontSize: 28,
    letterSpacing: 1,
  },
  noDataText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
    textAlign: 'center',
  },

  // Timeline
  timelineWrap: { marginBottom: 16, gap: 8 },
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

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
    marginBottom: 4,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  statLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  dotsRow: { flexDirection: 'row', gap: 4, alignItems: 'center', height: 20 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },

  sampleNote: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white20,
    textAlign: 'center',
    marginTop: 6,
  },

  breakdownWrap: { marginTop: 12 },
  sectionDivider: {
    height: 1,
    backgroundColor: tokens.borderSubtle,
    marginBottom: 10,
  },

  pillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    backgroundColor: `${tokens.accent}15`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${tokens.accent}30`,
  },
  pillText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.accent,
    textTransform: 'capitalize',
  },

  windowDates: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
    gap: 3,
  },
  windowDatesLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 0.5,
  },
  windowDatesValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
  },

  // Market signals
  signalsWrap: { marginTop: 4 },
  signalsTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1,
    marginBottom: 10,
  },

  signalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  signalIconWrap: {
    width: 28,
    height: 28,
    borderRadius: tokens.radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalInfo: { flex: 1 },
  signalLabel: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    letterSpacing: 0.5,
  },
  signalSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    marginTop: 1,
  },
  signalScore: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
  },

  // Price row
  priceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.xs,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  priceValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
  },
  priceLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    marginTop: 2,
  },

  // Sell pressure
  pressureRow: { marginBottom: 10, gap: 6 },
  pressureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pressureLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  pressureValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
  },
  pressureTrack: {
    height: 4,
    backgroundColor: tokens.white10,
    borderRadius: 2,
    overflow: 'hidden',
  },
  pressureFill: {
    height: '100%',
    borderRadius: 2,
  },

  // SOL extracted
  extractedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  extractedLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  extractedValue: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
  },

  // Bundle pill
  bundlePill: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    marginBottom: 8,
  },
  bundlePillText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    letterSpacing: 0.6,
  },

  // Insider flags
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  flagPill: {
    backgroundColor: `${tokens.risk.critical}12`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: `${tokens.risk.critical}25`,
  },
  flagPillText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.risk.critical,
  },

  // Deployer DNA
  dnaSummaryRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  dnaStatItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  dnaTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  dnaTag: {
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  dnaTagText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    textTransform: 'capitalize',
  },
  dnaTagDanger: {
    backgroundColor: `${tokens.risk.critical}12`,
    borderColor: `${tokens.risk.critical}25`,
  },
  dnaTagDangerText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.risk.critical,
    textTransform: 'capitalize',
  },
  dnaTimeline: { gap: 0 },
  dnaTimelineItem: {
    flexDirection: 'row',
    gap: 10,
  },
  dnaSpineCol: {
    width: 12,
    alignItems: 'center',
    paddingTop: 4,
  },
  dnaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dnaLine: {
    flex: 1,
    width: 1,
    minHeight: 12,
    marginTop: 2,
  },
  dnaItemContent: {
    flex: 1,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
    gap: 2,
  },
  dnaItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dnaItemName: {
    flex: 1,
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white100,
  },
  dnaItemMcap: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  dnaOutcomeBadge: {
    borderRadius: tokens.radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dnaOutcomeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  dnaItemMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textTransform: 'capitalize',
  },
  dnaMore: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textAlign: 'center',
    marginTop: 6,
  },
});
