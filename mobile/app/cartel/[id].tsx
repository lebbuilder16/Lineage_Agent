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
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function CartelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useCartel(id ?? '');

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
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              {/* Overview */}
              <GlassCard>
                <Text style={styles.sectionTitle}>OVERVIEW</Text>
                <View style={styles.statsGrid}>
                  <GridStat label="Deployers" value={String(data.deployer_community?.wallets?.length ?? 0)} />
                  <GridStat label="Tokens" value={String(data.deployer_community?.total_tokens_launched ?? 0)} />
                  <GridStat label="Rugs" value={String(data.deployer_community?.total_rugs ?? 0)} />
                  <GridStat label="Est. Extracted" value={data.deployer_community?.estimated_extracted_usd != null ? `$${(data.deployer_community.estimated_extracted_usd / 1_000).toFixed(0)}K` : '–'} />
                </View>
              </GlassCard>

              {/* Signal edges */}
              {(data.deployer_community?.edges?.length ?? 0) > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>SIGNAL BREAKDOWN</Text>
                  <View style={styles.signals}>
                    {data.deployer_community!.edges!.map((edge, i) => (
                      <SignalRow
                        key={i}
                        label={edge.signal_type.replace('_', ' ').toUpperCase()}
                        value={edge.signal_strength}
                        color={tokens.risk.high}
                      />
                    ))}
                  </View>
                </GlassCard>
              )}

              {/* Connected deployer wallets */}
              {(data.deployer_community?.wallets?.length ?? 0) > 0 && (
                <GlassCard>
                  <Text style={styles.sectionTitle}>CONNECTED DEPLOYERS</Text>
                  <View style={{ gap: 0 }}>
                    {data.deployer_community!.wallets.map((addr) => (
                      <TouchableOpacity
                        key={addr}
                        onPress={() => router.push(`/deployer/${addr}` as any)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.deployerRow}>
                          <View style={styles.deployerInfo}>
                            <Text style={styles.deployerAddr} numberOfLines={1}>{addr}</Text>
                          </View>
                          <ChevronRight size={16} color={tokens.white35} />
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
