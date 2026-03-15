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
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Bookmark, Trash2, Plus, Settings, Copy } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { GlassCard } from '../../src/components/ui/GlassCard';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { SkeletonBlock } from '../../src/components/ui/SkeletonLoader';
import { ScreenHeader } from '../../src/components/ui/ScreenHeader';
import { SettingsSheet } from '../../src/components/ui/SettingsSheet';
import { useToast } from '../../src/components/ui/Toast';
import { useWatches, useDeleteWatch, useAddWatch } from '../../src/lib/query';
import { useAuthStore } from '../../src/store/auth';
import { tokens } from '../../src/theme/tokens';
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
  const [addValue, setAddValue] = useState('');
  const [addType, setAddType] = useState<'mint' | 'deployer'>('mint');
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());
  const { showToast, toast } = useToast();

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, { onSuccess: () => refetch() });
  };

  const handleCopy = async (value: string) => {
    await Clipboard.setStringAsync(value);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('Address copied');
  };

  const handleAddSubmit = () => {
    const v = addValue.trim();
    if (!v) return;
    addMutation.mutate({ sub_type: addType, value: v }, {
      onSuccess: () => { refetch(); setAddOpen(false); setAddValue(''); },
    });
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
        <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={styles.lockout}>
            <Bookmark size={48} color={tokens.white20} />
            <Text style={styles.lockoutTitle}>API Key Required</Text>
            <Text style={styles.lockoutSub}>
              Enter your API key to unlock your watchlist.
            </Text>
            <View style={styles.keyInputRow}>
              <TextInput
                style={styles.keyInput}
                value={pendingKey}
                onChangeText={setPendingKey}
                placeholder="sk-…"
                placeholderTextColor={tokens.white35}
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

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 16) }]}>
        <ScreenHeader
          icon={<Bookmark size={26} color={tokens.secondary} strokeWidth={2.5} />}
          title="Watchlist"
          rightAction={
            <View style={styles.headerActions}>
              <Text style={styles.count}>{watches?.length ?? 0} items</Text>
              <TouchableOpacity
                onPress={() => setAddOpen(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Add to watchlist"
              >
                <Plus size={20} color={tokens.secondary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSettingsOpen(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Open API key settings"
              >
                <Settings size={18} color={tokens.white35} />
              </TouchableOpacity>
            </View>
          }
        />
        <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* Add watch modal */}
        <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)} statusBarTranslucent>
          <TouchableWithoutFeedback onPress={() => setAddOpen(false)}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.addSheet}>
            <View style={styles.handle} />
            <Text style={styles.addTitle}>Add to Watchlist</Text>

            {/* Type selector */}
            <View style={styles.typeRow}>
              {(['mint', 'deployer'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setAddType(t)}
                  style={[styles.typeBtn, addType === t && styles.typeBtnActive]}
                >
                  <Text style={[styles.typeBtnText, addType === t && styles.typeBtnTextActive]}>
                    {t === 'mint' ? 'Token Mint' : 'Deployer'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.addInput}
              value={addValue}
              onChangeText={setAddValue}
              placeholder={addType === 'mint' ? 'Token mint address…' : 'Deployer address…'}
              placeholderTextColor={tokens.white35}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleAddSubmit}
              autoFocus
            />
            <HapticButton
              variant="secondary"
              size="md"
              fullWidth
              loading={addMutation.isPending}
              onPress={handleAddSubmit}
              accessibilityRole="button"
              accessibilityLabel="Confirm add to watchlist"
            >
              Add
            </HapticButton>
          </View>
        </Modal>

        {isLoading ? (
          <View style={{ gap: 8, paddingHorizontal: tokens.spacing.screenPadding }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <GlassCard key={i}>
                <SkeletonBlock lines={2} />
              </GlassCard>
            ))}
          </View>
        ) : watches?.length === 0 ? (
          <Animated.View entering={FadeInDown.springify()} style={styles.empty}>
            <GlassCard style={styles.emptyCard} noPadding={false}>
              <View style={styles.emptyIconWrapper}>
                <Bookmark size={36} color={tokens.secondary} />
              </View>
              <Text style={styles.emptyTitle}>Watchlist is empty</Text>
              <Text style={styles.emptySub}>
                Build your edge by tracking key tokens and deployers.
              </Text>
              <View style={styles.emptyAction}>
                <HapticButton 
                  onPress={() => router.push('/(tabs)/scan')} 
                  variant="primary"
                >  Discover Tokens  </HapticButton>
              </View>
            </GlassCard>
          </Animated.View>
        ) : (
          <FlatList
            data={watches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom + 100, 120) }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={tokens.secondary} />
            }
            renderItem={({ item, index }) => (
              <Animated.View exiting={FadeInDown} entering={FadeInDown.delay(index * 50).springify()} layout={LinearTransition.springify()}>
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
              <GlassCard style={styles.watchCard} noPadding>
                <TouchableOpacity
                  style={styles.watchInner}
                  onPress={() => handlePress(item)}
                  onLongPress={() => handleCopy(item.value)}
                  delayLongPress={400}
                  activeOpacity={0.75}
                >
                    <View
                      style={[
                        styles.typeBadge,
                        {
                          backgroundColor:
                            item.sub_type === 'mint'
                              ? `${tokens.secondary}18`
                              : `${tokens.accent}18`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          {
                            color:
                              item.sub_type === 'mint' ? tokens.secondary : tokens.accent,
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
                </GlassCard>
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

  count: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  listContent: {
    gap: 8,
    paddingHorizontal: tokens.spacing.screenPadding,
     
  },
  watchCard: {},
  watchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 12,
    flex: 1,
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

  swipeDeleteBtn: {
    backgroundColor: tokens.risk.critical,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginLeft: 8,
    borderRadius: tokens.radius.sm,
    marginBottom: 0,
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgOverlay, // Figma: rgba(0,0,0,0.7)
  },
  addSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.bgApp, // Figma: --bg-app #040816
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 48,
    gap: 12,
    borderTopWidth: 1,
    borderColor: tokens.borderSubtle,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.white20,
    alignSelf: 'center',
    marginBottom: 8,
  },
  addTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
    marginBottom: 4,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: `${tokens.secondary}20`,
    borderColor: tokens.secondary,
  },
  typeBtnText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  typeBtnTextActive: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
  },
  addInput: {
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
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
  lockoutHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  lockoutHintLink: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
  },
  keyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    paddingHorizontal: 8,
  },
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

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    width: '100%',
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${tokens.secondary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
  },
  emptyAction: {
    marginTop: 24,
    width: '100%',
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
