import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Search, CheckCircle, XOctagon } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AuroraBackground } from '../src/components/ui/AuroraBackground';
import { GlassCard } from '../src/components/ui/GlassCard';
import { RiskBadge } from '../src/components/ui/RiskBadge';
import { useHistoryStore, type InvestigationRecord } from '../src/store/history';
import { tokens } from '../src/theme/tokens';

function timeAgoShort(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function riskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const investigations = useHistoryStore((s) => s.investigations);

  const renderItem = ({ item, index }: { item: InvestigationRecord; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(250).springify()}>
      <TouchableOpacity
        onPress={() => router.push(`/token/${item.mint}` as any)}
        activeOpacity={0.75}
      >
        <GlassCard style={styles.card} noPadding>
          <View style={styles.cardInner}>
            <View style={styles.cardLeft}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name ?? item.symbol ?? item.mint.slice(0, 12)}
                </Text>
                {item.feedback === 'accurate' && <CheckCircle size={12} color={tokens.success} />}
                {item.feedback === 'incorrect' && <XOctagon size={12} color={tokens.risk?.high ?? '#FF6B6B'} />}
              </View>
              <Text style={styles.verdict} numberOfLines={2}>{item.verdict}</Text>
              <Text style={styles.time}>{timeAgoShort(item.timestamp)}</Text>
            </View>
            <View style={styles.cardRight}>
              <Text style={[styles.score, { color: riskLevel(item.riskScore) === 'critical' ? (tokens.risk?.critical ?? tokens.accent) : riskLevel(item.riskScore) === 'high' ? (tokens.risk?.high ?? '#FF6B6B') : riskLevel(item.riskScore) === 'medium' ? (tokens.risk?.medium ?? '#FFB700') : (tokens.risk?.low ?? '#00FF88') }]}>
                {item.riskScore}
              </Text>
              <RiskBadge level={riskLevel(item.riskScore)} size="sm" />
            </View>
          </View>
        </GlassCard>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>INVESTIGATION HISTORY</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={investigations}
          keyExtractor={(item) => item.mint}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom + 80, 120) }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Search size={32} color={tokens.white35} />
              <Text style={styles.emptyText}>No investigations yet</Text>
              <Text style={styles.emptySubtext}>Scan a token and tap Investigate to get started</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },

  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 12,
  },
  navTitle: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.small,
    color: tokens.white60, letterSpacing: 1.5,
  },

  list: { paddingHorizontal: tokens.spacing.screenPadding, gap: 8 },

  card: {},
  cardInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: tokens.spacing.cardPadding, gap: 12,
  },
  cardLeft: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body,
    color: tokens.white100,
  },
  verdict: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white60, lineHeight: 18,
  },
  time: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny,
    color: tokens.white35, marginTop: 2,
  },
  cardRight: { alignItems: 'center', gap: 4 },
  score: {
    fontFamily: 'Lexend-Bold', fontSize: tokens.font.heading,
  },

  empty: {
    alignItems: 'center', justifyContent: 'center',
    paddingTop: 80, gap: 12,
  },
  emptyText: {
    fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body,
    color: tokens.white60,
  },
  emptySubtext: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white35, textAlign: 'center', paddingHorizontal: 40,
  },
});
