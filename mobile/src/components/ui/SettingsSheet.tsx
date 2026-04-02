import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { X, Key } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { useAuthStore } from '../../store/auth';
import { useOpenClawStore } from '../../store/openclaw';
import { usePrivy } from '@privy-io/expo';
import { ApiKeySection } from '../settings/ApiKeySection';
import { OpenClawSection } from '../settings/OpenClawSection';

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Slide-up modal for managing the API key. */
export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const { logout: privyLogout } = usePrivy();
  const [pendingKey, setPendingKey] = useState('');

  const { connected, status } = useOpenClawStore();

  // reset inputs each time the sheet opens
  useEffect(() => {
    if (visible) {
      setPendingKey('');
    }
  }, [visible]);

  const handleSave = () => {
    const trimmed = pendingKey.trim();
    if (trimmed.length >= 8) {
      setApiKey(trimmed);
      onClose();
    }
  };

  const handleRemove = async () => {
    try { await privyLogout(); } catch { /* best-effort */ }
    await new Promise((r) => setTimeout(r, 1000));

    const { purgeUserData } = await import('../../lib/purge-user-data');
    await purgeUserData();

    setApiKey(null);
    onClose();
  };

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

          <ApiKeySection
            apiKey={apiKey}
            pendingKey={pendingKey}
            onPendingKeyChange={setPendingKey}
            onSave={handleSave}
            onRemove={handleRemove}
          />

          <OpenClawSection
            connected={connected}
            status={status}
          />
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
    backgroundColor: tokens.bgApp,
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
});
