// app/(tabs)/search.tsx
// Search screen — recherche de tokens avec debounce + recent searches + trending

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenCardSkeleton } from "@/src/components/ui/SkeletonLoader";
import { TokenImage } from "@/src/components/ui/TokenImage";
import { getGlobalStats, searchTokensPaginated } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { Fonts } from "@/src/theme/fonts";
import type { TokenSearchResult } from "@/src/types/api";

const RECENT_KEY = "recent_searches";
const MAX_RECENT = 10;
const PAGE_SIZE = 20;

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

const TokenCard = React.memo(function TokenCard({
  item,
  index,
}: {
  item: TokenSearchResult;
  index: number;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 40).springify()}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/lineage/${item.mint}`)}
        style={[styles.tokenCard, { borderBottomColor: colors.glass.border }]}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.name || item.symbol} token lineage`}
      >
        <TokenImage uri={item.image_uri} size={48} symbol={item.symbol} />
        <View style={styles.tokenInfo}>
          <Text numberOfLines={1} style={[styles.tokenName, { color: colors.text.primary }]}>
            {item.name || "Unknown Token"}
          </Text>
          <Text style={[styles.tokenSymbol, { color: colors.text.muted }]}>${item.symbol}</Text>
        </View>
        <View style={styles.tokenRight}>
          <Text style={[styles.tokenMcap, { color: colors.text.primary }]}>{formatMcap(item.market_cap_usd)}</Text>
          <Text numberOfLines={1} style={[styles.tokenMono, { color: colors.text.muted }]}>
            {item.mint.slice(0, 6)}…{item.mint.slice(-4)}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

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

  const {
    data: searchData,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isLoading,
    isFetchingNextPage,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: async ({ pageParam }) => {
      if ((pageParam as number) === 0) {
        await saveRecent(debouncedQuery);
        refreshRecent();
      }
      return searchTokensPaginated(debouncedQuery, pageParam as number, PAGE_SIZE);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.length * PAGE_SIZE : undefined,
    initialPageParam: 0,
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
    retry: 0,
  });

  const results = searchData?.pages.flat() ?? [];

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<TokenSearchResult>) => (
      <TokenCard index={index} item={item} />
    ),
    []
  );

  const showSkeletons = isLoading && debouncedQuery.length >= 2;
  const showSuggestions = query.length < 2;
  const showError = isError && debouncedQuery.length >= 2;
  const trendingNarratives = statsData?.top_narratives?.slice(0, 8) ?? [];

  const { colors } = useTheme();

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background.deep }]}>
      {/* Header (Figma Make LineageScanScreen) */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="git-network-outline" size={26} color="#ADC8FF" />
            <View style={styles.iconGlow} />
          </View>
          <Text style={[styles.title, { color: colors.text.primary }]}>Lineage Scan</Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.text.muted }]}>Trace token history, deployers &amp; connections</Text>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.glass.bg, borderColor: colors.glass.border }]}>
        <Ionicons name="search-outline" size={20} color={colors.text.muted} style={styles.searchIconLeft} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={handleChange}
          placeholder="Paste token address..."
          placeholderTextColor={colors.text.muted}
          returnKeyType="search"
          selectionColor={colors.accent.cyan}
          style={[styles.input, { color: colors.text.primary }]}
          value={query}
        />
        <TouchableOpacity
          style={[styles.scanBtn, { backgroundColor: "#ADC8FF" }]}
          onPress={() => { if (debouncedQuery) setDebouncedQuery(debouncedQuery); }}
          activeOpacity={0.8}
        >
          {isFetching ? (
            <ActivityIndicator size="small" color="#020617" />
          ) : (
            <Text style={styles.scanBtnText}>Scan</Text>
          )}
        </TouchableOpacity>
      </View>

      {showError ? (
        <Animated.View entering={FadeIn} style={styles.empty}>
          <Text style={styles.emptyIcon}>⚠</Text>
          <Text style={styles.emptyText}>Impossible de charger les résultats</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : showSuggestions ? (
        <ScrollView
          contentContainerStyle={styles.suggestionsPad}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.suggestionsScroll}
        >
          {recentSearches.length > 0 ? (
            <Animated.View entering={FadeIn}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Recent</Text>
                <TouchableOpacity onPress={handleClearRecent}>
                  <Text style={[styles.clearBtn, { color: colors.accent.blue }]}>Clear</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.chipRow}>
                {recentSearches.map((term) => (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    key={term}
                    onPress={() => handleSelectSuggestion(term)}
                    style={[styles.chip, { backgroundColor: colors.glass.bg, borderColor: colors.glass.border }]}
                  >
                    <Text style={styles.chipIcon}>🕐 </Text>
                    <Text style={[styles.chipText, { color: colors.text.primary }]}>{term}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          ) : null}

          {trendingNarratives.length > 0 ? (
            <Animated.View entering={FadeIn.delay(100)}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>Trending Narratives</Text>
              </View>
              <View style={styles.chipRow}>
                {trendingNarratives.map(({ count, narrative }) => (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    key={narrative}
                    onPress={() => handleSelectSuggestion(narrative)}
                    style={[styles.chip, { backgroundColor: colors.glass.bg, borderColor: `${colors.accent.blue}44` }]}
                  >
                    <Text style={[styles.chipText, { color: colors.text.primary }]}>{narrative}</Text>
                    <Text style={[styles.chipCount, { color: colors.text.muted }]}> {count}</Text>
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
          data={results}
          keyExtractor={(item) => item.mint}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage
              ? <ActivityIndicator color={colors.accent.ai} style={{ paddingVertical: 16 }} />
              : null
          }
          ListEmptyComponent={
            !isLoading ? (
              <Animated.View entering={FadeIn} style={styles.empty}>
                <Text style={styles.emptyIcon}>◎</Text>
                <Text style={styles.emptyText}>No tokens found for "{debouncedQuery}"</Text>
              </Animated.View>
            ) : null
          }
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: "center", borderRadius: 20, borderWidth: 1, flexDirection: "row", paddingHorizontal: 12, paddingVertical: 6 },
  chipCount: { fontSize: 11 },
  chipIcon: { fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipText: { fontSize: 13 },
  clearBtn: { fontSize: 13 },
  container: { flex: 1 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 14 },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  retryBtnText: { fontFamily: Fonts.semiBold, fontSize: 14 },
  header: { paddingBottom: 8, paddingHorizontal: 20, paddingTop: 14 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  iconWrap: { width: 30, height: 30, alignItems: "center", justifyContent: "center", position: "relative" },
  iconGlow: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 15, backgroundColor: "#ADC8FF", opacity: 0.3 },
  title: { fontFamily: Fonts.bold, fontSize: 26, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 2, marginLeft: 42 },
  hint: { alignItems: "center", paddingTop: 60 },
  hintText: { fontSize: 13 },
  input: { flex: 1, fontSize: 15, height: "100%" },
  list: { paddingBottom: 100, paddingHorizontal: 16 },
  searchIconLeft: { marginRight: 4 },
  scanBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 8 },
  scanBtnText: { fontFamily: Fonts.bold, fontSize: 13, color: "#020617" },
  searchWrap: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    height: 52,
    marginHorizontal: 20,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 10, marginTop: 20 },
  sectionTitle: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" },
  suggestionsPad: { paddingBottom: 100, paddingHorizontal: 16 },
  suggestionsScroll: { flex: 1 },
  tokenCard: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", gap: 12, paddingVertical: 14 },
  tokenInfo: { flex: 1 },
  tokenMcap: { fontFamily: Fonts.semiBold, fontSize: 14 },
  tokenMono: { fontFamily: "monospace", fontSize: 10, marginTop: 3 },
  tokenName: { fontFamily: Fonts.semiBold, fontSize: 15 },
  tokenRight: { alignItems: "flex-end" },
  tokenSymbol: { fontSize: 12, marginTop: 3 },
});