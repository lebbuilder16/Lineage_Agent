import React from 'react';
import { View, Text, TextInput, Switch, StyleSheet } from 'react-native';
import { Zap, LogOut, Bell } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { HapticButton } from '../ui/HapticButton';
import { useAlertPrefsStore } from '../../store/alert-prefs';
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

/* ── Connected sub-section ── */

function ConnectedView({ host, onDisconnect }: { host: string; onDisconnect: () => void }) {
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
        onPress={onDisconnect}
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

/* ── Disconnected sub-section ── */

function DisconnectedView({
  host,
  pendingHost,
  onPendingHostChange,
  pendingToken,
  onPendingTokenChange,
  pendingRoleToken,
  onPendingRoleTokenChange,
  onConnect,
}: {
  host: string | null;
  pendingHost: string;
  onPendingHostChange: (v: string) => void;
  pendingToken: string;
  onPendingTokenChange: (v: string) => void;
  pendingRoleToken: string;
  onPendingRoleTokenChange: (v: string) => void;
  onConnect: () => void;
}) {
  return (
    <>
      <TextInput
        style={styles.input}
        value={pendingHost}
        onChangeText={onPendingHostChange}
        placeholder={host || '192.168.1.x:18789'}
        placeholderTextColor={tokens.textPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        accessibilityLabel="OpenClaw host"
      />
      <TextInput
        style={styles.input}
        value={pendingToken}
        onChangeText={onPendingTokenChange}
        placeholder="Gateway token"
        placeholderTextColor={tokens.textPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        returnKeyType="next"
        accessibilityLabel="OpenClaw gateway token"
      />
      <TextInput
        style={styles.input}
        value={pendingRoleToken}
        onChangeText={onPendingRoleTokenChange}
        placeholder="Device token (from openclaw devices rotate)"
        placeholderTextColor={tokens.textPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={onConnect}
        accessibilityLabel="OpenClaw device role token"
      />
      <HapticButton
        variant="primary"
        size="md"
        fullWidth
        onPress={onConnect}
        accessibilityRole="button"
        accessibilityLabel="Connect to OpenClaw"
      >
        <Text style={styles.connectBtnText}>Connect</Text>
      </HapticButton>
    </>
  );
}

/* ── Main exported section ── */

interface OpenClawSectionProps {
  host: string | null;
  connected: boolean;
  status: string;
  pendingHost: string;
  onPendingHostChange: (v: string) => void;
  pendingToken: string;
  onPendingTokenChange: (v: string) => void;
  pendingRoleToken: string;
  onPendingRoleTokenChange: (v: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function OpenClawSection({
  host,
  connected,
  status,
  pendingHost,
  onPendingHostChange,
  pendingToken,
  onPendingTokenChange,
  pendingRoleToken,
  onPendingRoleTokenChange,
  onConnect,
  onDisconnect,
}: OpenClawSectionProps) {
  return (
    <>
      <View style={styles.divider} />
      <Text style={styles.advancedHint}>
        Advanced — All features work without OpenClaw. This is for power users who self-host their own gateway.
      </Text>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Zap size={18} color={tokens.secondary} />
          <Text style={styles.title}>OpenClaw (Optional)</Text>
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
             status === 'reconnecting' ? 'Reconnecting...' : 'Offline'}
          </Text>
        </View>
      </View>

      {connected ? (
        <ConnectedView host={host ?? ''} onDisconnect={onDisconnect} />
      ) : (
        <DisconnectedView
          host={host}
          pendingHost={pendingHost}
          onPendingHostChange={onPendingHostChange}
          pendingToken={pendingToken}
          onPendingTokenChange={onPendingTokenChange}
          pendingRoleToken={pendingRoleToken}
          onPendingRoleTokenChange={onPendingRoleTokenChange}
          onConnect={onConnect}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: tokens.borderSubtle,
    marginVertical: 4,
  },
  advancedHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: -4,
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
  removeInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.accent,
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
  connectBtnText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
    letterSpacing: 0.3,
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
