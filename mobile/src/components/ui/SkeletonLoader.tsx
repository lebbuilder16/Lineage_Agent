// src/components/ui/SkeletonLoader.tsx
// Skeleton shimmer animé pour les états de chargement

import React, { useEffect } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.glass.bg,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function TokenCardSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <Skeleton width={48} height={48} borderRadius={12} />
      <View style={{ flex: 1, gap: 8, marginLeft: 12 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={11} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <Skeleton width={64} height={14} />
        <Skeleton width={48} height={20} borderRadius={999} />
      </View>
    </View>
  );
}

export function AlertCardSkeleton() {
  return (
    <View style={skeletonStyles.card}>
      <Skeleton width={10} height={10} borderRadius={5} />
      <View style={{ flex: 1, gap: 6, marginLeft: 12 }}>
        <Skeleton width="70%" height={13} />
        <Skeleton width="50%" height={11} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 2,
  },
});

// ─── Shimmer Skeleton ─────────────────────────────────────────────────────────
// Variante avec un reflet qui se déplace de gauche à droite.

interface ShimmerSkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function ShimmerSkeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  style,
}: ShimmerSkeletonProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(-200);

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(400, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.glass.bg,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 120,
            backgroundColor: colors.glass.bgElevated,
          },
          shimmerStyle,
        ]}
      />
    </View>
  );
}

// ─── AI Brief Skeleton ────────────────────────────────────────────────────────

export function AIBriefSkeleton() {
  return (
    <View style={{ gap: 8, paddingVertical: 4 }}>
      <ShimmerSkeleton width="100%" height={13} />
      <ShimmerSkeleton width="85%" height={13} />
      <ShimmerSkeleton width="60%" height={13} />
      <ShimmerSkeleton width="40%" height={10} style={{ marginTop: 4 }} />
    </View>
  );
}

// ─── Stats Bar Skeleton ───────────────────────────────────────────────────────

export function StatsBarSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
      <ShimmerSkeleton width={undefined} height={36} borderRadius={8} style={{ flex: 1 }} />
      <View style={{ width: 1, height: 28, backgroundColor: colors.glass.border }} />
      <ShimmerSkeleton width={undefined} height={36} borderRadius={8} style={{ flex: 1 }} />
      <View style={{ width: 1, height: 28, backgroundColor: colors.glass.border }} />
      <ShimmerSkeleton width={undefined} height={36} borderRadius={8} style={{ flex: 1 }} />
    </View>
  );
}
