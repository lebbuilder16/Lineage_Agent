import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import {
  ChevronRight,
  AlertTriangle,
  Zap,
  Users,
  ArrowUpRight,
  ShieldAlert,
  Bot,
} from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { tokens } from '../../theme/tokens';

interface AgentSuggestionsProps {
  data: any;
  mint: string;
}

export function AgentSuggestions({ data, mint }: AgentSuggestionsProps) {
  const suggestions = useMemo(() => {
    const s: { Icon: any; text: string; why: string; route: string; priority: number }[] = [];
    const dp = data?.deployer_profile;
    const br = data?.bundle_report;
    const ins = data?.insider_sell;
    const cr = data?.cartel_report;
    const sf = data?.sol_flow;

    if (ins?.deployer_exited)
      s.push({ Icon: AlertTriangle, text: 'Deployer has fully exited', why: 'All deployer tokens sold — classic rug exit pattern', route: `/investigate/${mint}`, priority: 0 });
    const confirmedRate = dp?.confirmed_rug_rate_pct ?? dp?.rug_rate_pct;
    if (confirmedRate != null && confirmedRate > 30)
      s.push({ Icon: ShieldAlert, text: `Deployer rugged ${dp.confirmed_rug_count ?? '?'} tokens (${confirmedRate.toFixed(0)}%)`, why: `Rug rate is ${confirmedRate.toFixed(0)}% — well above the 15% average`, route: `/investigate/${mint}`, priority: 1 });
    if (br?.overall_verdict?.includes('confirmed'))
      s.push({ Icon: Zap, text: 'Bundle extraction confirmed', why: 'Coordinated wallets extracted SOL post-launch', route: `/sol-trace/${mint}`, priority: 1 });
    if ((cr?.deployer_community?.wallets?.length ?? 0) > 2) {
      // /cartel/[id] expects a base58 wallet, not a 12-char hex community_id —
      // fall back to the first wallet in the community rather than community_id
      // to avoid 400 "Invalid Solana address" from /cartel/search.
      const focusWallet =
        data.query_token?.deployer ||
        data.root?.deployer ||
        cr.deployer_community?.wallets?.[0];
      if (focusWallet) {
        s.push({ Icon: Users, text: `${cr.deployer_community.wallets.length} linked deployers`, why: 'Network of deployers share funding or metadata patterns', route: `/cartel/${focusWallet}`, priority: 2 });
      }
    }
    if (sf?.total_extracted_sol != null && sf.total_extracted_sol > 10)
      s.push({ Icon: ArrowUpRight, text: `${sf.total_extracted_sol.toFixed(1)} SOL extracted`, why: `${sf.hop_count ?? '?'}-hop chain traced from deployer to exit wallets`, route: `/sol-trace/${mint}`, priority: 1 });

    return s.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [data, mint]);

  if (suggestions.length === 0) return null;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Bot size={13} color={tokens.secondary} />
        <Text style={styles.title}>AGENT SUGGESTS</Text>
      </View>
      {suggestions.map((s, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => router.push(s.route as any)}
          activeOpacity={0.75}
          style={[styles.row, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
          accessibilityRole="button"
        >
          <s.Icon size={14} color={tokens.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.text} numberOfLines={1}>{s.text}</Text>
            <Text style={styles.why} numberOfLines={1}>{s.why}</Text>
          </View>
          <ChevronRight size={14} color={tokens.textTertiary} />
        </TouchableOpacity>
      ))}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: `${tokens.secondary}25`, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.tiny, color: tokens.secondary, letterSpacing: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle,
  },
  text: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.white80 },
  why: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 2 },
});
