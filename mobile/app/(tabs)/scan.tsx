import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Search, X, Network, Clock } from 'lucide-react-native';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { ScanOnboarding } from '../../src/components/scan/ScanOnboarding';
import { searchTokens } from '../../src/lib/api';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { TokenSearchResult } from '../../src/types/api';

/** Solana addresses are 32–44 chars of Base58 (no 0, O, I, l). */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function TokenImage({ uri, symbol }: { uri?: string | null; symbol?: string }) {
  const [errored, setErrored] = useState(false);
  const hasUri = !!uri && uri.trim() !== '' && !errored;
  if (hasUri) {
    return (
      <Image
        source={{ uri }}
        style={styles.tokenImg}
        onError={() => setErrored(true)}
      />
    );
  }
  return (
    <View style={[styles.tokenImg, styles.tokenImgFallback]}>
      <Text style={styles.tokenImgText}>{symbol?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recentSearches = useAuthStore((s) => s.recentSearches);
  const addRecentSearch = useAuthStore((s) => s.addRecentSearch);
  const clearRecentSearches = useAuthStore((s) => s.clearRecentSearches);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const trimmed = text.trim();
    if (trimmed.length < 2) { setResults([]); return; }

    // If it looks like a full Solana mint address, navigate directly
    if (BASE58_RE.test(trimmed) && trimmed.length >= 32) {
      addRecentSearch(trimmed);
      router.push(`/token/${trimmed}` as any);
      // Enrich recent search with name/symbol in background
      searchTokens(trimmed, 0, 1).then((data) => {
        if (data.length > 0) addRecentSearch(data[0].mint, data[0].name, data[0].symbol);
      }).catch(() => {});
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchTokens(trimmed);
        setResults(data);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }, 250);
  }, [addRecentSearch]);

  const handleClear = () => { setQuery(''); setResults([]); };

  const runSearch = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 2) return;

    // Direct mint address -> navigate immediately
    if (BASE58_RE.test(trimmed) && trimmed.length >= 32) {
      addRecentSearch(trimmed);
      router.push(`/token/${trimmed}` as any);
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setLoading(true);
    searchTokens(trimmed)
      .then((data) => {
        setResults(data);
        if (data.length > 0) addRecentSearch(data[0].mint, data[0].name, data[0].symbol);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [addRecentSearch]);

  const handleSelect = (mint: string, name?: string, symbol?: string) => {
    addRecentSearch(mint, name, symbol);
    router.push(`/token/${mint}` as any);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScreenHeader
            icon={<Network size={26} color={tokens.secondary} strokeWidth={2.5} />}
            title="Lineage Scan"
            subtitle="Trace token history, deployers & connections"
            style={{ paddingHorizontal: 0 }}
          />

          {/* Search input */}
          <View style={styles.inputPill}>
            <View style={styles.inputLeft}>
              <Search size={20} color={tokens.textTertiary} />
            </View>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={handleChange}
              placeholder="Paste token address..."
              placeholderTextColor={tokens.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search for a token by address or name"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={handleClear}
                hitSlop={tokens.hitSlop}
                style={[styles.clearBtn, { minWidth: tokens.minTouchSize, minHeight: tokens.minTouchSize, justifyContent: 'center', alignItems: 'center' }]}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={16} color={tokens.textTertiary} />
              </TouchableOpacity>
            )}
            {loading && <ActivityIndicator size="small" color={tokens.secondary} style={styles.clearBtn} />}
            <TouchableOpacity
              onPress={() => runSearch(query)}
              style={styles.scanBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.scanBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>

          {/* Onboarding */}
          {query.length === 0 && results.length === 0 && recentSearches.length === 0 && (
            <ScanOnboarding />
          )}

          {/* Recent searches */}
          {query.length === 0 && results.length === 0 && recentSearches.length > 0 && (
            <View style={styles.recentWrap}>
              <View style={styles.recentHeader}>
                <Clock size={12} color={tokens.textTertiary} />
                <Text style={styles.recentTitle}>Recent</Text>
                <TouchableOpacity onPress={clearRecentSearches} hitSlop={tokens.hitSlop} style={{ minHeight: tokens.minTouchSize, justifyContent: 'center' }}>
                  <Text style={styles.recentClear}>Clear</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((item) => (
                <TouchableOpacity
                  key={item.mint}
                  onPress={() => { handleSelect(item.mint, item.name, item.symbol); }}
                  style={styles.recentItem}
                >
                  <Search size={14} color={tokens.textTertiary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {item.name || item.mint}
                      {item.symbol ? ` (${item.symbol})` : ''}
                    </Text>
                    {item.name ? (
                      <Text style={styles.recentAddr} numberOfLines={1}>
                        {item.mint.slice(0, 6)}...{item.mint.slice(-4)}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Results */}
          <FlatList
            data={results}
            keyExtractor={(item) => item.mint}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(index * tokens.timing.listItem).duration(300).springify()}>
              <TouchableOpacity
                onPress={() => handleSelect(item.mint, item.name, item.symbol)}
                accessibilityRole="button"
                accessibilityLabel={`Scan token ${item.name} (${item.symbol})`}
                activeOpacity={0.75}
              >
                <GlassCard style={styles.resultCard} noPadding>
                  <View style={styles.resultInner}>
                    <TokenImage uri={item.image_uri} symbol={item.symbol} />
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.resultSymbol}>{item.symbol}</Text>
                    </View>
                    <View style={styles.resultRight}>
                      {item.market_cap_usd != null && item.market_cap_usd > 0 && (
                        <Text style={styles.riskScore}>
                          {item.market_cap_usd >= 1_000_000
                            ? `$${(item.market_cap_usd / 1_000_000).toFixed(1)}M`
                            : item.market_cap_usd >= 1_000
                            ? `$${(item.market_cap_usd / 1_000).toFixed(0)}K`
                            : `$${item.market_cap_usd.toFixed(0)}`}
                        </Text>
                      )}
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
              </Animated.View>
            )}
            ListEmptyComponent={
              query.length > 1 && !loading ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No results for "{query}"</Text>
                </View>
              ) : null
            }
          />
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  kav: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },
  inputPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: tokens.bgGlass8, borderRadius: 50,
    borderWidth: 1, borderColor: tokens.borderSubtle, paddingVertical: 4, marginBottom: 16,
  },
  inputLeft: { paddingLeft: 16, paddingRight: 8 },
  clearBtn: { paddingHorizontal: 8 },
  scanBtn: {
    backgroundColor: tokens.secondary, borderRadius: tokens.radius.md,
    paddingHorizontal: 20, paddingVertical: 10, marginRight: 4,
    minWidth: 72, alignItems: 'center',
  },
  scanBtnText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.primary },
  input: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white100, paddingVertical: 10,
  },
  listContent: { gap: 8 },
  resultCard: {},
  resultInner: {
    flexDirection: 'row', alignItems: 'center',
    padding: tokens.spacing.cardPadding, gap: 12,
  },
  tokenImg: { width: 40, height: 40, borderRadius: tokens.radius.sm },
  tokenImgFallback: { backgroundColor: tokens.bgGlass12, alignItems: 'center', justifyContent: 'center' },
  tokenImgText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.body, color: tokens.white60 },
  resultInfo: { flex: 1 },
  resultName: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  resultSymbol: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60, marginTop: 2 },
  resultRight: { alignItems: 'flex-end', gap: 4 },
  riskScore: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.white60 },
  empty: { alignItems: 'center', marginTop: 48 },
  emptyText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary },
  recentWrap: { marginBottom: 12, gap: 4 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  recentTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.textTertiary, flex: 1 },
  recentClear: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.secondary },
  recentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
  },
  recentName: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  recentAddr: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 1 },
});
