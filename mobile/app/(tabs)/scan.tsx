import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Search, X, Network } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { searchTokens } from '../../src/lib/api';
import { tokens } from '../../src/theme/tokens';
import type { TokenSearchResult } from '../../src/types/api';

export default function ScanScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (text.length < 2) { setResults([]); return; }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchTokens(text);
        setResults(data);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }, 400);
  }, []);

  const handleClear = () => { setQuery(''); setResults([]); };

  const handleSelect = (mint: string) => {
    router.push(`/token/${mint}` as any);
  };

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.searchHeader}>
            <View style={styles.titleRow}>
              <View style={styles.iconGlowWrap}>
                <View style={styles.iconGlow} />
                <Network size={26} color={tokens.secondary} strokeWidth={2.5} />
              </View>
              <Text style={styles.title}>Lineage Scan</Text>
            </View>
            <Text style={styles.subtitle}>Trace token history, deployers &amp; connections</Text>
          </View>

          {/* Search input — pill shaped */}
          <View style={styles.inputPill}>
            <View style={styles.inputLeft}>
              <Search size={20} color={tokens.white35} />
            </View>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={handleChange}
              placeholder="Paste token address…"
              placeholderTextColor={tokens.white35}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search for a token by address or name"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={handleClear}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.clearBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={16} color={tokens.white35} />
              </TouchableOpacity>
            )}
            {loading && <ActivityIndicator size="small" color={tokens.secondary} style={styles.clearBtn} />}
            <TouchableOpacity
              onPress={() => {
                if (query.trim().length >= 2) {
                  if (debounceTimer.current) clearTimeout(debounceTimer.current);
                  setLoading(true);
                  searchTokens(query.trim())
                    .then(setResults)
                    .catch(() => {})
                    .finally(() => setLoading(false));
                }
              }}
              style={styles.scanBtn}
              activeOpacity={0.85}
            >
              <Text style={styles.scanBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          <FlatList
            data={results}
            keyExtractor={(item) => item.mint}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelect(item.mint)}
                accessibilityRole="button"
                accessibilityLabel={`Scan token ${item.name} (${item.symbol})`}
                activeOpacity={0.75}
              >
                <GlassCard style={styles.resultCard} noPadding>
                  <View style={styles.resultInner}>
                    {item.image_uri ? (
                      <Image source={{ uri: item.image_uri }} style={styles.tokenImg} />
                    ) : (
                      <View style={[styles.tokenImg, styles.tokenImgFallback]}>
                        <Text style={styles.tokenImgText}>{item.symbol?.[0] ?? '?'}</Text>
                      </View>
                    )}
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.resultSymbol}>{item.symbol}</Text>
                    </View>
                    <View style={styles.resultRight}>
                      {item.market_cap_usd != null && (
                        <Text style={styles.riskScore}>
                          ${(item.market_cap_usd / 1_000).toFixed(0)}K
                        </Text>
                      )}
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  kav: { flex: 1, paddingHorizontal: tokens.spacing.screenPadding },

  searchHeader: { paddingTop: 16, paddingBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  iconGlowWrap: { position: 'relative', width: 26, height: 26 },
  iconGlow: {
    position: 'absolute',
    top: -6, left: -6, right: -6, bottom: -6,
    backgroundColor: tokens.secondary,
    opacity: 0.20,
    borderRadius: 100,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: 26,
    color: tokens.white100,
    letterSpacing: -0.52,
  },
  subtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
    marginLeft: 36,
  },

  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.bgGlass8,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingVertical: 4,
    marginBottom: 16,
  },
  inputLeft: { paddingLeft: 16, paddingRight: 8 },
  clearBtn: { paddingHorizontal: 8 },
  scanBtn: {
    backgroundColor: tokens.secondary,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 4,
    minWidth: 72,
    alignItems: 'center',
  },
  scanBtnText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.primary,
  },
  input: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
    paddingVertical: 10,
  },

  listContent: { gap: 8, paddingBottom: 120 },
  resultCard: {},
  resultInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 12,
  },
  tokenImg: { width: 40, height: 40, borderRadius: tokens.radius.sm },
  tokenImgFallback: {
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenImgText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  resultInfo: { flex: 1 },
  resultName: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  resultSymbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },
  resultRight: { alignItems: 'flex-end', gap: 4 },
  riskScore: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },

  empty: { alignItems: 'center', marginTop: 48 },
  emptyText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white35,
  },
});
