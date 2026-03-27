import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, TrendingUp } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTopTokens } from '../src/lib/query';
import { useAuthStore } from '../src/store/auth';
import { RadarTokenCard } from '../src/components/radar/RadarTokenCard';
import { tokens } from '../src/theme/tokens';
import type { TopToken } from '../src/types/api';

function topTokenToSearchResult(t: TopToken) {
  return {
    mint: t.mint, name: t.name, symbol: t.symbol, image_uri: t.image_uri ?? '',
    metadata_uri: '', dex_url: '',
    market_cap_usd: t.mcap_usd ?? null, pair_created_at: t.created_at ?? null,
  };
}

export default function TrendingScreen() {
  const insets = useSafeAreaInsets();
  const apiKey = useAuthStore((s) => s.apiKey);
  const { data: topTokens = [], isLoading, refetch } = useTopTokens(50);

  const renderItem = ({ item, index }: { item: TopToken; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * tokens.timing.listItem).duration(250).springify()}>
      <RadarTokenCard
        token={topTokenToSearchResult(item)}
        apiKey={apiKey}
        onPress={() => router.push(`/token/${item.mint}` as any)}
        rank={index + 1}
        scanCount={item.event_count}
      />
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) + 8 : 16) }]}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>TRENDING</Text>
          <View style={{ width: 24 }} />
        </View>

        <FlatList
          data={topTokens}
          keyExtractor={(item) => item.mint}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom + 80, 120) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={tokens.secondary}
              colors={[tokens.secondary]}
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <TrendingUp size={32} color={tokens.textTertiary} />
                <Text style={styles.emptyText}>No trending tokens</Text>
                <Text style={styles.emptySubtext}>Pull to refresh or check back later</Text>
              </View>
            ) : null
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
    color: tokens.textTertiary, textAlign: 'center', paddingHorizontal: 40,
  },
});
