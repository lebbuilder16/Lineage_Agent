import React, { useCallback, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { tokens } from '../../theme/tokens';

export function useToast() {
  const [msg, setMsg] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;

  const showToast = useCallback(
    (message: string) => {
      setMsg(message);
      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(1500),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    },
    [opacity],
  );

  const ToastView = () => (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.text}>{msg}</Text>
    </Animated.View>
  );

  return { showToast, ToastView };
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 88,
    left: 24,
    right: 24,
    backgroundColor: tokens.bgGlass12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  text: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white100,
  },
});
