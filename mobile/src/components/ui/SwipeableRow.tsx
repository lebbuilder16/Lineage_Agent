// src/components/ui/SwipeableRow.tsx
// Wrapper swipeable gauche/droite utilisant Gesture.Pan() de react-native-gesture-handler.
// SwipeRight → action lecture, SwipeLeft → action navigation.

import React, { useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { colors } from "@/src/theme/colors";

const SWIPE_THRESHOLD = 65;
const SPRING_CONFIG = { damping: 20, stiffness: 200 };

interface SwipeableRowProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightActionLabel?: string;
  leftActionLabel?: string;
  rightActionColor?: string;
  leftActionColor?: string;
  disabled?: boolean;
}

export function SwipeableRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightActionLabel = "Read",
  leftActionLabel = "View",
  rightActionColor = colors.accent.safe,
  leftActionColor = colors.accent.blue,
  disabled = false,
}: SwipeableRowProps) {
  const translateX = useSharedValue(0);
  const thresholdCrossedRef = useRef(false);

  function triggerHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      // Résistance progressive au-delà du seuil
      const raw = e.translationX;
      if (Math.abs(raw) > SWIPE_THRESHOLD) {
        const excess = Math.abs(raw) - SWIPE_THRESHOLD;
        const dampened = SWIPE_THRESHOLD + excess * 0.3;
        translateX.value = raw > 0 ? dampened : -dampened;
      } else {
        translateX.value = raw;
      }

      // Haptic au franchissement du seuil (une seule fois par geste)
      if (!thresholdCrossedRef.current && Math.abs(raw) >= SWIPE_THRESHOLD) {
        thresholdCrossedRef.current = true;
        runOnJS(triggerHaptic)();
      }
    })
    .onEnd(() => {
      const tx = translateX.value;
      thresholdCrossedRef.current = false;

      if (tx > SWIPE_THRESHOLD && onSwipeRight) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        runOnJS(onSwipeRight)();
      } else if (tx < -SWIPE_THRESHOLD && onSwipeLeft) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        runOnJS(onSwipeLeft)();
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const rightActionOpacity = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, translateX.value / SWIPE_THRESHOLD)),
  }));

  const leftActionOpacity = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -translateX.value / SWIPE_THRESHOLD)),
  }));

  return (
    <View style={styles.container}>
      {/* Action droite (swipe → droite = lire) */}
      <Animated.View style={[styles.actionLeft, { backgroundColor: `${rightActionColor}20` }, rightActionOpacity]}>
        <Text style={[styles.actionText, { color: rightActionColor }]}>{rightActionLabel}</Text>
      </Animated.View>

      {/* Action gauche (swipe → gauche = voir) */}
      <Animated.View style={[styles.actionRight, { backgroundColor: `${leftActionColor}20` }, leftActionOpacity]}>
        <Text style={[styles.actionText, { color: leftActionColor }]}>{leftActionLabel}</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
  },
  actionLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
  },
  actionRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 0,
  },
  actionText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
});
