import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Search, ScanLine, Shield, ChevronRight } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';
import { AnimatedEmptyState } from '../ui/AnimatedEmptyState';

// ── Hardcoded example tokens ────────────────────────────────────────────────
const EXAMPLE_TOKENS = [
  {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111',
    label: 'Wrapped SOL',
  },
  {
    symbol: 'BONK',
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    label: 'Bonk',
  },
  {
    symbol: 'JUP',
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    label: 'Jupiter',
  },
] as const;

// ── Micro-tutorial steps ────────────────────────────────────────────────────
const STEPS = [
  { icon: Search, title: 'Paste', description: 'Paste a mint address' },
  { icon: ScanLine, title: 'Scan', description: 'We analyze the token' },
  { icon: Shield, title: 'Results', description: 'Get forensic insights' },
] as const;

export function ScanOnboarding() {
  return (
    <View style={styles.container}>
      {/* Animated hero illustration */}
      <AnimatedEmptyState
        variant="scan"
        title="Paste any Solana token address"
        subtitle="Scan any token to reveal its forensic risk profile"
      />

      {/* Example tokens */}
      <View style={styles.examplesSection}>
        {EXAMPLE_TOKENS.map((token, index) => (
          <Animated.View
            key={token.mint}
            entering={FadeInDown.delay(300 + index * tokens.timing.listItem).duration(300).springify()}
          >
            <TouchableOpacity
              style={styles.exampleCard}
              onPress={() => router.push(`/token/${token.mint}` as any)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Try scanning ${token.symbol}`}
            >
              <View style={styles.exampleLeft}>
                <View style={styles.symbolBadge}>
                  <Text style={styles.symbolText}>{token.symbol[0]}</Text>
                </View>
                <View style={styles.exampleInfo}>
                  <Text style={styles.exampleSymbol}>{token.symbol}</Text>
                  <Text style={styles.exampleMint} numberOfLines={1}>
                    {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                  </Text>
                </View>
              </View>
              <View style={styles.tryBadge}>
                <Text style={styles.tryText}>Try it</Text>
                <ChevronRight size={12} color={tokens.secondary} />
              </View>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>

      {/* Micro-tutorial steps */}
      <Animated.View
        entering={FadeInDown.delay(500).duration(350).springify()}
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
                <View style={styles.stepIconWrap}>
                  <IconComponent size={18} color={tokens.secondary} />
                </View>
                <View style={styles.stepTextWrap}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.description}</Text>
                </View>
              </View>
            </React.Fragment>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 20,
  },

  // ── Example token cards ────────────────────────────────────────────────────
  examplesSection: {
    gap: 8,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  exampleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  symbolBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(173, 200, 255, 0.15)',
  },
  symbolText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 16,
    color: tokens.secondary,
  },
  exampleInfo: {
    gap: 3,
    flex: 1,
  },
  exampleSymbol: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  exampleMint: {
    fontFamily: 'SpaceGrotesk-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 0.5,
  },
  tryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${tokens.secondary}12`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${tokens.secondary}25`,
  },
  tryText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.secondary,
  },

  // ── Micro-tutorial steps ───────────────────────────────────────────────────
  stepsSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  stepChevron: {
    marginTop: 12,
    marginHorizontal: 4,
  },
  stepCard: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  stepIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${tokens.secondary}12`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTextWrap: {
    alignItems: 'center',
    gap: 2,
  },
  stepTitle: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white100,
    letterSpacing: -0.2,
  },
  stepDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    textAlign: 'center',
  },
});
