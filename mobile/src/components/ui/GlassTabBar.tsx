import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  Activity,
  Search,
  Bot,
  Bell,
  Bookmark,
  type LucideIcon,
} from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

export type TabName = 'radar' | 'scan' | 'agent' | 'alerts' | 'watchlist';

/**
 * Visual height of the tab bar pill (icon + label when active + vertical padding).
 * Used by _layout.tsx to reserve space so screens never render behind the bar.
 */
export const TAB_BAR_INNER_HEIGHT = 64;

/**
 * The gap (px) between the bottom of the pill and the safe-area bottom offset.
 * Matches the `+ 12` in the wrapper's `bottom` style.
 */
export const TAB_BAR_BOTTOM_MARGIN = 12;

interface Tab {
  name: TabName;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { name: 'radar', label: 'Radar', icon: Activity },
  { name: 'scan', label: 'Scan', icon: Search },
  { name: 'agent', label: 'Agent', icon: Bot },
  { name: 'alerts', label: 'Alerts', icon: Bell },
  { name: 'watchlist', label: 'Watch', icon: Bookmark },
];

interface GlassTabBarProps {
  activeTab: TabName;
  onPress: (tab: TabName) => void;
  unreadAlerts?: number;
  style?: ViewStyle;
}

export function GlassTabBar({
  activeTab,
  onPress,
  unreadAlerts = 0,
  style,
}: GlassTabBarProps) {
  const insets = useSafeAreaInsets();
  // Clearance above phone's home indicator / gesture bar
  const bottomOffset = Math.max(insets.bottom, Platform.select({ ios: 8, android: 8 }) ?? 8);
  return (
    <View style={[styles.wrapper, { bottom: bottomOffset + TAB_BAR_BOTTOM_MARGIN }, style]}>
      <BlurView intensity={80} tint="dark" style={styles.blur}>
        <View style={styles.inner}>
          {TABS.map((tab) => (
            <TabButton
              key={tab.name}
              tab={tab}
              isActive={activeTab === tab.name}
              badge={tab.name === 'alerts' ? unreadAlerts : 0}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPress(tab.name);
              }}
            />
          ))}
        </View>
      </BlurView>
    </View>
  );
}

interface TabButtonProps {
  tab: Tab;
  isActive: boolean;
  badge: number;
  onPress: () => void;
}

function TabButton({ tab, isActive, badge, onPress }: TabButtonProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSpring(0.88, { damping: 8, stiffness: 300 }, () => {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    });
    onPress();
  };

  const Icon = tab.icon;

  return (
    <Pressable onPress={handlePress} style={styles.tabButton} accessibilityRole="button" accessibilityLabel={tab.label} accessibilityState={{ selected: isActive }}>
      <Animated.View style={[styles.tabInner, animStyle]}>
        {/* Active bubble — Figma: bg-secondary/12 */}
        {isActive && <View style={styles.activeIndicator} />}
        <View style={styles.iconWrap}>
          <Icon
            size={isActive ? 22 : 20}
            color={isActive ? tokens.secondary : tokens.white35}
            strokeWidth={isActive ? 2.5 : 1.8}
          />
          {/* Icon glow — Figma: bg-secondary blur-md opacity-30 */}
          {isActive && <View style={styles.iconGlow} />}
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </View>
        {/* Label only appears when active — matches Figma animation */}
        {isActive && (
          <Text style={styles.labelActive}>{tab.label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    // Glow shadow — Figma secondary (ice blue)
    shadowColor: tokens.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 14,
  },
  blur: { borderRadius: tokens.radius.xl },
  inner: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: 'rgba(8, 10, 22, 0.94)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabInner: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.md,
    minWidth: 52,
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Figma: bg-secondary/12 rounded-full
    backgroundColor: 'rgba(173, 200, 255, 0.12)',
    borderRadius: tokens.radius.pill,
  },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  iconGlow: {
    // Figma: absolute inset-0 bg-secondary blur-md opacity-30
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(173, 200, 255, 0.30)',
    // Note: true blur not available on RN Views, we simulate with radial opacity
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: tokens.accent,
    borderRadius: tokens.radius.pill,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: '#fff',
    lineHeight: 12,
  },
  labelActive: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.5,
    color: tokens.secondary, // Figma: text-secondary for active
  },
});
