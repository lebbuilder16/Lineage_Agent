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
} from "react-native-reanimated";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
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
          backgroundColor: "rgba(255,255,255,0.12)",
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
