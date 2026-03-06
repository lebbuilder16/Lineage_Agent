// app/(tabs)/search.tsx
// Search screen — recherche de tokens avec debounce + token cards

import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ListRenderItemInfo,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { searchTokens } from "@/src/lib/api";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { RiskBadge } from "@/src/components/ui/RiskBadge";
import { TokenCardSkeleton } from "@/src/components/ui/SkeletonLoader";
import { colors } from "@/src/theme/colors";
import type { TokenSearchResult } from "@/src/types/api";

function formatMcap(value: number | null): string {
  if (!value) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function TokenCard({ item, index }: { item: TokenSearchResult; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).springify()}>
      <TouchableOpacity
        style={styles.tokenCard}
        onPress={() => router.push(`/lineage/${item.mint}`)}
        activeOpacity={0.7}
      >
        <TokenImage uri={item.image_uri} size={48} symbol={item.symbol} />
        <View style={styles.tokenInfo}>
          <Text style={styles.tokenName} numberOfLines={1}>
            {item.name || "Unknown Token"}
          </Text>
          <Text style={styles.tokenSymbol}>${item.symbol}</Text>
        </View>
        <View style={styles.tokenRight}>
          <Text style={styles.tokenMcap}>{formatMcap(item.market_cap_usd)}</Text>
          <Text style={styles.tokenMono} numberOfLines={1}>
            {item.mint.slice(0, 6)}…{item.mint.slice(-4)}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 300);
  }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchTokens(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TokenSearchResult>) => (
      <TokenCard item={item} index={index} />
    ),
    []
  );

  const showSkeletons = isLoading && debouncedQuery.length >= 2;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Tokens, symbols, mint addresses</Text>
      </View>

      {/* Search input */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.input}
          placeholder="Search tokens, $PEPE, mint…"
          placeholderTextColor={colors.text.muted}
          value={query}
          onChangeText={handleChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          selectionColor={colors.accent.safe}
        />
        {isFetching && (
          <View style={styles.loadingDot} />
        )}
      </View>

      {/* Results */}
      {showSkeletons ? (
        <View>
          {[...Array(6)].map((_, i) => (
            <TokenCardSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.mint}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            debouncedQuery.length >= 2 ? (
              <Animated.View entering={FadeIn} style={styles.empty}>
                <Text style={styles.emptyIcon}>◎</Text>
                <Text style={styles.emptyText}>No tokens found for "{debouncedQuery}"</Text>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn} style={styles.hint}>
                <Text style={styles.hintText}>Type at least 2 characters to search</Text>
              </Animated.View>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.deep },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { color: colors.text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { color: colors.text.muted, fontSize: 13, marginTop: 2 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: colors.glass.bg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  searchIcon: { color: colors.text.muted, fontSize: 18, marginRight: 8 },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    height: "100%",
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.safe,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  tokenCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.glass.border,
    gap: 12,
  },
  tokenInfo: { flex: 1 },
  tokenName: { color: colors.text.primary, fontSize: 15, fontWeight: "600" },
  tokenSymbol: { color: colors.text.muted, fontSize: 12, marginTop: 3 },
  tokenRight: { alignItems: "flex-end" },
  tokenMcap: { color: colors.text.primary, fontSize: 14, fontWeight: "600" },
  tokenMono: { color: colors.text.muted, fontSize: 10, fontFamily: "monospace", marginTop: 3 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 40, color: colors.text.muted, marginBottom: 12 },
  emptyText: { color: colors.text.muted, fontSize: 14 },
  hint: { alignItems: "center", paddingTop: 60 },
  hintText: { color: colors.text.muted, fontSize: 13 },
});
