import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Skull, ChevronRight } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GaugeRing } from '../../src/components/ui/GaugeRing';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useLineage } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';

const RISK_COLOR: Record<string, string> = {
  low: tokens.risk.low,
  medium: tokens.risk.medium,
  high: tokens.risk.high,
  critical: tokens.risk.critical,
};

export default function DeathClockScreen() {
  const [mint, setMint] = useState('');
  const [submitted, setSubmitted] = useState('');

  const { data, isLoading, error, refetch } = useLineage(submitted, !!submitted);
  const dc = data?.death_clock;

  const handleSubmit = () => {
    if (mint.trim().length > 10) setSubmitted(mint.trim());
  };

  const riskColor = dc?.risk_level ? RISK_COLOR[dc.risk_level] ?? tokens.accent : tokens.accent;
  const confidence = dc?.confidence_level ?? 0;

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={styles.iconGlowWrap}>
                <View style={[styles.iconGlow, { backgroundColor: tokens.accent }]} />
                <Skull size={26} color={tokens.accent} strokeWidth={2.5} />
              </View>
              <Text style={styles.title}>Death Clock</Text>
            </View>
            <Text style={styles.subtitle}>Predict rug probability &amp; timeline</Text>
          </View>

          {/* Input — pill shaped */}
          <View style={styles.inputPill}>
            <TextInput
              style={styles.input}
              value={mint}
              onChangeText={setMint}
              placeholder="Mint address…"
              placeholderTextColor={tokens.white35}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <HapticButton
            variant="destructive"
            size="md"
            fullWidth
            loading={isLoading}
            onPress={handleSubmit}
            style={styles.cta}
          >
            PREDICT
          </HapticButton>

          {/* Result */}
          {submitted && isLoading && (
            <GlassCard>
              <SkeletonBlock lines={3} />
            </GlassCard>
          )}

          {submitted && !isLoading && error && (
            <GlassCard>
              <Text style={styles.errorText}>Failed to fetch data. Try again.</Text>
            </GlassCard>
          )}

          {dc && !isLoading && (
            <>
              {/* Gauge */}
              <GlassCard style={styles.gaugeCard}>
                <View style={styles.gaugeRow}>
                  <GaugeRing
                    value={confidence}
                    color={riskColor}
                    size={140}
                    label={`${Math.round(confidence * 100)}%`}
                    sublabel="CONFIDENCE"
                  />
                  <View style={styles.gaugeInfo}>
                    <RiskBadge level={dc.risk_level} size="md" />
                    {dc.predicted_window_start && (
                      <View style={styles.windowRow}>
                        <Text style={styles.windowLabel}>Window</Text>
                        <Text style={styles.windowValue}>
                          {dc.predicted_window_start}
                          {dc.predicted_window_end ? ` – ${dc.predicted_window_end}` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </GlassCard>

              {/* Market signals */}
              {dc.market_signals && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>MARKET SIGNALS</Text>
                  <View style={styles.signals}>
                    <SignalRow label="Liquidity trend" value={dc.market_signals.liquidity_trend ?? '–'} />
                    <SignalRow label="Volume trend" value={dc.market_signals.volume_trend ?? '–'} />
                    {dc.market_signals.sell_pressure != null && (
                      <SignalRow
                        label="Sell pressure"
                        value={`${Math.round(dc.market_signals.sell_pressure * 100)}%`}
                      />
                    )}
                    <SignalRow
                      label="Holder exodus"
                      value={dc.market_signals.holder_exodus ? 'DETECTED' : 'None'}
                    />
                  </View>
                </GlassCard>
              )}

              {/* Link to full token */}
              <TouchableOpacity
                onPress={() => router.push(`/token/${submitted}` as any)}
                activeOpacity={0.75}
              >
                <GlassCard style={styles.linkCard} noPadding>
                  <View style={styles.linkInner}>
                    <Text style={styles.linkText}>Full Lineage Report</Text>
                    <ChevronRight size={18} color={tokens.secondary} />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.signalRow}>
      <Text style={styles.signalLabel}>{label}</Text>
      <Text style={styles.signalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 120,
    gap: 12,
  },

  header: { paddingTop: 24, paddingBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconGlowWrap: { position: 'relative', width: 26, height: 26 },
  iconGlow: {
    position: 'absolute',
    top: -6, left: -6, right: -6, bottom: -6,
    opacity: 0.20,
    borderRadius: 100,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: 26,
    color: tokens.white100,
    letterSpacing: -0.52,
  },
  subtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginLeft: 36,
  },

  inputPill: {
    backgroundColor: tokens.bgGlass8,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginBottom: 12,
  },
  input: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  cta: {},

  gaugeCard: {},
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  gaugeInfo: { flex: 1, gap: 12 },
  windowRow: { gap: 4 },
  windowLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  windowValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },

  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 12,
  },
  signals: { gap: 8 },
  signalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  signalLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  signalValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    textTransform: 'capitalize',
  },

  linkCard: {},
  linkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: tokens.spacing.cardPadding,
  },
  linkText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.secondary,
  },

  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
