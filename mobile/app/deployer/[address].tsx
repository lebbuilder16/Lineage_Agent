import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { GaugeRing } from '../../src/components/ui/GaugeRing';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useDeployer } from '../../src/lib/query';
import { addWatch } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function DeployerScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { data, isLoading, error, refetch } = useDeployer(address ?? '');
  const apiKey = useAuthStore((s) => s.apiKey);
  const addWatchFn = useAuthStore((s) => s.addWatch);
  const [watching, setWatching] = useState(false);

  const rugRate = (data?.rug_rate_pct ?? 0) / 100;

  const handleWatchDeployer = async () => {
    if (!apiKey || !address) return;
    try {
      const w = await addWatch(apiKey, 'deployer', address);
      addWatchFn(w);
      setWatching(true);
    } catch (err) {
      console.error('[handleWatchDeployer]', err);
    }
  };

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>DEPLOYER PROFILE</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.secondary} />}
        >
          {isLoading && <GlassCard><SkeletonBlock lines={4} /></GlassCard>}

          {!isLoading && error && (
            <GlassCard>
              <Text style={styles.errorText}>Could not load deployer profile.</Text>
            </GlassCard>
          )}

          {data && !isLoading && (
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              {/* Address + gauge */}
              <GlassCard>
                <Text style={styles.addrLabel}>Deployer Address</Text>
                <Text style={styles.addr} selectable>{data.address}</Text>
                <View style={styles.gaugeRow}>
                  <GaugeRing
                    value={rugRate}
                    color={rugRate > 0.7 ? tokens.risk.critical : rugRate > 0.4 ? tokens.risk.high : tokens.risk.medium}
                    size={100}
                    label={`${data.rug_rate_pct?.toFixed(0) ?? 0}%`}
                    sublabel="RUG RATE"
                  />
                  <View style={styles.gaugeStats}>
                    <StatItem label="Total tokens" value={String(data.total_tokens_launched ?? 0)} />
                    <StatItem label="Confirmed rugs" value={String(data.confirmed_rug_count ?? 0)} />
                    {data.avg_lifespan_days != null && (
                      <StatItem label="Avg lifespan" value={`${data.avg_lifespan_days.toFixed(1)}d`} />
                    )}
                  </View>
                </View>
                {apiKey && (
                  <HapticButton
                    variant={watching ? 'ghost' : 'secondary'}
                    size="sm"
                    onPress={handleWatchDeployer}
                    style={{ marginTop: 12 }}
                  >
                    {watching ? 'Watching ✓' : 'Watch Deployer'}
                  </HapticButton>
                )}
              </GlassCard>

              {/* Token history */}
              {(data.tokens?.length ?? 0) > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>TOKEN HISTORY</Text>
                  <View style={styles.tokenList}>
                    {data.tokens!.map((t) => (
                      <TouchableOpacity
                        key={t.mint}
                        onPress={() => router.push(`/token/${t.mint}` as any)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`View token ${t.name ?? t.mint}${t.rugged_at != null ? ', rugged' : ''}`}
                      >
                        <View style={styles.tokenRow}>
                          <View style={styles.tokenInfo}>
                            <Text style={styles.tokenName}>{t.name}</Text>
                            {t.symbol && (
                              <Text style={styles.tokenSymbol}>{t.symbol}</Text>
                            )}
                          </View>
                          <View style={styles.tokenRight}>
                            {t.rugged_at != null && (
                              <View style={styles.rugBadge}>
                                <AlertTriangle size={10} color={tokens.risk.critical} />
                                <Text style={styles.rugText}>RUG</Text>
                              </View>
                            )}
                            <ChevronRight size={14} color={tokens.white35} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </GlassCard>
              )}
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.white60 }}>{label}</Text>
      <Text style={{ fontFamily: 'Lexend-SemiBold', fontSize: 14, color: tokens.white100 }}>{value}</Text>
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
  addrLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginBottom: 4,
  },
  addr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white100,
    marginBottom: 16,
  },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  gaugeStats: { flex: 1 },
  sectionTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1,
    marginBottom: 10,
  },
  fingerprint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.primary,
  },
  tokenList: { gap: 0 },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  tokenInfo: { flex: 1 },
  tokenName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  tokenSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  tokenRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rugBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: `${tokens.risk.critical}15`,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: `${tokens.risk.critical}30`,
  },
  rugText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.risk.critical,
  },
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
