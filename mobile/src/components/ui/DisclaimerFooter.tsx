import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Info } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

/**
 * Permanent disclaimer shown on every screen that displays a risk score
 * or prediction. Required to satisfy Apple App Store Guidelines 1.4 and 5.3
 * by making it explicit that the app is informational, not a financial advisor.
 */
export function DisclaimerFooter() {
  return (
    <View style={styles.row}>
      <Info size={11} color={tokens.white40} strokeWidth={2} />
      <Text style={styles.text}>
        Educational tool — not financial advice. Always do your own research.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  text: {
    fontFamily: 'Lexend-Regular',
    fontSize: 10,
    color: tokens.white40,
    textAlign: 'center',
    flexShrink: 1,
  },
});
