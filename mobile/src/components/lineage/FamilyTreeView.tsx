// src/components/lineage/FamilyTreeView.tsx
// Family tree visualisation simplifiée via composants React Native natifs
// (sans WebView — utilise une structure hiérarchique scrollable horizontalement)

import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { router } from "expo-router";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { colors } from "@/src/theme/colors";
import type { LineageResult, DerivativeInfo } from "@/src/types/api";

interface NodeProps {
  mint: string;
  name: string;
  symbol: string;
  imageUri: string;
  isRoot: boolean;
  isQuery: boolean;
  generation: number;
}

function TreeNode({ mint, name, symbol, imageUri, isRoot, isQuery, generation }: NodeProps) {
  const borderColor = isRoot
    ? colors.accent.safe
    : isQuery
    ? colors.accent.ai
    : generation === 1
    ? colors.accent.warning
    : colors.accent.danger;

  return (
    <TouchableOpacity
      style={styles.nodeWrap}
      onPress={() => router.push(`/lineage/${mint}`)}
      activeOpacity={0.75}
    >
      <View style={[styles.node, { borderColor }]}>
        <TokenImage uri={imageUri} size={48} symbol={symbol} borderRadius={10} />
        {isRoot && <View style={styles.rootCrown}><Text style={styles.crownText}>★</Text></View>}
      </View>
      <Text style={styles.nodeName} numberOfLines={1}>{name || symbol}</Text>
      <Text style={[styles.nodeGen, { color: borderColor }]}>
        {isRoot ? "ROOT" : `Gen ${generation}`}
      </Text>
    </TouchableOpacity>
  );
}

export function FamilyTreeView({ result }: { result: LineageResult }) {
  const { root, derivatives, query_token, query_is_root, mint } = result;

  // Organiser par génération
  const byGen = new Map<number, DerivativeInfo[]>();
  for (const d of derivatives) {
    const g = d.generation ?? 1;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(d);
  }
  const maxGen = derivatives.length > 0 ? Math.max(...derivatives.map((d) => d.generation ?? 1)) : 0;

  return (
    <View style={styles.tree}>
      {/* Root row */}
      {root && (
        <View style={styles.genRow}>
          <TreeNode
            mint={root.mint}
            name={root.name}
            symbol={root.symbol}
            imageUri={root.image_uri}
            isRoot
            isQuery={query_is_root}
            generation={0}
          />
        </View>
      )}

      {/* Connector */}
      {maxGen > 0 && (
        <View style={styles.connector}>
          <View style={styles.connectorLine} />
        </View>
      )}

      {/* Derivatives per generation */}
      {[...Array(maxGen)].map((_, gi) => {
        const gen = gi + 1;
        const items = byGen.get(gen) ?? [];
        if (items.length === 0) return null;
        return (
          <View key={gen}>
            <Text style={styles.genLabel}>Generation {gen}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genScroll}>
              <View style={styles.genRow}>
                {items.map((d) => (
                  <TreeNode
                    key={d.mint}
                    mint={d.mint}
                    name={d.name}
                    symbol={d.symbol}
                    imageUri={d.image_uri}
                    isRoot={false}
                    isQuery={d.mint === mint}
                    generation={gen}
                  />
                ))}
              </View>
            </ScrollView>
            {gen < maxGen && (
              <View style={styles.connector}>
                <View style={styles.connectorLine} />
              </View>
            )}
          </View>
        );
      })}

      {/* Empty state */}
      {maxGen === 0 && !root && (
        <View style={styles.emptyTree}>
          <Text style={styles.emptyTreeText}>No family tree data available</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tree: { padding: 16 },
  genRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  genScroll: { marginVertical: 4 },
  genLabel: {
    color: colors.text.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
    marginVertical: 6,
  },
  nodeWrap: { alignItems: "center", width: 72 },
  node: {
    width: 60,
    height: 60,
    borderRadius: 14,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass.bg,
  },
  rootCrown: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: colors.accent.safe,
    borderRadius: 8,
    padding: 2,
  },
  crownText: { fontSize: 10, color: colors.background.deep },
  nodeName: {
    color: colors.text.primary,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  nodeGen: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
  connector: { alignItems: "center", paddingVertical: 4 },
  connectorLine: {
    width: 1,
    height: 20,
    backgroundColor: colors.glass.border,
  },
  emptyTree: { alignItems: "center", padding: 24 },
  emptyTreeText: { color: colors.text.muted, fontSize: 13 },
});
