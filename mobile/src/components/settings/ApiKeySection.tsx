import React from 'react';
import { View, Text, TextInput, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { LogOut, Shield } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { HapticButton } from '../ui/HapticButton';

interface ApiKeySectionProps {
  apiKey: string | null;
  pendingKey: string;
  onPendingKeyChange: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
  error?: string;
}

export function ApiKeySection({
  apiKey,
  pendingKey,
  onPendingKeyChange,
  onSave,
  onRemove,
  error,
}: ApiKeySectionProps) {
  // Short masked key: first 6 + ••• + last 4
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}•••${apiKey.slice(-4)}`
    : '';

  return (
    <View style={styles.container}>
      {/* Current key preview */}
      {apiKey ? (
        <View style={styles.currentRow}>
          <View style={styles.currentLeft}>
            <Shield size={14} color={tokens.success} />
            <Text style={styles.currentLabel}>Active</Text>
          </View>
          <Text style={styles.currentValue} numberOfLines={1}>{maskedKey}</Text>
        </View>
      ) : (
        <View style={styles.noKeyCard}>
          <Shield size={18} color={tokens.textTertiary} />
          <Text style={styles.noKeyHint}>No API key configured</Text>
        </View>
      )}

      {/* New key input */}
      <Text style={styles.inputLabel}>{apiKey ? 'Replace with new key' : 'Enter API key'}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : undefined]}
        value={pendingKey}
        onChangeText={onPendingKeyChange}
        placeholder="sk-..."
        placeholderTextColor={tokens.textPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={onSave}
        accessibilityLabel="New API key input"
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <HapticButton
        variant="primary"
        size="md"
        fullWidth
        onPress={onSave}
        style={styles.saveBtn}
        accessibilityRole="button"
        accessibilityLabel="Save API key"
      >
        <Text style={styles.saveBtnText}>Save Key</Text>
      </HapticButton>

      {apiKey && (
        <HapticButton
          variant="ghost"
          size="md"
          fullWidth
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove API key"
        >
          <View style={styles.removeInner}>
            <LogOut size={14} color={tokens.accent} />
            <Text style={styles.removeText}>Remove key</Text>
          </View>
        </HapticButton>
      )}

      <TouchableOpacity onPress={() => Linking.openURL('https://lineage-agent.fly.dev/dashboard')} activeOpacity={0.7}>
        <Text style={styles.hint}>
          Get your key at{' '}
          <Text style={styles.hintLink}>lineage-agent.fly.dev/dashboard</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${tokens.success}08`,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: `${tokens.success}25`,
  },
  currentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currentLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.success,
  },
  currentValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  noKeyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  noKeyHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },
  inputLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  inputError: {
    borderColor: `${tokens.risk.critical}50`,
  },
  errorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.risk.critical,
    marginTop: -4,
  },
  saveBtn: { marginTop: 2 },
  saveBtnText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    letterSpacing: 0.3,
  },
  removeInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
  },
  hint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    textAlign: 'center',
  },
  hintLink: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
  },
});
