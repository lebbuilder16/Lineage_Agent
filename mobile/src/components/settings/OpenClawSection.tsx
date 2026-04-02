import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Zap, Bell } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
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

interface OpenClawSectionProps {
  connected: boolean;
  status: string;
}

export function OpenClawSection({ connected, status }: OpenClawSectionProps) {
  const channels = useAlertPrefsStore((s) => s.channels);
  const setChannelEnabled = useAlertPrefsStore((s) => s.setChannelEnabled);
  const enrichmentEnabled = useAlertPrefsStore((s) => s.enrichmentEnabled);
  const setEnrichmentEnabled = useAlertPrefsStore((s) => s.setEnrichmentEnabled);

  return (
    <>
      <View style={styles.divider} />
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Zap size={18} color={tokens.secondary} />
          <Text style={styles.title}>Live Gateway</Text>
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

      {connected && (
        <Text style={styles.hint}>
          Real-time alerts, watchlist monitoring, and automated rug response active.
        </Text>
      )}

      {!connected && (
        <Text style={styles.hint}>
          Connects automatically when signed in.
        </Text>
      )}

      {/* Alert Channels Config — always visible */}
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

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: tokens.borderSubtle,
    marginVertical: 4,
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
  hint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    marginBottom: 4,
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
