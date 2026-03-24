import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { HapticButton } from '../ui/HapticButton';

interface ApiKeySectionProps {
  apiKey: string | null;
  pendingKey: string;
  onPendingKeyChange: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
}

export function ApiKeySection({
  apiKey,
  pendingKey,
  onPendingKeyChange,
  onSave,
  onRemove,
}: ApiKeySectionProps) {
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}${'•'.repeat(Math.max(0, apiKey.length - 10))}${apiKey.slice(-4)}`
    : '';

  return (
    <>
      {/* Current key preview */}
      {apiKey ? (
        <View style={styles.currentRow}>
          <Text style={styles.currentLabel}>Active key</Text>
          <Text style={styles.currentValue}>{maskedKey}</Text>
        </View>
      ) : (
        <Text style={styles.noKeyHint}>No API key configured.</Text>
      )}

      {/* New key input */}
      <Text style={styles.inputLabel}>{apiKey ? 'Replace with new key' : 'Enter API key'}</Text>
      <TextInput
        style={styles.input}
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

      <HapticButton
        variant="secondary"
        size="md"
        fullWidth
        onPress={onSave}
        style={styles.saveBtn}
        accessibilityRole="button"
        accessibilityLabel="Save API key"
      >
        Save
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

      <Text style={styles.hint}>
        Get your key at{' '}
        <Text style={styles.hintLink}>lineage-agent.fly.dev/dashboard</Text>
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  currentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
  },
  currentLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  currentValue: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.secondary,
    letterSpacing: 1,
  },
  noKeyHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    textAlign: 'center',
  },
  inputLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginBottom: -4,
  },
  input: {
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  saveBtn: { marginTop: 4 },
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
    marginTop: 4,
  },
  hintLink: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
  },
});
