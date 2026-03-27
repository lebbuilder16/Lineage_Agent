import React, { useState, useRef } from 'react';
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
import { Bookmark, Trash2, Plus, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Swipeable } from 'react-native-gesture-handler';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SettingsSheet } from '../../src/components/ui/SettingsSheet';
import { useToast } from '../../src/components/ui/Toast';
import { useWatches, useDeleteWatch, useAddWatch, useWatchlistFlags } from '../../src/lib/query';
import { useAuthStore } from '../../src/store/auth';
import { syncWatchlistCrons } from '../../src/lib/openclaw-cron';
import { isOpenClawAvailable } from '../../src/lib/openclaw';
import { tokens } from '../../src/theme/tokens';
import { haptic } from '../../src/lib/haptics';
import { WatchItemCard, AddWatchSheet } from '../../src/components/watchlist';
import type { Watch } from '../../src/types/api';

export default function WatchlistScreen() {
  const insets = useSafeAreaInsets();
  const apiKey = useAuthStore((s) => s.apiKey);
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const { data: watches, isLoading, refetch } = useWatches(apiKey);
  const deleteMutation = useDeleteWatch(apiKey);
  const addMutation = useAddWatch(apiKey);
  const [pendingKey, setPendingKey] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());
  const { showToast, toast } = useToast();

  const { data: flagData } = useWatchlistFlags(apiKey);
  const flagCounts = flagData?.counts ?? {};
  const flagTypes = flagData?.types ?? {};
  const tokenMeta = flagData?.meta ?? {};

  // Sort watches: most flags first, then by risk (from investigation history)
  const sortedWatches = React.useMemo(() => {
    if (!watches) return [];
    return [...watches].sort((a, b) => {
      const fa = flagCounts[a.value] ?? 0;
      const fb = flagCounts[b.value] ?? 0;
      if (fa !== fb) return fb - fa;
      return 0;
    });
  }, [watches, flagCounts]);

  const handleDelete = (id: string) => {
    Alert.alert(
      'Remove watch?',
      'You will no longer receive alerts for this item.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
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
      ],
    );
  };

  const handleCopy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    await haptic.success();
    showToast('Address copied');
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

  const handlePress = (watch: Watch) => {
    if (watch.sub_type === 'mint') {
      router.push(`/token/${watch.value}` as any);
    } else {
      router.push(`/deployer/${watch.value}` as any);
    }
  };

  // ── No API key state ──────────────────────────────────────────────────────

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
                placeholder="sk-…"
                placeholderTextColor={tokens.textPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={() => { if (pendingKey.trim()) setApiKey(pendingKey.trim()); }}
                accessibilityLabel="API key"
              />
              <HapticButton
                variant="secondary"
                size="sm"
                onPress={() => { if (pendingKey.trim()) setApiKey(pendingKey.trim()); }}
                accessibilityRole="button"
                accessibilityLabel="Activate API key"
              >
                Activate
              </HapticButton>
            </View>
            <Text style={styles.lockoutHint}>
              {'Get your key at '}
              <Text style={styles.lockoutHintLink}>lineage-agent.fly.dev/dashboard</Text>
              {'\nor open '}
              <Text style={styles.lockoutHintLink}>lineage://activate?key=YOUR_KEY</Text>
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScreenHeader
          icon={<Bookmark size={26} color={tokens.secondary} strokeWidth={2.5} />}
          title="Watchlist"
          subtitle={`${watches?.length ?? 0} items${Object.values(flagCounts).reduce((s, c) => s + c, 0) > 0 ? ` · ${Object.values(flagCounts).reduce((s, c) => s + c, 0)} flags` : ''}`}
          rightAction={
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setAddOpen(true)}
                hitSlop={tokens.hitSlop}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel="Add to watchlist"
              >
                <Plus size={20} color={tokens.secondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSettingsOpen(true)}
                hitSlop={tokens.hitSlop}
                style={styles.headerBtn}
                accessibilityRole="button"
                accessibilityLabel="Open API key settings"
              >
                <Settings size={18} color={tokens.textTertiary} />
              </TouchableOpacity>
            </View>
          }
        />
        <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <AddWatchSheet
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          onSubmit={handleAddSubmit}
          loading={addMutation.isPending}
        />

        {isLoading ? (
          <View style={{ gap: 8, paddingHorizontal: tokens.spacing.screenPadding }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassCard key={i}><SkeletonBlock lines={2} /></GlassCard>
            ))}
          </View>
        ) : sortedWatches.length === 0 ? (
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
                <HapticButton
                  onPress={() => router.push('/(tabs)/scan')}
                  variant="primary"
                  accessibilityRole="button"
                  accessibilityLabel="Go to scan tab to find tokens"
                >
                  Scan a Token
                </HapticButton>
              </View>
            </GlassCard>
          </Animated.View>
        ) : (
          <FlatList
            data={sortedWatches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.secondary} />}
            renderItem={({ item, index }) => (
              <Animated.View
                exiting={FadeInDown}
                entering={FadeInDown.delay(index * tokens.timing.listItem).springify()}
                layout={LinearTransition.springify()}
              >
                <Swipeable
                  ref={(ref) => { swipeableRefs.current.set(item.id, ref); }}
                  overshootRight={false}
                  renderRightActions={() => (
                    <TouchableOpacity
                      onPress={() => {
                        swipeableRefs.current.get(item.id)?.close();
                        handleDelete(item.id);
                      }}
                      style={styles.swipeDeleteBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.label ?? item.value}`}
                    >
                      <Trash2 size={20} color={tokens.white100} />
                    </TouchableOpacity>
                  )}
                >
                  <WatchItemCard
                    item={item}
                    onPress={handlePress}
                    onCopy={handleCopy}
                    flagCount={flagCounts[item.value] ?? 0}
                    flagTypeList={flagTypes[item.value]}
                    tokenMetaOverride={tokenMeta[item.value]}
                  />
                </Swipeable>
              </Animated.View>
            )}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { minWidth: tokens.minTouchSize, minHeight: tokens.minTouchSize, justifyContent: 'center', alignItems: 'center' },
  listContent: { gap: 8, paddingHorizontal: tokens.spacing.screenPadding },
  swipeDeleteBtn: {
    backgroundColor: tokens.risk.critical,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginLeft: 8,
    borderRadius: tokens.radius.sm,
  },
  lockout: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  lockoutTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white60 },
  lockoutSub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center' },
  lockoutHint: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  lockoutHintLink: { color: tokens.secondary, fontFamily: 'Lexend-SemiBold' },
  keyInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%', paddingHorizontal: 8 },
  keyInput: {
    flex: 1,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  emptyCard: { alignItems: 'center', padding: 32, borderWidth: 1, borderColor: tokens.borderSubtle, width: '100%' },
  emptyIconWrapper: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: `${tokens.secondary}15`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: `${tokens.secondary}30`,
  },
  emptyAction: { marginTop: 24, width: '100%' },
  emptyTitle: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white60 },
  emptySub: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.textTertiary, textAlign: 'center' },
});
