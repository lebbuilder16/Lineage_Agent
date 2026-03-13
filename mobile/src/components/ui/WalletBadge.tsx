// src/components/ui/WalletBadge.tsx
// Affiche l'adresse Solana connectée avec style Phantom (violet)
// Props: address (string | undefined | null), style (ViewStyle, optional)

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Clipboard,
} from "react-native";
import { useTheme } from "@/src/theme/ThemeContext";
import { toast } from "@/src/lib/toast";

interface WalletBadgeProps {
  address?: string | null;
  /** Called when user taps the "Link Phantom" CTA (only shown when address is absent) */
  onLink?: () => void;
  style?: object;
}

export function WalletBadge({ address, onLink, style }: WalletBadgeProps) {
  const { colors } = useTheme();
  const handleCopy = () => {
    if (!address) return;
    Clipboard.setString(address);
    toast.success("Address copied!");
  };

  if (!address) {
    return (
      <TouchableOpacity
        style={[styles.unlinkBadge, { backgroundColor: `${colors.accent.ai}18`, borderColor: `${colors.accent.ai}50` }, style]}
        onPress={onLink}
        activeOpacity={0.7}
      >
        <Text style={styles.phantomIcon}>👻</Text>
        <Text style={[styles.unlinkText, { color: colors.accent.aiLight }]}>Link Phantom Wallet</Text>
      </TouchableOpacity>
    );
  }

  const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <TouchableOpacity
      style={[styles.badge, { backgroundColor: `${colors.accent.ai}20`, borderColor: `${colors.accent.ai}60` }, style]}
      onPress={handleCopy}
      activeOpacity={0.75}
    >
      <Text style={styles.phantomIcon}>👻</Text>
      <Text style={[styles.address, { color: colors.accent.aiLight }]}>{truncated}</Text>
      <Text style={[styles.copyHint, { color: colors.text.muted }]}>tap to copy</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  unlinkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  phantomIcon: { fontSize: 14 },
  address: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  copyHint: {
    fontSize: 10,
    marginLeft: 2,
  },
  unlinkText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
