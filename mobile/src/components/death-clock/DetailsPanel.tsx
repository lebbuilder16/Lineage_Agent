import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import type { DeathClockForecast, InsiderSellReport, DeployerProfile } from '../../types/api';

interface DetailsPanelProps {
  dc: DeathClockForecast | null;
  insiderSell?: InsiderSellReport | null;
  deployerProfile?: DeployerProfile | null;
}

export function DetailsPanel({ dc, insiderSell, deployerProfile }: DetailsPanelProps) {
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
                backgroundColor: t.rugged_at ? tokens.risk.critical : tokens.textDisabled,
              }]} />
              <Text style={styles.tokenHistoryName} numberOfLines={1}>{t.name}</Text>
              <Text style={[styles.tokenHistoryOutcome, {
                color: t.rugged_at ? tokens.risk.critical : tokens.textTertiary,
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

const styles = StyleSheet.create({
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
    color: tokens.textTertiary,
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
    color: tokens.textTertiary,
  },
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
