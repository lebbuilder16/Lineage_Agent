import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, usePathname, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { GlassTabBar, type TabName, TAB_BAR_INNER_HEIGHT, TAB_BAR_BOTTOM_MARGIN } from '../../src/components/ui/GlassTabBar';
import { useAlertsStore } from '../../src/store/alerts';
import { tokens } from '../../src/theme/tokens';

const ROUTE_MAP: Record<TabName, string> = {
  radar: '/(tabs)/radar',
  scan: '/(tabs)/scan',
  agent: '/(tabs)/agent',
  alerts: '/(tabs)/alerts',
  watchlist: '/(tabs)/watchlist',
};

const PATH_TO_TAB: Record<string, TabName> = {
  '/radar': 'radar',
  '/scan': 'scan',
  '/agent': 'agent',
  '/alerts': 'alerts',
  '/watchlist': 'watchlist',
};

export default function TabLayout() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const unreadCount = useAlertsStore((s) => s.alerts.filter((a) => !a.read).length);

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
          <Tabs.Screen name="scan" />
          <Tabs.Screen name="agent" />
          <Tabs.Screen name="clock" options={{ href: null }} />
          <Tabs.Screen name="alerts" />
          <Tabs.Screen name="watchlist" />
          <Tabs.Screen name="account" options={{ href: null }} />
          <Tabs.Screen name="profile" options={{ href: null }} />
        </Tabs>
      </View>
      <GlassTabBar
        activeTab={activeTab}
        onPress={handlePress}
        unreadAlerts={unreadCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  screens: { flex: 1 },
});
