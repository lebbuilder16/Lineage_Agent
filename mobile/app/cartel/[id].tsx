import React from 'react';
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
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useCartel } from '../../src/lib/query';
import { tokens } from '../../src/theme/tokens';

export default function CartelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useCartel(id ?? '');

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>CARTEL NETWORK</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.primary} />}
        >
          {isLoading && <GlassCard><SkeletonBlock lines={4} /></GlassCard>}

          {!isLoading && error && (
            <GlassCard>
              <Text style={styles.errorText}>Could not load cartel data.</Text>
            </GlassCard>
          )}

          {data && !isLoading && (
            <>
              {/* Overview */}
              <GlassCard>
                <Text style={styles.sectionTitle}>OVERVIEW</Text>
                <View style={styles.statsGrid}>
                  <GridStat label="Financial Score" value={data.financial_score != null ? `${data.financial_score}/100` : '–'} />
                  <GridStat label="Deployers" value={String(data.deployer_count ?? data.deployers?.length ?? 0)} />
                  <GridStat label="SOL Extracted" value={data.total_sol_extracted != null ? `${data.total_sol_extracted.toFixed(0)} SOL` : '–'} />
                  <GridStat label="Tokens" value={String(data.total_tokens_launched ?? 0)} />
                </View>
              </GlassCard>

              {/* Signal breakdown */}
              <GlassCard>
                <Text style={styles.sectionTitle}>SIGNAL BREAKDOWN</Text>
                <View style={styles.signals}>
                  <SignalRow label="Funding links" value={data.funding_links ?? 0} color={tokens.risk.high} />
                  <SignalRow label="Sniper rings" value={data.sniper_ring_count ?? 0} color={tokens.risk.critical} />
                  <SignalRow label="Shared LPs" value={data.shared_lp_count ?? 0} color={tokens.risk.medium} />
                  <SignalRow label="DNA matches" value={data.dna_match_count ?? 0} color={tokens.secondary} />
                </View>
              </GlassCard>

              {/* Deployers */}
              {(data.deployers?.length ?? 0) > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>CONNECTED DEPLOYERS</Text>
                  <View style={{ gap: 0 }}>
                    {data.deployers!.map((d) => (
                      <TouchableOpacity
                        key={d.address}
                        onPress={() => router.push(`/deployer/${d.address}` as any)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.deployerRow}>
                          <View style={styles.deployerInfo}>
                            <Text style={styles.deployerAddr} numberOfLines={1}>{d.address}</Text>
                            {d.rug_rate_pct != null && (
                              <Text style={styles.deployerMeta}>
                                {d.rug_rate_pct.toFixed(0)}% rug rate
                                {d.confirmed_rug_count != null ? ` · ${d.confirmed_rug_count} rugs` : ''}
                              </Text>
                            )}
                          </View>
                          <ChevronRight size={16} color={tokens.white35} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </GlassCard>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function GridStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '48%', marginBottom: 12 }}>
      <Text style={{ fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.white60 }}>{label}</Text>
      <Text style={{ fontFamily: 'Lexend-Bold', fontSize: 18, color: tokens.white100 }}>{value}</Text>
    </View>
  );
}

function SignalRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle }}>
      <Text style={{ fontFamily: 'Lexend-Regular', fontSize: 14, color: tokens.white60 }}>{label}</Text>
      <Text style={{ fontFamily: 'Lexend-Bold', fontSize: 14, color }}>{value}</Text>
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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  signals: {},
  deployerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  deployerInfo: { flex: 1 },
  deployerAddr: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white100,
  },
  deployerMeta: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 2,
  },
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
    textAlign: 'center',
  },
});
