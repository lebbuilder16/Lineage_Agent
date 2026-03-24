import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Returns true when the user has enabled "Reduce Motion" (iOS)
 * or "Remove Animations" (Android).
 *
 * Use this to gate expensive animations: Skia canvas loops,
 * withRepeat sequences, spring physics, stagger delays, etc.
 * When reduced === true, render static equivalents or use
 * duration-zero timing instead.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);

    if (Platform.OS === 'web') return;

    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => sub.remove();
  }, []);

  return reduced;
}
