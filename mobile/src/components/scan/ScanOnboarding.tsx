import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Search, ScanLine, Shield, ChevronRight, TrendingUp, Layers } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTopTokens } from '../../lib/query';
import { RiskBadge } from '../ui/RiskBadge';
import { deriveMarketRisk } from '../../lib/risk';
import { tokens } from '../../theme/tokens';

// ── Micro-tutorial steps ────────────────────────────────────────────────────
const STEPS = [
  { icon: Search, title: 'Paste', description: 'Paste a mint address' },
  { icon: ScanLine, title: 'Scan', description: 'We analyze the token' },
  { icon: Shield, title: 'Results', description: 'Get forensic insights' },
] as const;

function fmtMcap(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function TokenImage({ uri, symbol }: { uri?: string | null; symbol?: string }) {
  const [errored, setErrored] = React.useState(false);
  const hasUri = !!uri && uri.trim() !== '' && !errored;
  if (hasUri) {
    return (
      <Image
        source={{ uri }}
        style={styles.tokenImg}
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <View style={[styles.tokenImg, styles.tokenImgFallback]}>
      <Text style={styles.tokenImgText}>{symbol?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

export function ScanOnboarding() {
  const { data: topTokens, isLoading } = useTopTokens(5);

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.container}>
      {/* Hero text */}
      <View style={styles.heroSection}>
        <Text style={styles.title}>Paste any Solana token address</Text>
        <Text style={styles.subtitle}>
          Scan any token to reveal its forensic risk profile
        </Text>
      </View>

      {/* Trending tokens section */}
      <View style={styles.trendingSection}>
        <View style={styles.trendingHeader}>
          <TrendingUp size={13} color={tokens.secondary} />
          <Text style={styles.trendingTitle}>TRENDING SCANS</Text>
        </View>

        {isLoading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={tokens.secondary} />
          </View>
        )}

        {!isLoading && topTokens && topTokens.length > 0 && topTokens.map((token, index) => {
          const risk = deriveMarketRisk({ mint: token.mint, market_cap_usd: token.mcap_usd });
          return (
            <Animated.View
              key={token.mint}
              entering={FadeInDown.delay(100 + index * tokens.timing.listItem).duration(300).springify()}
            >
              <TouchableOpacity
                style={styles.tokenCard}
                onPress={() => router.push(`/token/${token.mint}` as any)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Scan ${token.name}`}
              >
                <TokenImage uri={token.image_uri} symbol={token.symbol} />
                <View style={styles.tokenInfo}>
                  <Text style={styles.tokenName} numberOfLines={1}>{token.name}</Text>
                  <View style={styles.tokenMeta}>
                    <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    {token.mcap_usd != null && token.mcap_usd > 0 && (
                      <Text style={styles.tokenMcap}>{fmtMcap(token.mcap_usd)}</Text>
                    )}
                    <Text style={styles.tokenScans}>{token.event_count} scans</Text>
                  </View>
                </View>
                <RiskBadge level={risk} size="sm" />
                <ChevronRight size={14} color={tokens.textTertiary} />
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        {!isLoading && (!topTokens || topTokens.length === 0) && (
          <View style={styles.emptyTrending}>
            <Text style={styles.emptyText}>No trending tokens yet</Text>
          </View>
        )}
      </View>

      {/* Batch scan link */}
      <TouchableOpacity
        style={styles.batchLink}
        onPress={() => router.push('/batch-scan' as any)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Open batch scan"
      >
        <Layers size={16} color={tokens.secondary} />
        <Text style={styles.batchText}>Batch Scan</Text>
        <Text style={styles.batchSub}>Scan up to 50 tokens at once</Text>
        <ChevronRight size={14} color={tokens.textTertiary} />
      </TouchableOpacity>

      {/* Micro-tutorial steps */}
      <Animated.View
        entering={FadeInDown.delay(250).duration(350).springify()}
        style={styles.stepsSection}
      >
        {STEPS.map((step, index) => {
          const IconComponent = step.icon;
          return (
            <React.Fragment key={step.title}>
              {index > 0 && (
                <ChevronRight size={14} color={tokens.textTertiary} style={styles.stepChevron} />
              )}
              <View style={styles.stepCard}>
                <IconComponent size={18} color={tokens.secondary} />
                <View style={styles.stepTextWrap}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.description}</Text>
                </View>
              </View>
            </React.Fragment>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 24,
    gap: 20,
  },

  // ── Hero ───────────────────────────────────────────────────────────────────
  heroSection: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.textTertiary,
    textAlign: 'center',
  },

  // ── Trending tokens ─────────────────────────────────────────────────────────
  trendingSection: {
    gap: 6,
  },
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  trendingTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
    letterSpacing: 1,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  tokenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tokenImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  tokenImgFallback: {
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenImgText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  tokenInfo: {
    flex: 1,
    gap: 2,
  },
  tokenName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white100,
  },
  tokenMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tokenSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  tokenMcap: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  tokenScans: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  emptyTrending: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },

  // ── Batch scan link ─────────────────────────────────────────────────────────
  batchLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  batchText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
  },
  batchSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    flex: 1,
  },

  // ── Micro-tutorial steps ───────────────────────────────────────────────────
  stepsSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  stepChevron: {
    marginTop: 10,
    marginHorizontal: 4,
  },
  stepCard: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  stepTextWrap: {
    alignItems: 'center',
    gap: 2,
  },
  stepTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white100,
  },
  stepDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    textAlign: 'center',
  },
});
