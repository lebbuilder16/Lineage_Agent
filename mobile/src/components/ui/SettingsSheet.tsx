import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { X, Key, LogOut } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { HapticButton } from './HapticButton';
import { useAuthStore } from '../../store/auth';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Slide-up modal for managing the API key. */
export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const [pendingKey, setPendingKey] = useState('');

  // reset input each time the sheet opens
  useEffect(() => {
    if (visible) setPendingKey('');
  }, [visible]);

  const handleSave = () => {
    const trimmed = pendingKey.trim();
    if (trimmed.length >= 8) {
      setApiKey(trimmed);
      onClose();
    }
  };

  const handleRemove = () => {
    setApiKey(null);
    onClose();
  };

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}${'•'.repeat(Math.max(0, apiKey.length - 10))}${apiKey.slice(-4)}`
    : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tap-outside to dismiss */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Title row */}
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <Key size={18} color={tokens.secondary} />
              <Text style={styles.title}>API Key</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <X size={20} color={tokens.white60} />
            </TouchableOpacity>
          </View>

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
            onChangeText={setPendingKey}
            placeholder="sk-…"
            placeholderTextColor={tokens.white35}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSave}
            accessibilityLabel="New API key input"
          />

          <HapticButton
            variant="secondary"
            size="md"
            fullWidth
            onPress={handleSave}
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
              onPress={handleRemove}
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgOverlay, // Figma: rgba(0,0,0,0.7)
  },
  kav: {
    flex: 1,
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  sheet: {
    backgroundColor: tokens.bgApp, // Figma: --bg-app #040816
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 40,
    gap: 12,
    borderTopWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.white20,
    alignSelf: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },
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
    color: tokens.white35,
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
    color: tokens.white35,
    textAlign: 'center',
    marginTop: 4,
  },
  hintLink: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
  },
});
