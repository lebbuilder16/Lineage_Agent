import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ViewStyle,
} from 'react-native';
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
  Skull,
  Bell,
  Bookmark,
  type LucideIcon,
} from 'lucide-react-native';
import { tokens } from '../../theme/tokens';

export type TabName = 'radar' | 'scan' | 'clock' | 'alerts' | 'watchlist';

interface Tab {
  name: TabName;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { name: 'radar', label: 'Radar', icon: Activity },
  { name: 'scan', label: 'Scan', icon: Search },
  { name: 'clock', label: 'Clock', icon: Skull },
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
  return (
    <View style={[styles.wrapper, style]}>
      <BlurView intensity={28} tint="dark" style={styles.blur}>
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
        {isActive && <View style={styles.activeIndicator} />}
        <View style={styles.iconWrap}>
          <Icon
            size={isActive ? 22 : 20}
            color={isActive ? tokens.primary : tokens.white35}
            strokeWidth={isActive ? 2.2 : 1.8}
          />
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.label,
            { color: isActive ? tokens.primary : tokens.white35 },
          ]}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Platform.select({ ios: 24, android: 16 }),
    left: 16,
    right: 16,
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tokens.white10,
    // Glow shadow
    shadowColor: tokens.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  blur: { borderRadius: tokens.radius.xl },
  inner: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: tokens.bgGlass8,
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
    backgroundColor: `${tokens.primary}18`,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: `${tokens.primary}30`,
  },
  iconWrap: { position: 'relative' },
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
  label: {
    fontFamily: 'Lexend-Medium',
    fontSize: 10,
    marginTop: 3,
    letterSpacing: 0.3,
  },
});
