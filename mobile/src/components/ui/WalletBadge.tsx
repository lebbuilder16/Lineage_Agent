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
import { colors } from "@/src/theme/colors";
import { toast } from "@/src/lib/toast";

interface WalletBadgeProps {
  address?: string | null;
  /** Called when user taps the "Link Phantom" CTA (only shown when address is absent) */
  onLink?: () => void;
  style?: object;
}

export function WalletBadge({ address, onLink, style }: WalletBadgeProps) {
  const handleCopy = () => {
    if (!address) return;
    Clipboard.setString(address);
    toast.success("Address copied!");
  };

  if (!address) {
    return (
      <TouchableOpacity
        style={[styles.unlinkBadge, style]}
        onPress={onLink}
        activeOpacity={0.7}
      >
        <Text style={styles.phantomIcon}>👻</Text>
        <Text style={styles.unlinkText}>Link Phantom Wallet</Text>
      </TouchableOpacity>
    );
  }

  const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <TouchableOpacity
      style={[styles.badge, style]}
      onPress={handleCopy}
      activeOpacity={0.75}
    >
      <Text style={styles.phantomIcon}>👻</Text>
      <Text style={styles.address}>{truncated}</Text>
      <Text style={styles.copyHint}>tap to copy</Text>
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
    backgroundColor: "#7C3AED20",
    borderWidth: 1,
    borderColor: "#9B59F760",
    alignSelf: "flex-start",
  },
  unlinkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#7C3AED18",
    borderWidth: 1,
    borderColor: "#9B59F750",
    borderStyle: "dashed",
  },
  phantomIcon: { fontSize: 14 },
  address: {
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  copyHint: {
    color: colors.text.muted,
    fontSize: 10,
    marginLeft: 2,
  },
  unlinkText: {
    color: "#A78BFA",
    fontSize: 13,
    fontWeight: "600",
  },
});
