import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../../theme/tokens';

type ToastVariant = 'success' | 'error' | 'info';

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; text: string }> = {
  success: { bg: '#0A2A18', border: `${tokens.success}60`, text: tokens.success },
  error: { bg: '#2A0A14', border: `${tokens.accent}60`, text: tokens.accent },
  info: { bg: tokens.bgApp, border: tokens.borderMedium, text: tokens.white100 },
};

function ToastOverlay({
  msg,
  opacity,
  variant,
}: {
  msg: string;
  opacity: Animated.Value;
  variant: ToastVariant;
}) {
  const vs = VARIANT_STYLES[variant] || VARIANT_STYLES.info;
  return (
    <Animated.View
      style={[
        styles.toast,
        { opacity, backgroundColor: vs.bg, borderColor: vs.border },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.text, { color: vs.text }]}>{msg}</Text>
    </Animated.View>
  );
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const [variant, setVariant] = useState<ToastVariant>('info');
  const opacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback(
    (message: string, type: ToastVariant = 'info') => {
      setMsg(message);
      setVariant(type);
      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    },
    [opacity],
  );

  return { showToast, toast: <ToastOverlay msg={msg} opacity={opacity} variant={variant} /> };
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 88,
    left: 24,
    right: 24,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
  },
});
