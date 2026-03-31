import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Zap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';

interface UrgencyBannerProps {
  criticalCount: number;
  affectedTokenNames: string[];
  onPress: () => void;
}

export function UrgencyBanner({ criticalCount, affectedTokenNames, onPress }: UrgencyBannerProps) {
  if (criticalCount <= 0) return null;

  const names = affectedTokenNames.slice(0, 3).join(', ');
  const extra = affectedTokenNames.length > 3 ? ` +${affectedTokenNames.length - 3}` : '';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.wrapper}>
      <LinearGradient
        colors={['rgba(239,68,68,0.25)', 'rgba(239,68,68,0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Zap size={14} color={tokens.risk.critical} fill={tokens.risk.critical} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>
              {criticalCount} critical alert{criticalCount > 1 ? 's' : ''}
            </Text>
            {names ? (
              <Text style={styles.names} numberOfLines={1}>
                {names}{extra}
              </Text>
            ) : null}
          </View>
          <Text style={styles.chevron}>{'\u203A'}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: tokens.spacing.screenPadding,
    marginBottom: 8,
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  gradient: { paddingHorizontal: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: {
    fontFamily: 'Lexend-SemiBold', fontSize: 13,
    color: tokens.risk.critical,
  },
  names: {
    fontFamily: 'Lexend-Regular', fontSize: 11,
    color: tokens.white60, marginTop: 1,
  },
  chevron: { color: tokens.risk.critical, fontSize: 18 },
});
