import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Bookmark, Trash2, Plus, ExternalLink } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { useWatches, useDeleteWatch } from '../../src/lib/query';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';
import type { Watch } from '../../src/types/api';

export default function WatchlistScreen() {
  const apiKey = useAuthStore((s) => s.apiKey);
  const { data: watches, isLoading, refetch } = useWatches(apiKey);
  const deleteMutation = useDeleteWatch(apiKey);

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, { onSuccess: () => refetch() });
  };

  const handlePress = (watch: Watch) => {
    if (watch.sub_type === 'mint') {
      router.push(`/token/${watch.value}` as any);
    } else {
      router.push(`/deployer/${watch.value}` as any);
    }
  };

  if (!apiKey) {
    return (
      <View style={styles.container}>
        <AuroraBackground />
        <SafeAreaView style={styles.safe}>
          <View style={styles.lockout}>
            <Bookmark size={48} color={tokens.white20} />
            <Text style={styles.lockoutTitle}>API Key Required</Text>
            <Text style={styles.lockoutSub}>
              Enter your API key in the settings to access your watchlist.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>WATCHLIST</Text>
          <Text style={styles.count}>{watches?.length ?? 0} items</Text>
        </View>

        {isLoading ? (
          <View style={{ gap: 8, paddingHorizontal: tokens.spacing.screenPadding }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassCard key={i}>
                <SkeletonBlock lines={2} />
              </GlassCard>
            ))}
          </View>
        ) : watches?.length === 0 ? (
          <View style={styles.empty}>
            <Bookmark size={48} color={tokens.white20} />
            <Text style={styles.emptyTitle}>No watches yet</Text>
            <Text style={styles.emptySub}>
              Scan a token and tap "Watch" to track deployers and mints.
            </Text>
          </View>
        ) : (
          <FlatList
            data={watches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.primary} />
            }
            renderItem={({ item }) => (
              <GlassCard style={styles.watchCard} noPadding>
                <View style={styles.watchInner}>
                  <TouchableOpacity
                    style={styles.watchBody}
                    onPress={() => handlePress(item)}
                    activeOpacity={0.75}
                  >
                    <View
                      style={[
                        styles.typeBadge,
                        {
                          backgroundColor:
                            item.sub_type === 'mint'
                              ? `${tokens.primary}18`
                              : `${tokens.secondary}18`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          {
                            color:
                              item.sub_type === 'mint' ? tokens.primary : tokens.secondary,
                          },
                        ]}
                      >
                        {item.sub_type.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.watchLabel} numberOfLines={1}>
                      {item.label ?? item.identifier ?? item.value}
                    </Text>
                    <Text style={styles.watchAddress} numberOfLines={1}>
                      {item.value}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(item.id)}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Trash2 size={18} color={tokens.white35} />
                  </TouchableOpacity>
                </View>
              </GlassCard>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
    color: tokens.white100,
    letterSpacing: 2,
  },
  count: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },

  listContent: {
    gap: 8,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 120,
  },
  watchCard: {},
  watchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 12,
  },
  watchBody: { flex: 1, gap: 4 },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: tokens.radius.pill,
    marginBottom: 2,
  },
  typeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.tiny,
    letterSpacing: 0.5,
  },
  watchLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  watchAddress: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
  },
  deleteBtn: {
    padding: 4,
  },

  lockout: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  lockoutTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
  },
  lockoutSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white35,
    textAlign: 'center',
  },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
  },
  emptySub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white35,
    textAlign: 'center',
  },
});
