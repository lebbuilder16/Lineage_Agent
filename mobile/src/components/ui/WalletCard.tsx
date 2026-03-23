import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Wallet, Copy, ArrowUpRight, ArrowDownLeft, Check } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { GlassCard } from './GlassCard';
import { HapticButton } from './HapticButton';
import { useSolBalance } from '../../hooks/useSolBalance';

interface Props {
  address?: string | null;
  onSend: () => void;
  onReceive: () => void;
}

export function WalletCard({ address, onSend, onReceive }: Props) {
  const { balance, isLoading } = useSolBalance(address);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!address) {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.emptyRow}>
          <Wallet size={20} color={tokens.white35} />
          <Text style={styles.emptyText}>No wallet connected</Text>
        </View>
      </GlassCard>
    );
  }

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayBal = isLoading ? '—' : balance != null ? balance.toFixed(4) : '—';

  return (
    <GlassCard style={styles.card}>
      {/* Balance */}
      <View style={styles.balanceRow}>
        <View style={styles.balIcon}>
          <Wallet size={18} color={tokens.secondary} />
        </View>
        <View style={styles.balBody}>
          <Text style={styles.balLabel}>SOL Balance</Text>
          <Text style={styles.balValue}>{displayBal} <Text style={styles.balUnit}>SOL</Text></Text>
        </View>
      </View>

      {/* Address */}
      <Pressable style={styles.addrRow} onPress={handleCopy}>
        <Text style={styles.addrText}>{truncated}</Text>
        {copied
          ? <Check size={14} color={tokens.success} />
          : <Copy size={14} color={tokens.white35} />
        }
      </Pressable>

      {/* Actions */}
      <View style={styles.actions}>
        <HapticButton variant="ghost" size="md" style={styles.actionBtn} onPress={onSend}>
          <ArrowUpRight size={16} color={tokens.secondary} />
          <Text style={styles.actionText}>Send</Text>
        </HapticButton>
        <HapticButton variant="ghost" size="md" style={styles.actionBtn} onPress={onReceive}>
          <ArrowDownLeft size={16} color={tokens.success} />
          <Text style={styles.actionText}>Receive</Text>
        </HapticButton>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  emptyText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white35 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  balIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: `${tokens.secondary}12`, borderWidth: 1, borderColor: `${tokens.secondary}25`,
    alignItems: 'center', justifyContent: 'center',
  },
  balBody: { flex: 1 },
  balLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white35 },
  balValue: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100 },
  balUnit: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white35 },
  addrRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.xs,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addrText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
  actionText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white80 },
});
