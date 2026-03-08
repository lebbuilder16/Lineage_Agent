// app/(tabs)/search.tsx
// Search screen — recherche de tokens avec debounce + recent searches + trending

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  ListRenderItemInfo,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { TokenCardSkeleton } from "@/src/components/ui/SkeletonLoader";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { getGlobalStats, searchTokens } from "@/src/lib/api";
import { colors } from "@/src/theme/colors";
import type { TokenSearchResult } from "@/src/types/api";

const RECENT_KEY = "recent_searches";
const MAX_RECENT = 10;

async function loadRecent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function saveRecent(term: string): Promise<void> {
  if (!term.trim()) return;

  try {
    const existing = await loadRecent();
    const updated = [term, ...existing.filter((item) => item !== term)].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // Best effort only.
  }
}

async function clearRecent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_KEY);
  } catch {
    // Best effort only.
  }
}

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
        activeOpacity={0.7}
        onPress={() => router.push(`/lineage/${item.mint}`)}
        style={styles.tokenCard}
      >
        <TokenImage uri={item.image_uri} size={48} symbol={item.symbol} />
        <View style={styles.tokenInfo}>
          <Text numberOfLines={1} style={styles.tokenName}>
            {item.name || "Unknown Token"}
          </Text>
          <Text style={styles.tokenSymbol}>${item.symbol}</Text>
        </View>
        <View style={styles.tokenRight}>
          <Text style={styles.tokenMcap}>{formatMcap(item.market_cap_usd)}</Text>
          <Text numberOfLines={1} style={styles.tokenMono}>
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
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadRecent().then(setRecentSearches);
  }, []);

  const { data: statsData } = useQuery({
    queryKey: ["global-stats"],
    queryFn: getGlobalStats,
    staleTime: 60_000,
  });

  const refreshRecent = useCallback(() => {
    loadRecent().then(setRecentSearches);
  }, []);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 300);
  }, []);

  const handleSelectSuggestion = useCallback(
    (term: string) => {
      setQuery(term);
      setDebouncedQuery(term);
      saveRecent(term).then(refreshRecent);
    },
    [refreshRecent]
  );

  const handleClearRecent = useCallback(() => {
    clearRecent().then(() => setRecentSearches([]));
  }, []);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: async () => {
      await saveRecent(debouncedQuery);
      refreshRecent();
      return searchTokens(debouncedQuery);
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TokenSearchResult>) => (
      <TokenCard index={index} item={item} />
    ),
    []
  );

  const showSkeletons = isLoading && debouncedQuery.length >= 2;
  const showSuggestions = query.length < 2;
  const trendingNarratives = statsData?.top_narratives?.slice(0, 8) ?? [];

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Tokens, symbols, mint addresses</Text>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={handleChange}
          placeholder="Search tokens, $PEPE, mint…"
          placeholderTextColor={colors.text.muted}
          returnKeyType="search"
          selectionColor={colors.accent.safe}
          style={styles.input}
          value={query}
        />
        {isFetching ? <View style={styles.loadingDot} /> : null}
      </View>

      {showSuggestions ? (
        <ScrollView
          contentContainerStyle={styles.suggestionsPad}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.suggestionsScroll}
        >
          {recentSearches.length > 0 ? (
            <Animated.View entering={FadeIn}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent</Text>
                <TouchableOpacity onPress={handleClearRecent}>
                  <Text style={styles.clearBtn}>Clear</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.chipRow}>
                {recentSearches.map((term) => (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    key={term}
                    onPress={() => handleSelectSuggestion(term)}
                    style={styles.chip}
                  >
                    <Text style={styles.chipIcon}>🕐 </Text>
                    <Text style={styles.chipText}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          ) : null}

          {trendingNarratives.length > 0 ? (
            <Animated.View entering={FadeIn.delay(100)}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Trending Narratives</Text>
              </View>
              <View style={styles.chipRow}>
                {trendingNarratives.map(({ count, narrative }) => (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    key={narrative}
                    onPress={() => handleSelectSuggestion(narrative)}
                    style={[styles.chip, styles.chipTrending]}
                  >
                    <Text style={styles.chipText}>{narrative}</Text>
                    <Text style={styles.chipCount}> {count}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          ) : null}

          {recentSearches.length === 0 && trendingNarratives.length === 0 ? (
            <Animated.View entering={FadeIn} style={styles.hint}>
              <Text style={styles.hintText}>Type at least 2 characters to search</Text>
            </Animated.View>
          ) : null}
        </ScrollView>
      ) : showSkeletons ? (
        <View>
          {[...Array(6)].map((_, index) => (
            <TokenCardSkeleton key={index} />
          ))}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={data ?? []}
          keyExtractor={(item) => item.mint}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Animated.View entering={FadeIn} style={styles.empty}>
              <Text style={styles.emptyIcon}>◎</Text>
              <Text style={styles.emptyText}>No tokens found for "{debouncedQuery}"</Text>
            </Animated.View>
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    backgroundColor: colors.glass.bg,
    borderColor: colors.glass.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipCount: { color: colors.text.muted, fontSize: 11 },
  chipIcon: { fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipText: { color: colors.text.primary, fontSize: 13 },
  chipTrending: { borderColor: `${colors.accent.blue}44` },
  clearBtn: { color: colors.accent.blue, fontSize: 13 },
  container: { backgroundColor: colors.background.deep, flex: 1 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { color: colors.text.muted, fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.text.muted, fontSize: 14 },
  header: { paddingBottom: 4, paddingHorizontal: 20, paddingTop: 8 },
  hint: { alignItems: "center", paddingTop: 60 },
  hintText: { color: colors.text.muted, fontSize: 13 },
  input: {
    color: colors.text.primary,
    flex: 1,
    fontSize: 15,
    height: "100%",
  },
  list: { paddingBottom: 100, paddingHorizontal: 16 },
  loadingDot: {
    backgroundColor: colors.accent.safe,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  searchIcon: { color: colors.text.muted, fontSize: 18, marginRight: 8 },
  searchWrap: {
    alignItems: "center",
    backgroundColor: colors.glass.bg,
    borderColor: colors.glass.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    height: 48,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 14,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    marginTop: 20,
  },
  sectionTitle: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  subtitle: { color: colors.text.muted, fontSize: 13, marginTop: 2 },
  suggestionsPad: { paddingBottom: 100, paddingHorizontal: 16 },
  suggestionsScroll: { flex: 1 },
  title: { color: colors.text.primary, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  tokenCard: {
    alignItems: "center",
    borderBottomColor: colors.glass.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
  },
  tokenInfo: { flex: 1 },
  tokenMcap: { color: colors.text.primary, fontSize: 14, fontWeight: "600" },
  tokenMono: { color: colors.text.muted, fontFamily: "monospace", fontSize: 10, marginTop: 3 },
  tokenName: { color: colors.text.primary, fontSize: 15, fontWeight: "600" },
  tokenRight: { alignItems: "flex-end" },
  tokenSymbol: { color: colors.text.muted, fontSize: 12, marginTop: 3 },
});