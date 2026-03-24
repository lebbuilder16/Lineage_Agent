import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react-native';
import { GlassCard } from '../src/components/ui/GlassCard';
import { HapticButton } from '../src/components/ui/HapticButton';
import { RiskBadge } from '../src/components/ui/RiskBadge';
import { tokens } from '../src/theme/tokens';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { LineageResult } from '../src/types/api';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev';
const MAX_MINTS = 50;
const BATCH_SIZE = 10;

type ResultEntry =
  | { status: 'ok'; data: LineageResult }
  | { status: 'error'; mint: string; message: string };

function riskFromResult(data: LineageResult): string {
  if (data.death_clock?.risk_level) {
    const rl = data.death_clock.risk_level;
    if (rl === 'first_rug' || rl === 'insufficient_data') return 'medium';
    return rl;
  }
  if (data.deployer_profile) {
    const rate = data.deployer_profile.rug_rate_pct;
    if (rate >= 75) return 'critical';
    if (rate >= 50) return 'high';
    if (rate >= 25) return 'medium';
    return 'low';
  }
  return 'medium';
}

function formatMcap(usd: number | null | undefined): string {
  if (usd == null) return '—';
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${(usd / 1_000).toFixed(0)}K`;
}

function truncateMint(mint: string): string {
  if (mint.length <= 12) return mint;
  return `${mint.slice(0, 6)}...${mint.slice(-4)}`;
}

export default function BatchScanScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ResultEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const parseMints = useCallback((): string[] => {
    return input
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, MAX_MINTS);
  }, [input]);

  const mintCount = parseMints().length;

  const handleScan = useCallback(async () => {
    const mints = parseMints();
    if (mints.length === 0) return;

    setLoading(true);
    setResults([]);
    setProgress({ done: 0, total: mints.length });

    const allResults: ResultEntry[] = [];
    const controller = new AbortController();
    abortRef.current = controller;

    // Process in batches of BATCH_SIZE (API limit is 10)
    for (let i = 0; i < mints.length; i += BATCH_SIZE) {
      if (controller.signal.aborted) break;

      const batch = mints.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(`${BASE_URL}/lineage/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mints: batch }),
          signal: controller.signal,
        });
        const data = await res.json();
        const batchResults: Record<string, LineageResult | string> = data.results ?? {};

        for (const mint of batch) {
          const entry = batchResults[mint];
          if (entry == null || typeof entry === 'string') {
            allResults.push({
              status: 'error',
              mint,
              message: typeof entry === 'string' ? entry : 'No result returned',
            });
          } else {
            allResults.push({ status: 'ok', data: entry });
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') break;
        for (const mint of batch) {
          allResults.push({
            status: 'error',
            mint,
            message: 'Network error',
          });
        }
      }

      setProgress({ done: Math.min(i + BATCH_SIZE, mints.length), total: mints.length });
      setResults([...allResults]);
    }

    setLoading(false);
    abortRef.current = null;
  }, [parseMints]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>BATCH SCAN</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Input area */}
          <GlassCard>
            <Text style={styles.sectionTitle}>MINT ADDRESSES</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Paste mint addresses (one per line)"
              placeholderTextColor={tokens.textPlaceholder}
              multiline
              maxLength={5000}
              numberOfLines={6}
              value={input}
              onChangeText={setInput}
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
            />
            <Text style={styles.countHint}>
              {mintCount} / {MAX_MINTS} addresses
            </Text>
          </GlassCard>

          {/* Scan button */}
          <HapticButton
            variant="primary"
            size="lg"
            fullWidth
            disabled={mintCount === 0 || loading}
            loading={loading}
            onPress={handleScan}
          >
            <Text style={styles.btnText}>
              {loading
                ? `SCANNING ${progress.done}/${progress.total}...`
                : `SCAN ALL (${mintCount})`}
            </Text>
          </HapticButton>

          {/* Progress indicator */}
          {loading && (
            <Animated.View entering={FadeInDown.duration(250)}>
              <Text style={styles.progressText}>
                Scanning {progress.done}/{progress.total}...
              </Text>
            </Animated.View>
          )}

          {/* Results list */}
          {results.length > 0 && (
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              <GlassCard>
                <Text style={styles.sectionTitle}>
                  RESULTS ({results.length})
                </Text>
                <View style={{ gap: 0 }}>
                  {results.map((entry, i) => {
                    if (entry.status === 'error') {
                      return (
                        <View key={entry.mint + i} style={styles.resultRow}>
                          <View style={styles.errorIcon}>
                            <AlertCircle size={16} color={tokens.accent} />
                          </View>
                          <View style={styles.resultInfo}>
                            <Text style={styles.resultName} numberOfLines={1}>
                              {truncateMint(entry.mint)}
                            </Text>
                            <Text style={styles.resultError} numberOfLines={1}>
                              {entry.message}
                            </Text>
                          </View>
                        </View>
                      );
                    }

                    const d = entry.data;
                    const name = d.query_token?.name || truncateMint(d.mint);
                    const mcap = formatMcap(d.query_token?.market_cap_usd);
                    const risk = riskFromResult(d);

                    return (
                      <TouchableOpacity
                        key={d.mint + i}
                        onPress={() => router.push(`/token/${d.mint}` as any)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.resultRow}>
                          <View style={styles.resultInfo}>
                            <Text style={styles.resultName} numberOfLines={1}>
                              {name}
                            </Text>
                            <Text style={styles.resultMeta} numberOfLines={1}>
                              {d.query_token?.symbol ?? truncateMint(d.mint)}
                              {mcap !== '—' ? `  ·  ${mcap}` : ''}
                            </Text>
                          </View>
                          <View style={styles.resultRight}>
                            <RiskBadge level={risk} />
                            <ChevronRight size={14} color={tokens.textTertiary} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </GlassCard>
            </Animated.View>
          )}
        </ScrollView>
      </View>
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
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 12,
  },
  textInput: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
    backgroundColor: tokens.bgInputBg,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    borderRadius: tokens.radius.sm,
    padding: 12,
    minHeight: 140,
    maxHeight: 280,
  },
  countHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    marginTop: 8,
    textAlign: 'right',
  },
  btnText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    letterSpacing: 0.8,
  },
  progressText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
    gap: 10,
  },
  resultInfo: { flex: 1 },
  resultName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  resultMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },
  resultError: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.accent,
    marginTop: 2,
  },
  resultRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorIcon: {
    width: 28,
    height: 28,
    borderRadius: tokens.radius.xs,
    backgroundColor: `${tokens.accent}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
