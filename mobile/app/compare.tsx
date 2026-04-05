import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { ChevronLeft, ArrowLeftRight } from 'lucide-react-native';
import { GlassCard } from '../src/components/ui/GlassCard';
import { GaugeRing } from '../src/components/ui/GaugeRing';
import { HapticButton } from '../src/components/ui/HapticButton';
import { SkeletonBlock } from '../src/components/ui/SkeletonLoader';
import { FeatureGate } from '../src/components/ui/FeatureGate';
import { useCompareTokens } from '../src/lib/query';
import { tokens } from '../src/theme/tokens';

const VERDICT_COLORS: Record<string, string> = {
  identical_operator: tokens.risk.critical,
  clone: tokens.risk.high,
  related: tokens.risk.medium,
  unrelated: tokens.risk.low,
};

export default function CompareScreen() {
  const insets = useSafeAreaInsets();
  const [mintA, setMintA] = useState('');
  const [mintB, setMintB] = useState('');
  const [submitted, setSubmitted] = useState<[string, string] | null>(null);

  const enabled = !!submitted;
  const { data, isLoading, error } = useCompareTokens(
    submitted?.[0] ?? '',
    submitted?.[1] ?? '',
    enabled,
  );

  const handleCompare = () => {
    if (mintA.trim().length > 10 && mintB.trim().length > 10) {
      setSubmitted([mintA.trim(), mintB.trim()]);
    }
  };

  const verdictColor = data?.verdict ? VERDICT_COLORS[data.verdict] ?? tokens.white60 : tokens.white60;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.safe}>
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>COMPARE TOKENS</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <FeatureGate feature="Compare Tokens" requiredPlan="pro">
          {/* Inputs */}
          <GlassCard>
            <Text style={styles.inputLabel}>Token A</Text>
            <TextInput
              style={styles.input}
              value={mintA}
              onChangeText={setMintA}
              placeholder="Mint address…"
              placeholderTextColor={tokens.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.divider} />
            <Text style={styles.inputLabel}>Token B</Text>
            <TextInput
              style={styles.input}
              value={mintB}
              onChangeText={setMintB}
              placeholder="Mint address…"
              placeholderTextColor={tokens.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </GlassCard>

          <HapticButton
            variant="primary"
            size="md"
            fullWidth
            loading={isLoading}
            onPress={handleCompare}
          >
            <ArrowLeftRight size={16} color="#fff" />
            {'  '}COMPARE
          </HapticButton>

          {/* Results */}
          {submitted && isLoading && (
            <GlassCard><SkeletonBlock lines={4} /></GlassCard>
          )}

          {submitted && !isLoading && error && (
            <GlassCard>
              <Text style={styles.errorText}>Comparison failed. Check both mint addresses.</Text>
            </GlassCard>
          )}

          {data && !isLoading && (
            <>
              {/* Verdict */}
              <GlassCard style={styles.verdictCard}>
                <Text style={styles.verdictLabel}>VERDICT</Text>
                <Text style={[styles.verdict, { color: verdictColor }]}>
                  {data.verdict?.replace('_', ' ') ?? '—'}
                </Text>
                {(data.verdict_reasons?.length ?? 0) > 0 && (
                  <View style={styles.reasons}>
                    {(data.verdict_reasons ?? []).map((r, i) => (
                      <Text key={i} style={styles.reason}>• {r}</Text>
                    ))}
                  </View>
                )}
              </GlassCard>

              {/* Scores */}
              <GlassCard>
                <Text style={styles.sectionTitle}>SIMILARITY SCORES</Text>
                <View style={styles.gaugesRow}>
                  {data.composite_score != null && (
                    <GaugeRingItem
                      label="Composite"
                      value={data.composite_score}
                      color={verdictColor}
                    />
                  )}
                  {data.name_similarity != null && (
                    <GaugeRingItem label="Name" value={data.name_similarity} color={tokens.secondary} />
                  )}
                  {data.temporal_score != null && (
                    <GaugeRingItem label="Temporal" value={data.temporal_score} color={tokens.accent} />
                  )}
                </View>
              </GlassCard>

              {/* Token cards */}
              <View style={styles.tokenPair}>
                {data.token_a && (
                  <TouchableOpacity
                    style={styles.tokenHalf}
                    onPress={() => router.push(`/token/${data.token_a?.mint}` as any)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`View token A: ${data.token_a.name}`}
                  >
                    <GlassCard>
                      <Text style={styles.tokenPairLabel}>TOKEN A</Text>
                      {data.token_a.image_uri && (
                        <Image source={{ uri: data.token_a.image_uri }} style={styles.tokenPairImg} />
                      )}
                      <Text style={styles.tokenPairName} numberOfLines={1}>{data.token_a.name}</Text>
                    </GlassCard>
                  </TouchableOpacity>
                )}
                {data.token_b && (
                  <TouchableOpacity
                    style={styles.tokenHalf}
                    onPress={() => router.push(`/token/${data.token_b?.mint}` as any)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`View token B: ${data.token_b.name}`}
                  >
                    <GlassCard>
                      <Text style={styles.tokenPairLabel}>TOKEN B</Text>
                      {data.token_b.image_uri && (
                        <Image source={{ uri: data.token_b.image_uri }} style={styles.tokenPairImg} />
                      )}
                      <Text style={styles.tokenPairName} numberOfLines={1}>{data.token_b.name}</Text>
                    </GlassCard>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
          </FeatureGate>
        </ScrollView>
      </View>
    </View>
  );
}

function GaugeRingItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <GaugeRing
        value={value}
        color={color}
        size={80}
        strokeWidth={6}
        label={`${Math.round(value * 100)}`}
      />
      <Text style={{ fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.white60 }}>{label}</Text>
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
  navTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.5,
  },
  content: {
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 48,
    gap: 12,
  },
  inputLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginBottom: 4,
  },
  input: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
    paddingVertical: 4,
  },
  divider: { height: 1, backgroundColor: tokens.borderSubtle, marginVertical: 12 },

  verdictCard: { alignItems: 'center' },
  verdictLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 8,
  },
  verdict: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    letterSpacing: 1,
  },
  reasons: { marginTop: 12, gap: 4 },
  reason: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },

  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 16,
  },
  gaugesRow: { flexDirection: 'row', justifyContent: 'space-around' },

  tokenPair: { flexDirection: 'row', gap: 8 },
  tokenHalf: { flex: 1 },
  tokenPairLabel: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tokenPairImg: { width: 40, height: 40, borderRadius: tokens.radius.sm, marginBottom: 8 },
  tokenPairName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white100,
    marginBottom: 6,
  },

  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
