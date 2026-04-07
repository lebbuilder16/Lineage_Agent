// ─────────────────────────────────────────────────────────────────────────────
// AlertPrefsSheet — Channel toggles and alert enrichment preferences
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import {
  Modal,
  View,
  Text,
  Switch,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { X, Bell, Zap, MessageCircle } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { useAlertPrefsStore } from '../../store/alert-prefs';
import { useOpenClawStore } from '../../store/openclaw';
import type { AlertChannelId } from '../../types/openclaw';

interface AlertPrefsSheetProps {
  visible: boolean;
  onClose: () => void;
}

const CHANNEL_LABELS: Record<AlertChannelId, { label: string; description: string }> = {
  telegram: { label: 'Telegram', description: 'Messages via your Telegram bot' },
  whatsapp: { label: 'WhatsApp', description: 'Critical alerts via WhatsApp' },
  discord: { label: 'Discord', description: 'Info & warnings in your server' },
  push: { label: 'Push notifications', description: 'On-device notifications' },
};

export function AlertPrefsSheet({ visible, onClose }: AlertPrefsSheetProps) {
  const channels = useAlertPrefsStore((s) => s.channels);
  const enrichmentEnabled = useAlertPrefsStore((s) => s.enrichmentEnabled);
  const setChannelEnabled = useAlertPrefsStore((s) => s.setChannelEnabled);
  const setEnrichmentEnabled = useAlertPrefsStore((s) => s.setEnrichmentEnabled);
  const ocConnected = useOpenClawStore((s) => s.connected);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            <Bell size={18} color={tokens.secondary} />
            <Text style={styles.title}>Alert Channels</Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close alert preferences"
          >
            <X size={20} color={tokens.white60} />
          </TouchableOpacity>
        </View>

        {!ocConnected && (
          <View style={styles.warningBanner}>
            <Zap size={14} color={tokens.warning} />
            <Text style={styles.warningText}>
              Connect OpenClaw to enable external channels
            </Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
          {/* Channel toggles */}
          <Text style={styles.sectionLabel}>DELIVERY CHANNELS</Text>

          {(Object.keys(CHANNEL_LABELS) as AlertChannelId[]).map((ch) => {
            const meta = CHANNEL_LABELS[ch];
            const isPush = ch === 'push';
            const disabled = !isPush && !ocConnected;

            return (
              <View key={ch} style={[styles.row, disabled && styles.rowDisabled]}>
                <View style={styles.rowLeft}>
                  <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled]}>
                    {meta.label}
                  </Text>
                  <Text style={styles.rowDesc}>{meta.description}</Text>
                </View>
                <Switch
                  value={channels[ch]}
                  onValueChange={(v) => setChannelEnabled(ch, v)}
                  disabled={disabled}
                  trackColor={{ false: tokens.white20, true: `${tokens.secondary}60` }}
                  thumbColor={channels[ch] ? tokens.secondary : tokens.white60}
                />
              </View>
            );
          })}

          {/* AI Enrichment */}
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>AI ENRICHMENT</Text>

          <View style={[styles.row, !ocConnected && styles.rowDisabled]}>
            <View style={styles.rowLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MessageCircle size={13} color={!ocConnected ? tokens.textTertiary : tokens.secondary} />
                <Text style={[styles.rowLabel, !ocConnected && styles.rowLabelDisabled]}>
                  AI context enrichment
                </Text>
              </View>
              <Text style={styles.rowDesc}>
                OpenClaw adds deployer history and risk context to each alert
              </Text>
            </View>
            <Switch
              value={enrichmentEnabled}
              onValueChange={setEnrichmentEnabled}
              disabled={!ocConnected}
              trackColor={{ false: tokens.white20, true: `${tokens.secondary}60` }}
              thumbColor={enrichmentEnabled ? tokens.secondary : tokens.white60}
            />
          </View>

          {/* Escalation summary */}
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>ESCALATION RULES</Text>
          <View style={styles.rulesCard}>
            <Text style={styles.ruleRow}>
              <Text style={styles.ruleType}>Rug </Text>
              <Text style={styles.ruleArrow}>→ </Text>
              <Text style={styles.ruleChannels}>WhatsApp + Push</Text>
            </Text>
            <Text style={styles.ruleRow}>
              <Text style={styles.ruleType}>Risk Timeline / Insider / Bundle </Text>
              <Text style={styles.ruleArrow}>→ </Text>
              <Text style={styles.ruleChannels}>Telegram + Push</Text>
            </Text>
            <Text style={styles.ruleRow}>
              <Text style={styles.ruleType}>Narrative / Zombie </Text>
              <Text style={styles.ruleArrow}>→ </Text>
              <Text style={styles.ruleChannels}>Discord</Text>
            </Text>
            <Text style={styles.ruleHint}>Configure advanced rules in OpenClaw settings</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgOverlay,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.bgApp,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 40,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.white20,
    alignSelf: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${tokens.warning}14`,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: `${tokens.warning}30`,
    marginBottom: 12,
  },
  warningText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.warning,
    flex: 1,
  },
  scroll: { flex: 1 },
  sectionLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
    gap: 12,
  },
  rowDisabled: { opacity: 0.45 },
  rowLeft: { flex: 1, gap: 2 },
  rowLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  rowLabelDisabled: { color: tokens.white60 },
  rowDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  rulesCard: {
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  ruleRow: {
    fontSize: tokens.font.small,
    fontFamily: 'Lexend-Regular',
  },
  ruleType: {
    color: tokens.white60,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
  },
  ruleArrow: {
    color: tokens.textTertiary,
    fontSize: tokens.font.small,
  },
  ruleChannels: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
  },
  ruleHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    marginTop: 4,
  },
});
