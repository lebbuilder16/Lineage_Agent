import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Baltic Rose — Luxury gradient background
 * Figma: ZWveuwpa4y6HRWMapzvqQ9 / node 11:1071
 *
 * Deep aubergine (#251D2E) bottom-left → dark mauve (#5C4550) center
 * → warm rose terracotta (#9A7570) top-right
 */
export function BalticRoseBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#251D2E', '#5C4550', '#9A7570']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Subtle dark vignette at the bottom for legibility */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
