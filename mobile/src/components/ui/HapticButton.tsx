import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
  View,
  Text,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';

interface HapticButtonProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const GRADIENTS = {
  primary: [tokens.primary, '#5B56BB', '#4D65DB'] as const,
  secondary: [tokens.secondary, '#8BB5FF'] as const,
  ghost: ['transparent', 'transparent'] as const,
  destructive: [tokens.error, tokens.accent] as const,
};

export function HapticButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  style,
  fullWidth = false,
  onPress,
  disabled,
  ...rest
}: HapticButtonProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 400 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const handlePress = (e: any) => {
    if (!disabled && !loading) onPress?.(e);
  };

  const sizeStyle = SIZE_STYLES[size];
  const isGhost = variant === 'ghost';
  const isDisabled = disabled || loading;

  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={isDisabled}
      style={[
        animStyle,
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}
    >
      {isGhost ? (
        <View
          style={[
            styles.inner,
            sizeStyle,
            styles.ghostInner,
            isDisabled && styles.disabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={tokens.white60} />
          ) : (
            children
          )}
        </View>
      ) : (
        <LinearGradient
          colors={GRADIENTS[variant]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.inner, sizeStyle, isDisabled && styles.disabled]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={tokens.white100} />
          ) : (
            children
          )}
        </LinearGradient>
      )}
    </AnimatedPressable>
  );
}

const SIZE_STYLES: Record<string, ViewStyle> = {
  sm: { height: 36, paddingHorizontal: 16, borderRadius: tokens.radius.sm },
  md: { height: 48, paddingHorizontal: 24, borderRadius: tokens.radius.md },
  lg: { height: 56, paddingHorizontal: 32, borderRadius: tokens.radius.pill },
};

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  ghostInner: {
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  disabled: {
    opacity: 0.45,
  },
});
