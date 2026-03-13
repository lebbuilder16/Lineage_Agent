// app/(tabs)/_layout.tsx
// Tab bar Aurora Glass — floating pill + secondary #ADC8FF active indicator

import React from "react";
import { Tabs } from "expo-router";
import { View, Text, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { aurora } from "@/src/theme/colors";
import { useAlertsStore } from "@/src/store/alerts";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";

function TabIcon({
  name,
  nameActive,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  nameActive: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}) {
  return (
    <View style={iconStyles.wrap}>
      {focused && <View style={iconStyles.glow} />}
      <Ionicons name={focused ? nameActive : name} size={22} color={color} />
    </View>
  );
}

function AlertsTabIcon({
  focused,
  color,
  count,
}: {
  focused: boolean;
  color: string;
  count: number;
}) {
  return (
    <View style={iconStyles.wrap}>
      {focused && <View style={iconStyles.glow} />}
      <Ionicons
        name={focused ? "notifications" : "notifications-outline"}
        size={22}
        color={color}
      />
      {count > 0 && (
        <View style={iconStyles.badge}>
          <Text style={iconStyles.badgeText}>{count > 9 ? "9+" : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabsLayout() {
  const unreadCount = useAlertsStore((s) => s.unreadCount);

  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar,
            { borderTopColor: aurora.border },
          ],
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                intensity={70}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: "rgba(2,6,23,0.96)" },
                ]}
              />
            ),
          tabBarActiveTintColor: aurora.secondary,
          tabBarInactiveTintColor: "rgba(255,255,255,0.35)",
          tabBarLabelStyle: [styles.tabLabel],
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Feed",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="home-outline" nameActive="home" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: "Search",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="search-outline" nameActive="search" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="watchlist"
          options={{
            title: "Watch",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon name="star-outline" nameActive="star" focused={focused} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="alerts"
          options={{
            title: "Alerts",
            tabBarIcon: ({ color, focused }) => (
              <AlertsTabIcon focused={focused} color={color} count={unreadCount} />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: "Account",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="person-circle-outline"
                nameActive="person-circle"
                focused={focused}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    borderTopWidth: 1,
    height: 84,
    paddingBottom: 28,
    paddingTop: 8,
    elevation: 0,
    backgroundColor: "transparent",
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: "Lexend_600SemiBold",
    marginTop: 2,
  },
});

const iconStyles = StyleSheet.create({
  wrap: {
    width: 40,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: `${aurora.secondary}1A`,
    borderRadius: 20,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: aurora.accent,
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

