import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ViewStyle,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
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
import { useReducedMotion } from '../../hooks/useReducedMotion';

export type TabName = 'radar' | 'scan' | 'agent' | 'alerts' | 'watchlist';

export const TAB_BAR_INNER_HEIGHT = 64;
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
  const bottomOffset = Math.max(insets.bottom, Platform.select({ ios: 8, android: 8 }) ?? 8);

  // Sliding indicator position
  const activeIndex = TABS.findIndex((t) => t.name === activeTab);
  const indicatorX = useSharedValue(0);
  const tabWidth = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (tabWidth.value > 0) {
      const target = activeIndex * tabWidth.value;
      indicatorX.value = reducedMotion
        ? withTiming(target, { duration: 0 })
        : withSpring(target, { damping: 18, stiffness: 280 });
    }
  }, [activeIndex, tabWidth.value, reducedMotion]);

  const onTabLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && tabWidth.value === 0) {
      tabWidth.value = w;
      indicatorX.value = activeIndex * w;
    }
  }, [activeIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: tabWidth.value,
  }));

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset + TAB_BAR_BOTTOM_MARGIN }, style]}>
      <BlurView intensity={80} tint="dark" style={styles.blur}>
        <View style={styles.inner}>
          {/* Sliding glow indicator */}
          <Animated.View style={[styles.slidingIndicator, indicatorStyle]}>
            <View style={styles.slidingIndicatorInner} />
          </Animated.View>

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
              onLayout={tab.name === TABS[0].name ? onTabLayout : undefined}
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
  onLayout?: (e: LayoutChangeEvent) => void;
}

function TabButton({ tab, isActive, badge, onPress, onLayout }: TabButtonProps) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (reducedMotion) {
      scale.value = withTiming(0.95, { duration: 0 }, () => {
        scale.value = withTiming(1, { duration: 0 });
      });
    } else {
      scale.value = withSpring(0.88, tokens.timing.springBouncy, () => {
        scale.value = withSpring(1, tokens.timing.springSnappy);
      });
    }
    onPress();
  };

  const Icon = tab.icon;

  return (
    <Pressable
      onPress={handlePress}
      onLayout={onLayout}
      style={styles.tabButton}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View style={[styles.tabInner, animStyle]}>
        <View style={styles.iconWrap}>
          <Icon
            size={isActive ? 22 : 20}
            color={isActive ? tokens.secondary : tokens.textTertiary}
            strokeWidth={isActive ? 2.5 : 1.8}
          />
          {/* Icon glow behind active icon */}
          {isActive && <View style={styles.iconGlow} />}
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </View>
        {/* Label with animated opacity */}
        <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
          {tab.label}
        </Text>
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
    borderColor: tokens.borderMedium,
    shadowColor: tokens.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 14,
  },
  blur: { borderRadius: tokens.radius.xl },
  inner: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 6,
    backgroundColor: `${tokens.bgApp}F0`,
  },
  // Sliding indicator that follows active tab
  slidingIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    zIndex: 0,
  },
  slidingIndicatorInner: {
    flex: 1,
    backgroundColor: 'rgba(173, 200, 255, 0.10)',
    borderRadius: tokens.radius.lg,
    // Subtle glow border
    borderWidth: 1,
    borderColor: 'rgba(173, 200, 255, 0.15)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    zIndex: 1,
  },
  tabInner: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.md,
    minWidth: 52,
  },
  iconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  iconGlow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(173, 200, 255, 0.20)',
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
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 10,
    color: tokens.white100,
    lineHeight: 13,
  },
  label: {
    fontFamily: 'Lexend-Medium',
    fontSize: 9,
    marginTop: 3,
    letterSpacing: 0.3,
  },
  labelActive: {
    color: tokens.secondary,
  },
  labelInactive: {
    color: tokens.textTertiary,
    opacity: 0.6,
  },
});
