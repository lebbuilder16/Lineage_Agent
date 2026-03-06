// app/(tabs)/_layout.tsx
// Bottom tab navigation principale

import React from "react";
import { Tabs } from "expo-router";
import { View, Text, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { colors } from "@/src/theme/colors";
import { useAlertsStore } from "@/src/store/alerts";

// Icônes SVG inline légères (évite une dépendance @expo/vector-icons)
function HomeIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.wrap}>
      <Text style={[iconStyles.icon, { color }]}>⌂</Text>
    </View>
  );
}
function SearchIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.wrap}>
      <Text style={[iconStyles.icon, { color }]}>⌕</Text>
    </View>
  );
}
function WatchlistIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.wrap}>
      <Text style={[iconStyles.icon, { color }]}>☆</Text>
    </View>
  );
}
function AlertsIcon({ color, count }: { color: string; count: number }) {
  return (
    <View style={iconStyles.wrap}>
      <Text style={[iconStyles.icon, { color }]}>◎</Text>
      {count > 0 && (
        <View style={iconStyles.badge}>
          <Text style={iconStyles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}
function AccountIcon({ color }: { color: string }) {
  return (
    <View style={iconStyles.wrap}>
      <Text style={[iconStyles.icon, { color }]}>◉</Text>
    </View>
  );
}

export default function TabsLayout() {
  const unreadCount = useAlertsStore((s) => s.unreadCount);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(10,10,15,0.95)" },
              ]}
            />
          ),
        tabBarActiveTintColor: colors.accent.safe,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Feed",
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => <SearchIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: "Watch",
          tabBarIcon: ({ color }) => <WatchlistIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color }) => (
            <AlertsIcon color={color} count={unreadCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <AccountIcon color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    borderTopWidth: 1,
    borderTopColor: colors.glass.border,
    height: 84,
    paddingBottom: 24,
    paddingTop: 8,
    elevation: 0,
    backgroundColor: "transparent",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
});

const iconStyles = StyleSheet.create({
  wrap: { position: "relative", padding: 2 },
  icon: { fontSize: 22 },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    backgroundColor: colors.accent.danger,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
});
