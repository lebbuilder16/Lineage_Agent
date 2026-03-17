import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { GlassCard } from './GlassCard';
import { tokens } from '../../theme/tokens';
import type { UserError } from '../../lib/error-handler';

interface ErrorBannerProps {
  error: UserError;
  onRetry?: () => void;
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        <AlertTriangle size={18} color={tokens.accent} strokeWidth={2} />
        <View style={styles.info}>
          <Text style={styles.title}>{error.title}</Text>
          <Text style={styles.message}>{error.message}</Text>
        </View>
        {error.retry && onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            style={styles.retryBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <RefreshCw size={14} color={tokens.secondary} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: `${tokens.accent}30`,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  info: { flex: 1 },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.accent,
  },
  message: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },
  retryBtn: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
