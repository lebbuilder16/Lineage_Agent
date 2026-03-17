import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Skull, ChevronRight, X, Factory } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { DeathClockCard } from '../../src/components/ui/DeathClockCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useLineage } from '../../src/lib/query';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';
import { deriveRiskLevel, RISK_COLOR, isValidSolanaAddress } from '../../src/lib/risk';
import { ErrorBanner } from '../../src/components/ui/ErrorBanner';
import { handleApiError } from '../../src/lib/error-handler';

// ─── Factory Banner ────────────────────────────────────────────────────────────

function FactoryBanner({ operatorSamples }: { operatorSamples: number }) {
  return (
    <GlassCard style={styles.factoryCard}>
      <View style={styles.factoryRow}>
        <Factory size={16} color={tokens.risk.high} strokeWidth={2} />
        <View style={styles.factoryInfo}>
          <Text style={styles.factoryTitle}>FACTORY DEPLOYER</Text>
          <Text style={styles.factoryNote}>
            {operatorSamples > 0
              ? `Prediction based on operator network · ${operatorSamples} sibling samples`
              : 'Rotates wallet addresses — individual history unavailable'}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function DeathClockScreen() {
  const insets = useSafeAreaInsets();
  const pendingClockMint = useAuthStore((s) => s.pendingClockMint);
  const setPendingClockMint = useAuthStore((s) => s.setPendingClockMint);

  const [mint, setMint] = useState(pendingClockMint ?? '');
  const [submitted, setSubmitted] = useState(pendingClockMint ?? '');

  // Consume the pending mint once on mount
  React.useEffect(() => {
    if (pendingClockMint) setPendingClockMint(null);
  }, []);

  const { data, isLoading, error } = useLineage(submitted, !!submitted);

  const [validationError, setValidationError] = useState('');

  const handleSubmit = () => {
    const trimmed = mint.trim();
    if (!isValidSolanaAddress(trimmed)) {
      setValidationError('Invalid Solana address');
      return;
    }
    setValidationError('');
    setSubmitted(trimmed);
  };

  const riskLevel = deriveRiskLevel(data);
  const riskColor = RISK_COLOR[riskLevel];
  const hasResult = !!submitted && !isLoading && !error;

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={styles.safe}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
          showsVerticalScrollIndicator={false}
        >
          <ScreenHeader
            icon={<Skull size={26} color={tokens.accent} strokeWidth={2.5} />}
            glowColor={tokens.accent}
            title="Death Clock"
            subtitle="Predict rug probability & timeline"
            paddingBottom={12}
            style={{ paddingHorizontal: 0 }}
          />

          {/* Input */}
          <View style={styles.inputPill}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={mint}
              onChangeText={(t) => { setMint(t); setValidationError(''); }}
              placeholder="Mint address…"
              placeholderTextColor={tokens.white35}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Token mint address"
            />
            {mint.length > 0 && (
              <TouchableOpacity
                onPress={() => { setMint(''); setSubmitted(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ paddingRight: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Clear input"
              >
                <X size={16} color={tokens.white35} />
              </TouchableOpacity>
            )}
          </View>
          {validationError !== '' && (
            <Text style={styles.validationError}>{validationError}</Text>
          )}

          <HapticButton
            variant="destructive"
            size="md"
            fullWidth
            loading={isLoading}
            onPress={handleSubmit}
            style={styles.cta}
            accessibilityRole="button"
            accessibilityLabel="Predict rug probability"
          >
            PREDICT
          </HapticButton>

          {/* Token identity preview */}
          {data?.query_token && submitted && !isLoading && (
            <GlassCard style={styles.tokenInfoCard}>
              <View style={styles.tokenInfoRow}>
                {data.query_token.image_uri ? (
                  <Image source={{ uri: data.query_token.image_uri }} style={styles.tokenInfoImg} />
                ) : (
                  <View style={[styles.tokenInfoImg, styles.tokenInfoImgFallback]}>
                    <Text style={styles.tokenInfoFallbackText}>{data.query_token.symbol?.[0] ?? '?'}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.tokenInfoName}>{data.query_token.name}</Text>
                  <Text style={styles.tokenInfoSymbol}>{data.query_token.symbol}</Text>
                </View>
              </View>
            </GlassCard>
          )}

          {/* Loading */}
          {submitted && isLoading && (
            <GlassCard>
              <SkeletonBlock lines={3} />
            </GlassCard>
          )}

          {/* Error */}
          {submitted && !isLoading && error && (
            <ErrorBanner
              error={handleApiError(error)}
              onRetry={() => setSubmitted(mint.trim())}
            />
          )}

          {/* Full result */}
          {hasResult && (
            <>
              {/* Factory banner */}
              {data?.death_clock?.is_factory && (
                <FactoryBanner operatorSamples={data.death_clock.operator_sample_count ?? 0} />
              )}

              {/* Full Death Clock analysis */}
              {(data?.death_clock || data?.insider_sell) && (
                <DeathClockCard
                  dc={data.death_clock ?? null}
                  riskColor={riskColor}
                  insiderSell={data.insider_sell ?? null}
                  solExtracted={data.sol_flow?.total_extracted_sol ?? null}
                  bundleVerdict={data.bundle_report?.overall_verdict ?? null}
                  deployerProfile={data.deployer_profile ?? null}
                />
              )}

              {/* Link to full report */}
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  content: {
    paddingHorizontal: tokens.spacing.screenPadding,
    gap: 12,
  },

  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
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

  tokenInfoCard: {},
  tokenInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tokenInfoImg: { width: 48, height: 48, borderRadius: tokens.radius.sm },
  tokenInfoImgFallback: {
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenInfoFallbackText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  tokenInfoName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  tokenInfoSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },

  factoryCard: { borderColor: `${tokens.risk.high}30`, borderWidth: 1 },
  factoryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  factoryInfo: { flex: 1 },
  factoryTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.risk.high,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  factoryNote: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    lineHeight: 16,
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
  validationError: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.accent,
    paddingHorizontal: 20,
    marginTop: -4,
  },
});
