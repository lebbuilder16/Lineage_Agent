import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ArrowRightLeft, Users, Skull, ShieldAlert, ArrowUpRight } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';

import type { ForensicSnapshotEvent } from '../../lib/investigate-streaming';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

interface Props {
  snapshot: ForensicSnapshotEvent;
  mint: string;
}

function fmtSol(v: number | null | undefined): string {
  if (v == null) return '—';
  return v < 0.01 ? '<0.01' : v.toFixed(2);
}

export function ForensicSnapshotCard({ snapshot, mint }: Props) {
  const { sol_flow, bundle_report, deployer_profile, cartel_report, insider_sell } = snapshot;

  const hasData = sol_flow || bundle_report || deployer_profile || cartel_report;
  if (!hasData) return null;

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(300).springify()}>
      <GlassCard>
        <Text style={styles.title}>FORENSIC DATA</Text>

        {sol_flow && sol_flow.total_extracted_sol != null && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/sol-trace/${mint}` as any)}
            activeOpacity={0.7}
          >
            <ArrowRightLeft size={14} color={tokens.secondary} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>SOL Flow Trace</Text>
              <Text style={styles.rowValue}>
                {fmtSol(sol_flow.total_extracted_sol)} SOL extracted
                {sol_flow.hop_count ? ` · ${sol_flow.hop_count} hops` : ''}
                {sol_flow.known_cex_detected ? ' · CEX detected' : ''}
              </Text>
            </View>
            <ArrowUpRight size={14} color={tokens.textTertiary} />
          </TouchableOpacity>
        )}

        {bundle_report && bundle_report.overall_verdict && (
          <View style={styles.row}>
            <Skull size={14} color={tokens.accent} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Bundle Report</Text>
              <Text style={styles.rowValue}>
                {(bundle_report.overall_verdict ?? '').replace(/_/g, ' ')}
                {bundle_report.bundle_count ? ` · ${bundle_report.bundle_count} bundle(s)` : ''}
                {bundle_report.total_extracted_sol != null ? ` · ${fmtSol(bundle_report.total_extracted_sol)} SOL` : ''}
              </Text>
            </View>
          </View>
        )}

        {deployer_profile && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/deployer/${deployer_profile.address}` as any)}
            activeOpacity={0.7}
          >
            <Users size={14} color={tokens.secondary} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Deployer Profile</Text>
              <Text style={styles.rowValue}>
                {deployer_profile.total_tokens_launched ?? '?'} tokens
                {deployer_profile.confirmed_rug_count != null ? ` · ${deployer_profile.confirmed_rug_count} rugs` : ''}
                {deployer_profile.rug_rate_pct != null ? ` · ${deployer_profile.rug_rate_pct.toFixed(0)}% rug rate` : ''}
              </Text>
            </View>
            <ArrowUpRight size={14} color={tokens.textTertiary} />
          </TouchableOpacity>
        )}

        {cartel_report?.deployer_community?.community_id && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/cartel/${cartel_report.deployer_community.community_id}` as any)}
            activeOpacity={0.7}
          >
            <ShieldAlert size={14} color={tokens.accent} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Cartel Network</Text>
              <Text style={styles.rowValue}>
                {cartel_report.deployer_community.wallets?.length ?? '?'} deployers
                {cartel_report.deployer_community.total_rugs != null ? ` · ${cartel_report.deployer_community.total_rugs} rugs` : ''}
              </Text>
            </View>
            <ArrowUpRight size={14} color={tokens.textTertiary} />
          </TouchableOpacity>
        )}

        {insider_sell && (insider_sell.deployer_exited || (insider_sell.flags?.length ?? 0) > 0) && (
          <View style={styles.row}>
            <ShieldAlert size={14} color={insider_sell.deployer_exited ? (tokens.risk?.critical ?? '#FF4444') : tokens.risk?.medium ?? '#FFB347'} />
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Insider Sell</Text>
              <Text style={styles.rowValue}>
                {insider_sell.deployer_exited ? 'Deployer exited' : insider_sell.verdict?.replace(/_/g, ' ') ?? ''}
                {insider_sell.sell_pressure_1h != null ? ` · ${(insider_sell.sell_pressure_1h * 100).toFixed(0)}% sell pressure 1h` : ''}
              </Text>
            </View>
          </View>
        )}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.white10 ?? 'rgba(255,255,255,0.06)',
  },
  rowInfo: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: 'Lexend-Medium',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  rowValue: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
    marginTop: 2,
  },
});
