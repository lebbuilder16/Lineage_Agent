import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
} from 'react-native';
import { router } from 'expo-router';
import { Zap, Clock, Lock, Crown } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import {
  useAgentPrefsStore,
  ALERT_TYPE_OPTIONS,
  SWEEP_INTERVAL_OPTIONS,
  DEPTH_OPTIONS,
} from '../../store/agent-prefs';
import {
  canAccess,
  tierLabel,
  tierColor,
  type PlanTier,
} from '../../lib/tier-limits';
import { tokens } from '../../theme/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentSettingsPanelProps {
  plan: PlanTier;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function TierLock({ required }: { required: PlanTier }) {
  return (
    <TouchableOpacity
      onPress={() => router.push('/paywall' as any)}
      style={styles.tierLockBadge}
      activeOpacity={0.7}
    >
      <Lock size={9} color={tokens.gold} strokeWidth={2.5} />
      <Text style={styles.tierLockText}>{tierLabel(required)}+</Text>
    </TouchableOpacity>
  );
}

function PrefRow({
  icon: Icon,
  label,
  value,
  onToggle,
  isLast,
}: {
  icon: any;
  label: string;
  value: boolean;
  onToggle: () => void;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.prefRow, isLast && { borderBottomWidth: 0 }]}>
      <View
        style={[
          styles.prefIconWrap,
          { backgroundColor: value ? `${tokens.secondary}12` : tokens.bgGlass8 },
        ]}
      >
        <Icon
          size={14}
          color={value ? tokens.secondary : tokens.textTertiary}
          strokeWidth={2}
        />
      </View>
      <Text style={[styles.prefLabel, !value && { color: tokens.textTertiary }]}>
        {label}
      </Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: tokens.bgGlass12, true: `${tokens.violet}50` }}
        thumbColor={value ? tokens.secondary : tokens.textTertiary}
        ios_backgroundColor={tokens.bgGlass12}
      />
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentSettingsPanel({ plan }: AgentSettingsPanelProps) {
  const prefs = useAgentPrefsStore();

  return (
    <View style={{ gap: 10 }}>
      {/* Tier badge */}
      <View style={styles.tierRow}>
        <Crown size={14} color={tierColor(plan)} strokeWidth={2.5} />
        <Text style={[styles.tierLabel, { color: tierColor(plan) }]}>
          {tierLabel(plan)}
        </Text>
        {plan === 'free' && (
          <TouchableOpacity
            onPress={() => router.push('/paywall' as any)}
            style={styles.upgradeBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.upgradeBtnText}>Upgrade</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Section: Alert sensitivity — Pro+ */}
      <GlassCard>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.settingsSection}>ALERT SENSITIVITY</Text>
          {!canAccess(plan, 'pro') && <TierLock required="pro" />}
        </View>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderLabel}>Risk threshold</Text>
          <View style={styles.sliderValueWrap}>
            {[30, 50, 70, 80, 90].map((v) => (
              <TouchableOpacity
                key={v}
                onPress={() => prefs.setRiskThreshold(v)}
                style={[
                  styles.hourChip,
                  prefs.riskThreshold === v && styles.hourChipOn,
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.hourText,
                    prefs.riskThreshold === v && styles.hourTextOn,
                  ]}
                >
                  {v}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={styles.settingsSub}>Alert types</Text>
        <View style={styles.chipWrap}>
          {ALERT_TYPE_OPTIONS.map((opt) => {
            const on = prefs.alertTypes.includes(opt.key);
            const proPlus =
              opt.key === 'cartel' || opt.key === 'operator_match';
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => prefs.toggleAlertType(opt.key)}
                style={[
                  styles.alertChip,
                  on && styles.alertChipOn,
                  proPlus && !canAccess(plan, 'pro_plus') && styles.lockedChip,
                ]}
                activeOpacity={0.7}
              >
                {proPlus && !canAccess(plan, 'pro_plus') && (
                  <Lock size={8} color={tokens.white20} />
                )}
                <Text
                  style={[styles.alertChipText, on && styles.alertChipTextOn]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GlassCard>

      {/* Section: Automation — Pro+ */}
      <GlassCard>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.settingsSection}>AUTOMATION</Text>
          {!canAccess(plan, 'pro_plus') && <TierLock required="pro_plus" />}
        </View>
        <PrefRow
          icon={Zap}
          label="Auto-investigate alerts"
          value={prefs.autoInvestigate}
          onToggle={() => prefs.toggle('autoInvestigate')}
        />
        <Text style={styles.settingsSub}>Investigation depth</Text>
        <View style={styles.chipWrap}>
          {DEPTH_OPTIONS.map((opt) => {
            const on = prefs.investigationDepth === opt.value;
            const needsWhale = opt.value === 'deep';
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => prefs.setInvestigationDepth(opt.value)}
                style={[
                  styles.depthChip,
                  on && styles.depthChipOn,
                  needsWhale &&
                    !canAccess(plan, 'whale') &&
                    styles.lockedChip,
                ]}
                activeOpacity={0.7}
              >
                {needsWhale && !canAccess(plan, 'whale') && (
                  <Lock size={9} color={tokens.white20} />
                )}
                <Text style={[styles.depthLabel, on && styles.depthLabelOn]}>
                  {opt.label}
                </Text>
                <Text style={styles.depthDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GlassCard>

      {/* Section: Monitoring — Pro */}
      <GlassCard>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.settingsSection}>MONITORING</Text>
          {!canAccess(plan, 'pro') && <TierLock required="pro" />}
        </View>
        <Text style={styles.settingsSub}>Sweep frequency</Text>
        <View style={styles.chipWrap}>
          {SWEEP_INTERVAL_OPTIONS.map((opt) => {
            const on = prefs.sweepInterval === opt.value;
            const needsProPlus = opt.value <= 1800;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => prefs.setSweepInterval(opt.value)}
                style={[
                  styles.hourChip,
                  on && styles.hourChipOn,
                  needsProPlus &&
                    !canAccess(plan, 'pro_plus') &&
                    styles.lockedChip,
                ]}
                activeOpacity={0.7}
              >
                {needsProPlus && !canAccess(plan, 'pro_plus') && (
                  <Lock size={8} color={tokens.white20} />
                )}
                <Text style={[styles.hourText, on && styles.hourTextOn]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <PrefRow
          icon={Clock}
          label={`Daily briefing at ${prefs.briefingHour}:00`}
          value={prefs.dailyBriefing}
          onToggle={() => prefs.toggle('dailyBriefing')}
          isLast={!prefs.dailyBriefing}
        />
        {prefs.dailyBriefing && (
          <View style={styles.hourRow}>
            {[6, 7, 8, 9, 10, 12].map((h) => (
              <TouchableOpacity
                key={h}
                onPress={() => prefs.setBriefingHour(h)}
                style={[
                  styles.hourChip,
                  prefs.briefingHour === h && styles.hourChipOn,
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.hourText,
                    prefs.briefingHour === h && styles.hourTextOn,
                  ]}
                >
                  {h}:00
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </GlassCard>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  tierLabel: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    flex: 1,
  },
  upgradeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.gold}15`,
    borderWidth: 1,
    borderColor: `${tokens.gold}40`,
  },
  upgradeBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.gold,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tierLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.gold}10`,
    borderWidth: 1,
    borderColor: `${tokens.gold}25`,
  },
  tierLockText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 9,
    color: tokens.gold,
  },
  lockedChip: {
    opacity: 0.5,
    borderStyle: 'dashed' as any,
  },
  settingsSection: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    color: tokens.textTertiary,
    letterSpacing: 1.2,
  },
  settingsSub: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    marginTop: 12,
    marginBottom: 8,
  },
  sliderRow: {
    gap: 8,
  },
  sliderLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
    marginBottom: 6,
  },
  sliderValueWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  alertChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  alertChipOn: {
    backgroundColor: `${tokens.secondary}12`,
    borderColor: `${tokens.secondary}40`,
  },
  alertChipText: {
    fontFamily: 'Lexend-Medium',
    fontSize: 10,
    color: tokens.textTertiary,
  },
  alertChipTextOn: {
    color: tokens.secondary,
  },
  depthChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
  },
  depthChipOn: {
    backgroundColor: `${tokens.violet}12`,
    borderColor: `${tokens.violet}40`,
  },
  depthLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },
  depthLabelOn: {
    color: tokens.lavender,
  },
  depthDesc: {
    fontFamily: 'Lexend-Regular',
    fontSize: 9,
    color: tokens.white20,
    marginTop: 2,
  },
  hourRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
  },
  hourChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  hourChipOn: {
    backgroundColor: `${tokens.violet}18`,
    borderColor: `${tokens.violet}50`,
  },
  hourText: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  hourTextOn: {
    color: tokens.lavender,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: tokens.borderSubtle,
  },
  prefIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefLabel: {
    flex: 1,
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
});
