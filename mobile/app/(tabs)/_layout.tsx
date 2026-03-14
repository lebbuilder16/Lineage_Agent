import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, usePathname, router } from 'expo-router';
import { GlassTabBar, type TabName } from '../../src/components/ui/GlassTabBar';
import { useAlertsStore } from '../../src/store/alerts';
import { tokens } from '../../src/theme/tokens';

const ROUTE_MAP: Record<TabName, string> = {
  radar: '/(tabs)/radar',
  scan: '/(tabs)/scan',
  clock: '/(tabs)/clock',
  alerts: '/(tabs)/alerts',
  watchlist: '/(tabs)/watchlist',
};

const PATH_TO_TAB: Record<string, TabName> = {
  '/radar': 'radar',
  '/scan': 'scan',
  '/clock': 'clock',
  '/alerts': 'alerts',
  '/watchlist': 'watchlist',
};

export default function TabLayout() {
  const pathname = usePathname();
  const unreadCount = useAlertsStore((s) => s.alerts.filter((a) => !a.read).length);

  const activeTab: TabName = PATH_TO_TAB[pathname] ?? 'radar';

  const handlePress = (tab: TabName) => {
    router.push(ROUTE_MAP[tab] as any);
  };

  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={() => null}
      >
        <Tabs.Screen name="radar" />
        <Tabs.Screen name="scan" />
        <Tabs.Screen name="clock" />
        <Tabs.Screen name="alerts" />
        <Tabs.Screen name="watchlist" />
      </Tabs>
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
});
