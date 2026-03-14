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
import { Search, X } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { RiskBadge } from '../../src/components/ui/RiskBadge';
import { searchTokens } from '../../src/lib/api';
import { tokens } from '../../src/theme/tokens';
import type { TokenSearchResult } from '../../src/types/api';

export default function ScanScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TokenSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

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
            <Text style={styles.title}>SCAN TOKEN</Text>
            <Text style={styles.subtitle}>Search by name, symbol, or mint address</Text>
          </View>

          {/* Search input */}
          <GlassCard style={styles.inputCard} noPadding>
            <View style={styles.inputRow}>
              <Search size={18} color={tokens.white35} />
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={handleChange}
                placeholder="Search tokens…"
                placeholderTextColor={tokens.white35}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={16} color={tokens.white35} />
                </TouchableOpacity>
              )}
              {loading && <ActivityIndicator size="small" color={tokens.primary} />}
            </View>
          </GlassCard>

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
                      {item.risk_level && <RiskBadge level={item.risk_level} />}
                      {item.risk_score != null && (
                        <Text style={styles.riskScore}>
                          {Math.round(item.risk_score * 100)}%
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
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
    color: tokens.white100,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 4,
  },

  inputCard: { marginBottom: 16 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.spacing.cardPadding,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
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
