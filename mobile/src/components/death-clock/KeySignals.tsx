import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '../../theme/tokens';
import type { DeathClockForecast, InsiderSellReport, DeployerProfile } from '../../types/api';

interface KeySignalsProps {
  dc: DeathClockForecast | null;
  insiderSell?: InsiderSellReport | null;
  bundleVerdict?: string | null;
  deployerProfile?: DeployerProfile | null;
  solExtracted?: number | null;
}

export function KeySignals({ dc, insiderSell, bundleVerdict, deployerProfile, solExtracted }: KeySignalsProps) {
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
    signals.push({ color: tokens.textTertiary, text: 'New deployer — no rug history on record' });
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

  const accessibilityLabel = signals.slice(0, 3).map((sig) => sig.text).join('. ');

  return (
    <View
      style={styles.signalsWrap}
      accessible={true}
      accessibilityRole="summary"
      accessibilityLabel={`Key signals: ${accessibilityLabel}`}
    >
      {signals.slice(0, 3).map((sig, i) => (
        <View key={i} style={styles.signalRow}>
          <View style={[styles.signalDot, { backgroundColor: sig.color }]} accessibilityElementsHidden />
          <Text style={[styles.signalText, { color: sig.color === tokens.risk.low ? tokens.white60 : tokens.white100 }]}>
            {sig.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
