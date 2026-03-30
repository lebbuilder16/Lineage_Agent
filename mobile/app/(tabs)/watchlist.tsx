import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Bookmark, Plus, Search, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useToast } from '../../src/components/ui/Toast';
import { useWatches, useDeleteWatch, useAddWatch, useWatchTimeline } from '../../src/lib/query';
import { useAuthStore } from '../../src/store/auth';
import { useSweepFlagsStore } from '../../src/store/sweep-flags';
import { syncWatchlistCrons } from '../../src/lib/openclaw-cron';
import { isOpenClawAvailable } from '../../src/lib/openclaw';
import { useTokenSearch } from '../../src/hooks/useTokenSearch';
import { tokens } from '../../src/theme/tokens';
import { haptic } from '../../src/lib/haptics';
import { WatchCard, AddWatchSheet, UrgencyBanner } from '../../src/components/watchlist';
import type { Watch } from '../../src/types/api';

/* ─── Inline search result row ─── */
function SearchResultRow({ item, onPress }: { item: any; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.searchRow} activeOpacity={0.7}>
      <Text style={styles.searchName} numberOfLines={1}>
        {item.name || item.symbol || item.mint?.slice(0, 8)}
      </Text>
      <Text style={styles.searchSymbol}>{item.symbol}</Text>
      <Text style={styles.searchMint}>{item.mint?.slice(0, 6)}...{item.mint?.slice(-4)}</Text>
    </TouchableOpacity>
  );
}

/* ─── Expanded card timeline loader ─── */
function TimelineLoader({ apiKey, mint }: { apiKey: string; mint: string }) {
  const { data } = useWatchTimeline(apiKey, mint);
  return data ?? null;
}

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const { data: watches, isLoading, refetch } = useWatches(apiKey);
  const deleteMutation = useDeleteWatch(apiKey);
  const addMutation = useAddWatch(apiKey);
  const [addOpen, setAddOpen] = useState(false);
  const { showToast, toast } = useToast();

  // Sweep flags from centralized store
  const flags = useSweepFlagsStore((s) => s.flags);
  const urgentMints = useSweepFlagsStore((s) => s.urgentMints);
  const fetchFlags = useSweepFlagsStore((s) => s.fetchFlags);
  const getCriticalCount = useSweepFlagsStore((s) => s.getCriticalCount);
  const getByMint = useSweepFlagsStore((s) => s.getByMint);

  // Inline search
  const [searchOpen, setSearchOpen] = useState(false);
  const { query, setQuery, results, loading: searchLoading, clear: clearSearch } = useTokenSearch();

  // Expanded cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Track which mints we've fetched timelines for
  const [timelineData, setTimelineData] = useState<Record<string, any>>({});

  const flatListRef = useRef<FlatList>(null);

  // Fetch flags on focus
  useEffect(() => {
    if (apiKey && isFocused) fetchFlags();
  }, [apiKey, isFocused]);

  // Polling flags every 30s
  useEffect(() => {
    if (!apiKey || !isFocused) return;
    const interval = setInterval(fetchFlags, 30_000);
    return () => clearInterval(interval);
  }, [apiKey, isFocused]);

  // Auto-expand cards with critical flags
  useEffect(() => {
    if (urgentMints.length > 0 && watches) {
      const urgent = new Set<string>();
      for (const w of watches) {
        if (urgentMints.includes(w.value)) urgent.add(w.id);
      }
      if (urgent.size > 0) setExpandedIds((prev) => new Set([...prev, ...urgent]));
    }
  }, [urgentMints, watches]);

  // Fetch timeline for expanded mints
  useEffect(() => {
    if (!apiKey) return;
    const expandedMints = (watches ?? [])
      .filter((w) => expandedIds.has(w.id) && !timelineData[w.value])
      .map((w) => w.value);

    for (const mint of expandedMints) {
      const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
      fetch(`${BASE}/agent/watch-timeline/${mint}`, {
        headers: { 'X-API-Key': apiKey },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) setTimelineData((prev) => ({ ...prev, [mint]: data }));
        })
        .catch(() => {});
    }
  }, [expandedIds, apiKey, watches]);

  // Urgency banner data
  const criticalCount = getCriticalCount();
  const affectedTokenNames = useMemo(() => {
    return urgentMints.map((mint) => {
      const flag = flags.find((f) => f.mint === mint);
      return (flag?.detail as any)?.token_name || (flag?.detail as any)?.symbol || mint.slice(0, 8);
    });
  }, [urgentMints, flags]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleDelete = (id: string) => {
    Alert.alert('Remove watch?', 'You will no longer receive alerts for this item.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => {
          haptic.heavy();
          deleteMutation.mutate(id, {
            onSuccess: () => {
              refetch().then(({ data }) => {
                if (isOpenClawAvailable() && data) syncWatchlistCrons(data).catch(() => {});
              });
            },
          });
        },
      },
    ]);
  };

  const handleAddSubmit = (type: 'mint' | 'deployer', value: string) => {
    addMutation.mutate({ sub_type: type, value }, {
      onSuccess: () => {
        refetch().then(({ data }) => {
          if (isOpenClawAvailable() && data) syncWatchlistCrons(data).catch(() => {});
        });
        setAddOpen(false);
      },
    });
  };

  const handleRefresh = async () => {
    await Promise.all([refetch(), fetchFlags()]);
  };

  const handleUrgencyPress = () => {
    // Scroll to first urgent token
    if (!watches) return;
    const idx = watches.findIndex((w) => urgentMints.includes(w.value));
    if (idx >= 0) flatListRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  const handleSearchSelect = (mint: string) => {
    clearSearch();
    setSearchOpen(false);
    router.push(`/token/${mint}` as any);
  };

  // ── No API key ──
  if (!apiKey) {
    return (
      <View style={styles.container}>
        <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={styles.lockout}>
            <Bookmark size={48} color={tokens.white20} />
            <Text style={styles.lockoutTitle}>API Key Required</Text>
            <Text style={styles.lockoutSub}>Enter your API key to unlock your watchlist.</Text>
            <View style={styles.keyInputRow}>
              <TextInput
                style={styles.keyInput}
                value={query}
                onChangeText={(t) => setApiKey(t.trim())}
                placeholder="lin_..."
                placeholderTextColor={tokens.textPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                returnKeyType="done"
                accessibilityLabel="API key"
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── Main render ──
  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScreenHeader
          icon={<Bookmark size={26} color={tokens.secondary} strokeWidth={2.5} />}
          title="Watchlist"
          rightAction={
            <View style={styles.headerActions}>
              <Text style={styles.count}>{watches?.length ?? 0}</Text>
              <TouchableOpacity
                onPress={() => setSearchOpen(!searchOpen)}
                hitSlop={tokens.hitSlop}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel="Search tokens"
              >
                <Search size={18} color={searchOpen ? tokens.secondary : tokens.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAddOpen(true)}
                hitSlop={tokens.hitSlop}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel="Add to watchlist"
              >
                <Plus size={20} color={tokens.secondary} />
              </TouchableOpacity>
            </View>
          }
        />

        {/* Inline search bar */}
        {searchOpen && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.searchContainer}>
            <View style={styles.searchInputRow}>
              <Search size={16} color={tokens.textTertiary} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search token or paste address..."
                placeholderTextColor={tokens.textPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                returnKeyType="search"
              />
              <TouchableOpacity onPress={() => { clearSearch(); setSearchOpen(false); }}>
                <X size={16} color={tokens.textTertiary} />
              </TouchableOpacity>
            </View>
            {results.length > 0 && (
              <View style={styles.searchResults}>
                {results.slice(0, 5).map((r: any) => (
                  <SearchResultRow
                    key={r.mint}
                    item={r}
                    onPress={() => handleSearchSelect(r.mint)}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        )}

        <AddWatchSheet
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          onSubmit={handleAddSubmit}
          loading={addMutation.isPending}
        />

        {/* Urgency banner */}
        <UrgencyBanner
          criticalCount={criticalCount}
          affectedTokenNames={affectedTokenNames}
          onPress={handleUrgencyPress}
        />

        {isLoading ? (
          <View style={{ gap: 8, paddingHorizontal: tokens.spacing.screenPadding }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassCard key={i}><SkeletonBlock lines={2} /></GlassCard>
            ))}
          </View>
        ) : !watches?.length ? (
          <Animated.View entering={FadeInDown.springify()} style={styles.empty}>
            <GlassCard style={styles.emptyCard} noPadding={false}>
              <View style={styles.emptyIconWrapper}>
                <Bookmark size={40} color={`${tokens.secondary}4D`} />
              </View>
              <Text style={styles.emptyTitle}>Start watching tokens</Text>
              <Text style={styles.emptySub}>
                Add tokens to your watchlist to track their risk in real-time
              </Text>
              <View style={styles.emptyAction}>
                <TouchableOpacity
                  onPress={() => setAddOpen(true)}
                  style={styles.emptyBtn}
                  activeOpacity={0.7}
                >
                  <Plus size={16} color={tokens.secondary} />
                  <Text style={styles.emptyBtnText}>Add Token</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </Animated.View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={watches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={tokens.secondary} />
            }
            renderItem={({ item, index }) => {
              const mintFlags = getByMint(item.value);
              const isExpanded = expandedIds.has(item.id);
              const isUrgent = urgentMints.includes(item.value);
              const timeline = timelineData[item.value] ?? null;

              return (
                <Animated.View
                  entering={FadeInDown.delay(index * tokens.timing.listItem).springify()}
                  layout={LinearTransition.springify()}
                >
                  <WatchCard
                    item={item}
                    flags={mintFlags}
                    timeline={timeline}
                    isExpanded={isExpanded}
                    isUrgent={isUrgent}
                    onToggleExpand={() => handleToggleExpand(item.id)}
                    onInvestigate={(mint) => router.push(`/investigate/${mint}` as any)}
                    onViewDeployer={(deployer) => router.push(`/deployer/${deployer}` as any)}
                    onRemove={handleDelete}
                    onPress={(w) => router.push(
                      w.sub_type === 'mint' ? `/token/${w.value}` as any : `/deployer/${w.value}` as any,
                    )}
                  />
                </Animated.View>
              );
            }}
          />
        )}
      </View>
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  count: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.white60 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerBtn: {
    minWidth: tokens.minTouchSize, minHeight: tokens.minTouchSize,
    justifyContent: 'center', alignItems: 'center',
  },
  listContent: { gap: 8, paddingHorizontal: tokens.spacing.screenPadding },
  // Search
  searchContainer: { paddingHorizontal: tokens.spacing.screenPadding, marginBottom: 8 },
  searchInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.pill,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  searchInput: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: 13,
    color: tokens.white100, padding: 0,
  },
  searchResults: {
    marginTop: 4, backgroundColor: tokens.bgGlass12,
    borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.borderSubtle,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: tokens.borderSubtle,
  },
  searchName: { flex: 1, fontFamily: 'Lexend-Medium', fontSize: 13, color: tokens.white100 },
  searchSymbol: { fontFamily: 'Lexend-Regular', fontSize: 11, color: tokens.secondary },
  searchMint: { fontFamily: 'Lexend-Regular', fontSize: 10, color: tokens.textTertiary },
  // Lockout
  lockout: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  lockoutTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white60 },
  lockoutSub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center' },
  keyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', paddingHorizontal: 8 },
  keyInput: {
    flex: 1, backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.pill,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingHorizontal: 16, paddingVertical: 10,
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white100,
  },
  // Empty
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  emptyCard: { alignItems: 'center', padding: 32, borderWidth: 1, borderColor: tokens.borderSubtle, width: '100%' },
  emptyIconWrapper: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${tokens.secondary}15`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: `${tokens.secondary}30`,
  },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white60 },
  emptySub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center' },
  emptyAction: { marginTop: 24, width: '100%' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: tokens.radius.pill,
    backgroundColor: `${tokens.secondary}15`, borderWidth: 1, borderColor: `${tokens.secondary}40`,
  },
  emptyBtnText: { fontFamily: 'Lexend-SemiBold', fontSize: 14, color: tokens.secondary },
});
