// app/onboarding.tsx
// First-launch onboarding — 3 branded slides with animated in-app previews

import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  ViewToken,
} from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  FadeInDown,
  FadeIn,
} from "react-native-reanimated";
import { useTheme } from "@/src/theme/ThemeContext";
import { colors } from "@/src/theme/colors";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/src/theme/fonts";
import { HapticButton } from "@/src/components/ui/HapticButton";

const { width } = Dimensions.get("window");
export const ONBOARDING_KEY = "onboarding_done";

// ── RiskPreview: animated risk bar to 87% (Slide 1)
function RiskPreview() {
  const { colors: tc } = useTheme();
  const barWidth = useSharedValue(0);
  useEffect(() => {
    barWidth.value = withDelay(400, withSpring(87, { mass: 1, damping: 14 }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%` as unknown as number,
  }));
  return (
    <Animated.View entering={FadeInDown.delay(200).springify()} style={[basePrev.card, { backgroundColor: tc.glass.bgElevated, borderColor: "rgba(98, 46, 195, 0.40)" }]}>
      <View style={basePrev.cardHeader}>
        <View style={[basePrev.statusDot, { backgroundColor: tc.accent.danger }]} />
        <Text style={[basePrev.cardTitle, { color: tc.text.primary }]}>$PEPE2 — Clone detected</Text>
        <View style={[basePrev.criticalBadge, { backgroundColor: `${tc.accent.danger}22` }]}>
          <Text style={[basePrev.criticalText, { color: tc.accent.danger }]}>CRITICAL</Text>
        </View>
      </View>
      <View style={[basePrev.barTrack, { backgroundColor: tc.glass.bg }]}>
        <Animated.View
          style={[basePrev.barFill, barStyle, { backgroundColor: tc.accent.danger }]}
        />
      </View>
      <View style={basePrev.cardRow}>
        <Text style={[basePrev.cardSub, { color: tc.text.muted }]}>Risk score</Text>
        <Text style={[basePrev.cardValue, { color: tc.accent.danger }]}>87 / 100</Text>
      </View>
      <View style={basePrev.cardRow}>
        <Text style={[basePrev.cardSub, { color: tc.text.muted }]}>Deployer history</Text>
        <Text style={[basePrev.cardValue, { color: tc.accent.warning }]}>14 rug pulls</Text>
      </View>
    </Animated.View>
  );
}

// ── AlertsPreview: staggered fake alert rows (Slide 2)
const FAKE_ALERTS = [
  {
    color: colors.accent.danger,
    label: "RUG CONFIRMED",
    name: "$DOGE3",
    msg: "Liquidity drained — $127K",
  },
  {
    color: colors.accent.warning,
    label: "BUNDLE DETECTED",
    name: "$MOON",
    msg: "23-wallet coordinated buy",
  },
  {
    color: colors.accent.aiLight,
    label: "ZOMBIE TOKEN",
    name: "$WIF2",
    msg: "Resurrected from rugged $WIF",
  },
] as const;

function AlertsPreview() {
  const { colors: tc } = useTheme();
  return (
    <View style={{ gap: 8, width: "100%" }}>
      {FAKE_ALERTS.map((a, i) => (
        <Animated.View
          key={a.name}
          entering={FadeInDown.delay(i * 130 + 200).springify()}
          style={[basePrev.alertRow, { backgroundColor: tc.glass.bgElevated, borderColor: tc.glass.border }]}
        >
          <View style={[basePrev.alertDot, { backgroundColor: a.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={[basePrev.alertType, { color: a.color }]}>{a.label}</Text>
            <Text style={[basePrev.alertMsg, { color: tc.text.muted }]} numberOfLines={1}>
              {a.msg}
            </Text>
          </View>
          <Text style={[basePrev.alertToken, { color: tc.text.secondary }]}>{a.name}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

// ── AIPreview: chat bubbles with typing dots → response (Slide 3)
function AIPreview() {
  const { colors: tc } = useTheme();
  const [showReply, setShowReply] = useState(false);
  const dotOpacity = useSharedValue(0.4);
  useEffect(() => {
    const t = setTimeout(() => setShowReply(true), 1800);
    dotOpacity.value = withDelay(200, withSpring(1, { mass: 0.5, damping: 8 }));
    return () => clearTimeout(t);
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));
  return (
    <Animated.View entering={FadeIn.delay(200)} style={basePrev.chatBox}>
      <Animated.View
        entering={FadeInDown.delay(100)}
        style={[basePrev.bubble, basePrev.bubbleUser, { backgroundColor: tc.accent.ai }]}
      >
        <Text style={[basePrev.bubbleUserText, { color: tc.background.deep }]}>Is this token safe to buy?</Text>
      </Animated.View>
      <View style={basePrev.bubbleAIRow}>
        <View style={[basePrev.aiChip, { backgroundColor: `${tc.accent.ai}22`, borderColor: tc.accent.ai }]}>
          <Text style={[basePrev.aiChipText, { color: tc.accent.ai }]}>AI</Text>
        </View>
        <Animated.View
          entering={FadeInDown.delay(350)}
          style={[basePrev.bubble, basePrev.bubbleAI, { backgroundColor: tc.glass.bgElevated, borderColor: tc.glass.border }]}
        >
          {showReply ? (
            <Animated.Text entering={FadeIn} style={[basePrev.bubbleAIText, { color: tc.text.primary }]}>
              {"⚠️ High risk.\n3rd-gen clone of $WIF.\nSame deployer: 14 prior rugs."}
            </Animated.Text>
          ) : (
            <Animated.View style={[basePrev.dotsRow, dotStyle]}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[basePrev.dot, { backgroundColor: tc.accent.ai }]} />
              ))}
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ── Slide definitions
type SlideData = {
  id: string;
  title: string;
  description: string;
  Preview: React.ComponentType;
};

const SLIDES: SlideData[] = [
  {
    id: "1",
    title: "Detect Rug Pulls",
    description:
      "AI forensics scan token lineage, deployer history, and wallet clusters in real time — before you get rugged.",
    Preview: RiskPreview,
  },
  {
    id: "2",
    title: "Real-Time Alerts",
    description:
      "Live WebSocket alerts fire the instant a watched token shows red flags: insider sells, bundle patterns, zombie resurrection.",
    Preview: AlertsPreview,
  },
  {
    id: "3",
    title: "Chat With the AI",
    description:
      "Ask the AI analyst anything about any token. Get instant forensic breakdown streaming right to you. Pro feature.",
    Preview: AIPreview,
  },
];

function DotIndicator({ count, index }: { count: number; index: number }) {
  const { colors: tc } = useTheme();
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) =>
        i === index ? (
          <LinearGradient
            key={i}
            colors={["#622EC3", "#53E9F6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.dot, styles.dotActive]}
          />
        ) : (
          <View key={i} style={[styles.dot, styles.dotInactive, { backgroundColor: tc.glass.borderBright }]} />
        )
      )}
    </View>
  );
}

function SlideItem({ item }: { item: SlideData }) {
  const { colors } = useTheme();
  return (
    <View style={styles.slide}>
      <View style={styles.previewBox}>
        <item.Preview />
      </View>
      <Text style={[styles.title, { color: colors.text.primary }]}>{item.title}</Text>
      <Text style={[styles.description, { color: colors.text.secondary }]}>{item.description}</Text>
    </View>
  );
}

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<SlideData>>(null);
  const isLast = currentIndex === SLIDES.length - 1;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    router.replace("/auth");
  };

  const handleNext = () => {
    if (isLast) {
      finish();
    } else {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.deep }]}>
      <View style={styles.brandHeader}>
        <Text style={[styles.brandLogo, { color: colors.accent.cyan }]}>Lineage</Text>
        <View style={[styles.brandDot, { backgroundColor: colors.accent.ai }]} />
        <Text style={[styles.brandSub, { color: colors.text.secondary }]}>Agent</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={({ item }) => <SlideItem item={item} />}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
      />

      <View style={styles.footer}>
        <DotIndicator count={SLIDES.length} index={currentIndex} />

        <HapticButton
          label={isLast ? "Get Started" : "Next"}
          onPress={handleNext}
          style={styles.btn}
        />

        {!isLast && (
          <HapticButton
            label="Skip"
            onPress={finish}
            variant="ghost"
            style={styles.skipBtn}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 56,
    paddingBottom: 8,
    gap: 6,
  },
  brandLogo: { fontFamily: Fonts.bold, fontSize: 20, letterSpacing: 1 },
  brandDot: { width: 6, height: 6, borderRadius: 3 },
  brandSub: { fontFamily: Fonts.bold, fontSize: 20, letterSpacing: 1 },
  slide: {
    width,
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  previewBox: {
    width: "100%",
    marginTop: 12,
    marginBottom: 28,
    alignItems: "center",
    minHeight: 160,
    justifyContent: "center",
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 26,
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 23,
    paddingHorizontal: 8,
  },
  footer: {
    paddingBottom: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 12,
  },
  dotsRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  dotInactive: { width: 8 },
  btn: { width: "100%" },
  skipBtn: { width: "100%" },
});

const basePrev = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  criticalBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  criticalText: {
    fontSize: 10,
    fontWeight: "800",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardSub: {
    fontSize: 12,
  },
  cardValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  alertType: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  alertMsg: {
    fontSize: 11,
    marginTop: 2,
  },
  alertToken: {
    fontSize: 12,
    fontWeight: "700",
  },
  chatBox: {
    width: "100%",
    gap: 10,
  },
  bubbleAIRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  aiChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  aiChipText: {
    fontSize: 8,
    fontWeight: "800",
  },
  bubble: {
    borderRadius: 14,
    padding: 10,
    maxWidth: "80%",
    flexShrink: 1,
  },
  bubbleUser: {
    alignSelf: "flex-end",
  },
  bubbleAI: {
    flex: 1,
    borderWidth: 1,
  },
  bubbleUserText: {
    fontSize: 13,
  },
  bubbleAIText: {
    fontSize: 13,
    lineHeight: 20,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
