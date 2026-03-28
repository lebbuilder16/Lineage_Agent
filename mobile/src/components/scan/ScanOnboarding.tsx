import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Search, ScanLine, Shield, ChevronRight } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { tokens } from '../../theme/tokens';

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
    <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.container}>
      {/* Hero text */}
      <View style={styles.heroSection}>
        <Text style={styles.title}>Paste any Solana token address</Text>
        <Text style={styles.subtitle}>
          Scan any token to reveal its forensic risk profile
        </Text>
      </View>

      {/* Example tokens */}
      <View style={styles.examplesSection}>
        {EXAMPLE_TOKENS.map((token, index) => (
          <Animated.View
            key={token.mint}
            entering={FadeInDown.delay(100 + index * tokens.timing.listItem).duration(300).springify()}
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
    gap: 28,
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

  // ── Example token cards ────────────────────────────────────────────────────
  examplesSection: {
    gap: 8,
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.bgGlass,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  exampleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  symbolBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.secondary,
  },
  exampleInfo: {
    gap: 2,
    flex: 1,
  },
  exampleSymbol: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  exampleMint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  tryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${tokens.secondary}15`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
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
