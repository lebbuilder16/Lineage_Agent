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
  Switch,
} from 'react-native';
import { X, Key, LogOut, Zap, Bell } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { HapticButton } from './HapticButton';
import { useAuthStore } from '../../store/auth';
import { useOpenClawStore } from '../../store/openclaw';
import { useAlertPrefsStore } from '../../store/alert-prefs';
import { connectOpenClaw, disconnectOpenClaw } from '../../lib/openclaw';
import type { AlertChannelId } from '../../types/openclaw';

const CHANNEL_LABELS: Record<AlertChannelId, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  discord: 'Discord',
  push: 'Push',
};

const CHANNEL_COLORS: Record<AlertChannelId, string> = {
  telegram: '#2AABEE',
  whatsapp: '#25D366',
  discord: '#5865F2',
  push: tokens.secondary,
};

function ConnectedSection({ host, handleDisconnect }: { host: string; handleDisconnect: () => void }) {
  const channels = useAlertPrefsStore((s) => s.channels);
  const setChannelEnabled = useAlertPrefsStore((s) => s.setChannelEnabled);
  const enrichmentEnabled = useAlertPrefsStore((s) => s.enrichmentEnabled);
  const setEnrichmentEnabled = useAlertPrefsStore((s) => s.setEnrichmentEnabled);

  return (
    <>
      <View style={styles.currentRow}>
        <Text style={styles.currentLabel}>Host</Text>
        <Text style={styles.currentValue} numberOfLines={1}>{host}</Text>
      </View>
      <HapticButton
        variant="ghost"
        size="md"
        fullWidth
        onPress={handleDisconnect}
        accessibilityRole="button"
        accessibilityLabel="Disconnect OpenClaw"
      >
        <View style={styles.removeInner}>
          <LogOut size={14} color={tokens.accent} />
          <Text style={styles.removeText}>Disconnect</Text>
        </View>
      </HapticButton>

      {/* Alert Channels Config */}
      <View style={styles.channelSection}>
        <View style={styles.channelTitleRow}>
          <Bell size={14} color={tokens.secondary} />
          <Text style={styles.channelTitle}>Alert Channels</Text>
        </View>
        {(Object.keys(CHANNEL_LABELS) as AlertChannelId[]).map((ch) => (
          <View key={ch} style={styles.channelToggleRow}>
            <View style={styles.channelLabelRow}>
              <View style={[styles.channelDot, { backgroundColor: CHANNEL_COLORS[ch] }]} />
              <Text style={styles.channelLabel}>{CHANNEL_LABELS[ch]}</Text>
            </View>
            <Switch
              value={channels[ch]}
              onValueChange={(v) => setChannelEnabled(ch, v)}
              trackColor={{ false: tokens.white20, true: `${CHANNEL_COLORS[ch]}60` }}
              thumbColor={channels[ch] ? CHANNEL_COLORS[ch] : tokens.white60}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        ))}
        <View style={styles.channelToggleRow}>
          <Text style={styles.channelLabel}>AI Enrichment</Text>
          <Switch
            value={enrichmentEnabled}
            onValueChange={setEnrichmentEnabled}
            trackColor={{ false: tokens.white20, true: `${tokens.secondary}60` }}
            thumbColor={enrichmentEnabled ? tokens.secondary : tokens.white60}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
          />
        </View>
      </View>
    </>
  );
}

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Slide-up modal for managing the API key. */
export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const [pendingKey, setPendingKey] = useState('');

  const { host, connected, status } = useOpenClawStore();
  const [pendingHost, setPendingHost] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [pendingRoleToken, setPendingRoleToken] = useState('');

  // reset inputs each time the sheet opens
  useEffect(() => {
    if (visible) {
      setPendingKey('');
      setPendingHost('');
      setPendingToken('');
      setPendingRoleToken('');
    }
  }, [visible]);

  const handleConnect = () => {
    const h = pendingHost.trim();
    const gwToken = pendingToken.trim();
    const roleToken = pendingRoleToken.trim();
    const token = gwToken || roleToken; // use whichever is provided
    if (!h) return;
    const store = useOpenClawStore.getState();
    store.setHost(h);
    if (gwToken) store.setDeviceToken(gwToken);
    if (roleToken) store.setRoleToken(roleToken);
    connectOpenClaw(h, token);
  };

  const handleDisconnect = () => {
    disconnectOpenClaw();
    useOpenClawStore.getState().reset();
  };

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

          {/* ── OpenClaw Section ── */}
          <View style={styles.divider} />
          <View style={styles.titleRow}>
            <View style={styles.titleLeft}>
              <Zap size={18} color={tokens.secondary} />
              <Text style={styles.title}>OpenClaw</Text>
            </View>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot,
                status === 'connected' ? styles.statusDotConnected :
                status === 'reconnecting' ? styles.statusDotReconnecting :
                styles.statusDotOffline,
              ]} />
              <Text style={styles.statusText}>
                {status === 'connected' ? 'Connected' :
                 status === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
              </Text>
            </View>
          </View>

          {connected ? (
            <ConnectedSection host={host ?? ''} handleDisconnect={handleDisconnect} />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={pendingHost}
                onChangeText={setPendingHost}
                placeholder={host || '192.168.1.x:18789'}
                placeholderTextColor={tokens.white35}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                accessibilityLabel="OpenClaw host"
              />
              <TextInput
                style={styles.input}
                value={pendingToken}
                onChangeText={setPendingToken}
                placeholder="Gateway token"
                placeholderTextColor={tokens.white35}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                returnKeyType="next"
                accessibilityLabel="OpenClaw gateway token"
              />
              <TextInput
                style={styles.input}
                value={pendingRoleToken}
                onChangeText={setPendingRoleToken}
                placeholder="Device token (from openclaw devices rotate)"
                placeholderTextColor={tokens.white35}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleConnect}
                accessibilityLabel="OpenClaw device role token"
              />
              <HapticButton
                variant="secondary"
                size="md"
                fullWidth
                onPress={handleConnect}
                accessibilityRole="button"
                accessibilityLabel="Connect to OpenClaw"
              >
                Connect
              </HapticButton>
            </>
          )}
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
  divider: {
    height: 1,
    backgroundColor: tokens.borderSubtle,
    marginVertical: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotConnected: { backgroundColor: '#22c55e' },
  statusDotReconnecting: { backgroundColor: '#f59e0b' },
  statusDotOffline: { backgroundColor: tokens.white35 },
  statusText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  channelSection: {
    gap: 8,
    marginTop: 4,
  },
  channelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  channelTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white80,
    letterSpacing: 0.3,
  },
  channelToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  channelLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  channelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  channelLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
});
