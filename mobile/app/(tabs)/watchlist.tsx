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
import { Bookmark, Plus, Search, X, BarChart3 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { useToast } from '../../src/components/ui/Toast';
import { handleTierError } from '../../src/lib/tier-error';
import { useWatches, useDeleteWatch, useAddWatch } from '../../src/lib/query';
import { getWatchTimeline } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/auth';
import { useSweepFlagsStore } from '../../src/store/sweep-flags';
// Cron management is now server-side (cron_manager.py)
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

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const { data: watches, isLoading, isError, refetch } = useWatches(apiKey);
  const deleteMutation = useDeleteWatch(apiKey);
  const addMutation = useAddWatch(apiKey);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState('');
  const [offlineWatches, setOfflineWatches] = useState<Watch[] | null>(null);
  const { showToast, toast } = useToast();

  // Load cached watches for offline-first experience
  useEffect(() => {
    if (!watches && apiKey) {
      import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
        AsyncStorage.getItem('lineage_watches_cache').then((cached) => {
          if (cached) {
            try { setOfflineWatches(JSON.parse(cached)); } catch {}
          }
        });
      });
    }
  }, [watches, apiKey]);

  // Use cached watches when offline
  const effectiveWatches = watches ?? offlineWatches;
  const isOffline = isError && !watches && !!offlineWatches;

  // Sweep flags from centralized store — derive values from flags array
  const flags = useSweepFlagsStore((s) => s.flags);
  const urgentMints = useSweepFlagsStore((s) => s.urgentMints);
  const fetchFlags = useSweepFlagsStore((s) => s.fetchFlags);

  // Derived counts (computed from flags, not store methods)
  const criticalCount = useMemo(
    () => flags.filter((f) => !f.read && f.severity === 'critical').length,
    [flags],
  );

  // Token metadata (name, symbol, image) for tokens without flags
  const [tokenMeta, setTokenMeta] = useState<Record<string, { name?: string; symbol?: string; image?: string }>>({});

  // Enrich token metadata: extract from flags + fetch missing from backend
  useEffect(() => {
    if (!apiKey || !effectiveWatches?.length) return;
    const meta: Record<string, { name?: string; symbol?: string; image?: string }> = {};

    // 1. Extract from flags
    for (const f of flags) {
      if (f.mint && !meta[f.mint]) {
        const d = f.detail as any;
        if (d?.token_name || d?.symbol) {
          meta[f.mint] = { name: d.token_name, symbol: d.symbol, image: d.image_uri };
        }
      }
    }

    // 2. Find mints without metadata
    const missing = (effectiveWatches ?? [])
      .filter((w) => w.sub_type === 'mint' && !meta[w.value] && !tokenMeta[w.value])
      .map((w) => w.value);

    if (Object.keys(meta).length > 0) {
      setTokenMeta((prev) => ({ ...prev, ...meta }));
    }

    // 3. Batch fetch missing from /token-meta/batch endpoint
    if (missing.length > 0) {
      const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');
      fetch(`${BASE}/token-meta/batch?mints=${missing.join(',')}`)
        .then((r) => r.ok ? r.json() : [])
        .then((results: any[]) => {
          if (!results?.length) return;
          const batch: Record<string, { name?: string; symbol?: string; image?: string }> = {};
          for (const data of results) {
            if (data?.mint && (data.name || data.symbol || data.image_uri)) {
              batch[data.mint] = { name: data.name, symbol: data.symbol, image: data.image_uri };
            }
          }
          if (Object.keys(batch).length > 0) {
            setTokenMeta((prev) => ({ ...prev, ...batch }));
          }
        })
        .catch(() => {});
    }
  }, [apiKey, effectiveWatches, flags]);

  // Inline search
  const [searchOpen, setSearchOpen] = useState(false);
  const { query, setQuery, results, loading: searchLoading, clear: clearSearch } = useTokenSearch();

  // Expanded cards
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [timelineData, setTimelineData] = useState<Record<string, any>>({});
  const [timelineLoading, setTimelineLoading] = useState<Set<string>>(new Set());
  // Track which urgent mints we've already auto-expanded (prevent re-expanding after user collapses)
  const autoExpandedRef = useRef<Set<string>>(new Set());

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

  // Auto-expand cards with NEW critical flags only (not ones user already dismissed)
  useEffect(() => {
    if (urgentMints.length > 0 && watches) {
      const newUrgent = new Set<string>();
      for (const w of watches) {
        if (urgentMints.includes(w.value) && !autoExpandedRef.current.has(w.id)) {
          newUrgent.add(w.id);
          autoExpandedRef.current.add(w.id);
        }
      }
      if (newUrgent.size > 0) setExpandedIds((prev) => new Set([...prev, ...newUrgent]));
    }
  }, [urgentMints, watches]);

  // Fetch timeline for expanded mints with timeout + loading tracking
  useEffect(() => {
    if (!apiKey) return;
    const expandedMints = (effectiveWatches ?? [])
      .filter((w) => expandedIds.has(w.id) && !timelineData[w.value] && !timelineLoading.has(w.value))
      .map((w) => w.value);

    for (const mint of expandedMints) {
      setTimelineLoading((prev) => new Set([...prev, mint]));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

      getWatchTimeline(apiKey, mint)
        .then((data) => {
          if (data) setTimelineData((prev) => ({ ...prev, [mint]: data }));
        })
        .catch(() => {
          // On error/timeout, store empty object so we don't retry infinitely
          setTimelineData((prev) => ({ ...prev, [mint]: { error: true } }));
        })
        .finally(() => {
          clearTimeout(timeout);
          setTimelineLoading((prev) => {
            const next = new Set(prev);
            next.delete(mint);
            return next;
          });
        });
    }
  }, [expandedIds, apiKey, watches]);

  // Urgency banner data
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
            onSuccess: () => { refetch(); },
          });
        },
      },
    ]);
  };

  const handleAddSubmit = (type: 'mint' | 'deployer', value: string) => {
    addMutation.mutate({ sub_type: type, value }, {
      onSuccess: () => {
        refetch();
        setAddOpen(false);
        showToast('Watch added', 'success');
      },
      onError: (err: any) => {
        setAddOpen(false);
        // handleTierError imported at top level
        setTimeout(() => {
          if (!handleTierError(err, showToast)) {
            const msg = err?.message || err?.detail || 'Failed to add watch';
            showToast(String(msg), 'error');
          }
        }, 300);
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
                value={pendingKey}
                onChangeText={setPendingKey}
                placeholder="lin_..."
                placeholderTextColor={tokens.textPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={() => { if (pendingKey.trim()) setApiKey(pendingKey.trim()); }}
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
              <Text style={styles.count}>{effectiveWatches?.length ?? 0}</Text>
              <TouchableOpacity
                onPress={() => router.push('/sweep-dashboard' as any)}
                hitSlop={tokens.hitSlop}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel="Sweep dashboard"
              >
                <BarChart3 size={18} color={tokens.textTertiary} />
              </TouchableOpacity>
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

        {/* Offline indicator */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>Offline — showing cached data</Text>
          </View>
        )}

        {isLoading && !offlineWatches ? (
          <View style={{ gap: 8, paddingHorizontal: tokens.spacing.screenPadding }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassCard key={i}><SkeletonBlock lines={2} /></GlassCard>
            ))}
          </View>
        ) : !effectiveWatches?.length ? (
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
            data={effectiveWatches}
            keyExtractor={(item) => item.id}
            extraData={{ expandedIds, timelineData, timelineLoading, flags, tokenMeta }}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            windowSize={7}
            maxToRenderPerBatch={8}
            initialNumToRender={6}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={tokens.secondary} />
            }
            renderItem={({ item, index }) => {
              const mintFlags = flags.filter((f) => f.mint === item.value);
              const isExpanded = expandedIds.has(item.id);
              const isUrgent = urgentMints.includes(item.value);
              const timeline = timelineData[item.value];
              const isTimelineLoading = timelineLoading.has(item.value);
              // Don't pass error placeholder as timeline data
              const validTimeline = timeline && !timeline.error ? timeline : null;

              return (
                <Animated.View
                  entering={FadeInDown.delay(index * tokens.timing.listItem).springify()}
                  layout={LinearTransition.springify()}
                >
                  <WatchCard
                    item={item}
                    flags={mintFlags}
                    timeline={validTimeline}
                    timelineLoading={isTimelineLoading}
                    tokenMeta={tokenMeta[item.value]}
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
  // Offline
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: tokens.spacing.screenPadding, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: tokens.radius.md,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
  },
  offlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },
  offlineText: { fontFamily: 'Lexend-Medium', fontSize: 12, color: '#F59E0B' },
});
