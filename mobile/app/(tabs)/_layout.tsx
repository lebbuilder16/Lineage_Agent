import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, usePathname, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { GlassTabBar, type TabName, TAB_BAR_INNER_HEIGHT, TAB_BAR_BOTTOM_MARGIN } from '../../src/components/ui/GlassTabBar';
import { useSweepFlagsStore } from '../../src/store/sweep-flags';
import { tokens } from '../../src/theme/tokens';

const ROUTE_MAP: Record<TabName, string> = {
  radar: '/(tabs)/radar',
  watchlist: '/(tabs)/watchlist',
  agent: '/(tabs)/agent',
  profile: '/(tabs)/profile',
};

const PATH_TO_TAB: Record<string, TabName> = {
  '/radar': 'radar',
  '/watchlist': 'watchlist',
  '/agent': 'agent',
  '/profile': 'profile',
};

export default function TabLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const unreadFlags = useSweepFlagsStore((s) => s.getUnreadCount());

  const tabBarClearance =
    TAB_BAR_INNER_HEIGHT +
    TAB_BAR_BOTTOM_MARGIN +
    Math.max(insets.bottom, Platform.select({ ios: 8, android: 8 }) ?? 8);

  const activeTab: TabName = PATH_TO_TAB[pathname] ?? 'radar';

  const handlePress = (tab: TabName) => {
    router.push(ROUTE_MAP[tab] as any);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.screens, { paddingBottom: tabBarClearance }]}>
        <Tabs
          screenOptions={{ headerShown: false }}
          tabBar={() => null}
        >
          <Tabs.Screen name="radar" />
          <Tabs.Screen name="watchlist" />
          <Tabs.Screen name="agent" />
          <Tabs.Screen name="profile" />
          {/* Hidden screens — still routable but not in tab bar */}
          <Tabs.Screen name="scan" options={{ href: null }} />
          <Tabs.Screen name="alerts" options={{ href: null }} />
          <Tabs.Screen name="clock" options={{ href: null }} />
          <Tabs.Screen name="account" options={{ href: null }} />
        </Tabs>
      </View>
      <GlassTabBar
        activeTab={activeTab}
        onPress={handlePress}
        unreadAlerts={unreadFlags}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  screens: { flex: 1 },
});
