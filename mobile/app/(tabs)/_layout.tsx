// app/(tabs)/_layout.tsx
// Tab bar Noelle — verre + indicateur gradient actif + alertes badge

import React from "react";
import { Tabs } from "expo-router";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { colors } from "@/src/theme/colors";
import { useAlertsStore } from "@/src/store/alerts";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";

const GRADIENT: [string, string] = ["#622EC3", "#53E9F6"];

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
      {focused && (
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={iconStyles.glow}
        />
      )}
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
      {focused && (
        <LinearGradient
          colors={GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={iconStyles.glow}
        />
      )}
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
  const { colors, isDark } = useTheme();
  const unreadCount = useAlertsStore((s) => s.unreadCount);

  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar,
            { borderTopColor: "rgba(98, 46, 195, 0.22)" },
          ],
          tabBarBackground: () =>
            Platform.OS === "ios" ? (
              <BlurView
                intensity={70}
                tint={isDark ? "dark" : "light"}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: isDark
                      ? "rgba(0,0,0,0.96)"
                      : "rgba(255,255,255,0.96)",
                  },
                ]}
              />
            ),
          tabBarActiveTintColor: colors.accent.cyan,
          tabBarInactiveTintColor: colors.text.muted,
          tabBarLabelStyle: [styles.tabLabel, { color: colors.text.muted }],
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
    fontFamily: "PlusJakartaSans_700Bold",
    marginTop: 2,
  },
});

const iconStyles = StyleSheet.create({
  wrap: { position: "relative", alignItems: "center", justifyContent: "center", width: 32, height: 32 },
  glow: {
    position: "absolute",
    top: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    opacity: 0.18,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "PlusJakartaSans_800ExtraBold",
  },
});

