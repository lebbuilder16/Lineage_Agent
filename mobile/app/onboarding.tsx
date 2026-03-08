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
import { colors } from "@/src/theme/colors";
import { Fonts } from "@/src/theme/fonts";
import { HapticButton } from "@/src/components/ui/HapticButton";

const { width } = Dimensions.get("window");
export const ONBOARDING_KEY = "onboarding_done";

// ── RiskPreview: animated risk bar to 87% (Slide 1)
function RiskPreview() {
  const barWidth = useSharedValue(0);
  useEffect(() => {
    barWidth.value = withDelay(400, withSpring(87, { mass: 1, damping: 14 }));
  }, []);
  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value}%` as unknown as number,
  }));
  return (
    <Animated.View entering={FadeInDown.delay(200).springify()} style={preview.card}>
      <View style={preview.cardHeader}>
        <View style={[preview.statusDot, { backgroundColor: colors.accent.danger }]} />
        <Text style={preview.cardTitle}>$PEPE2 — Clone detected</Text>
        <View style={preview.criticalBadge}>
          <Text style={preview.criticalText}>CRITICAL</Text>
        </View>
      </View>
      <View style={preview.barTrack}>
        <Animated.View
          style={[preview.barFill, barStyle, { backgroundColor: colors.accent.danger }]}
        />
      </View>
      <View style={preview.cardRow}>
        <Text style={preview.cardSub}>Risk score</Text>
        <Text style={[preview.cardValue, { color: colors.accent.danger }]}>87 / 100</Text>
      </View>
      <View style={preview.cardRow}>
        <Text style={preview.cardSub}>Deployer history</Text>
        <Text style={[preview.cardValue, { color: colors.accent.warning }]}>14 rug pulls</Text>
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
    color: "#C084FC",
    label: "ZOMBIE TOKEN",
    name: "$WIF2",
    msg: "Resurrected from rugged $WIF",
  },
] as const;

function AlertsPreview() {
  return (
    <View style={{ gap: 8, width: "100%" }}>
      {FAKE_ALERTS.map((a, i) => (
        <Animated.View
          key={a.name}
          entering={FadeInDown.delay(i * 130 + 200).springify()}
          style={preview.alertRow}
        >
          <View style={[preview.alertDot, { backgroundColor: a.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={[preview.alertType, { color: a.color }]}>{a.label}</Text>
            <Text style={preview.alertMsg} numberOfLines={1}>
              {a.msg}
            </Text>
          </View>
          <Text style={preview.alertToken}>{a.name}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

// ── AIPreview: chat bubbles with typing dots → response (Slide 3)
function AIPreview() {
  const [showReply, setShowReply] = useState(false);
  const dotOpacity = useSharedValue(0.4);
  useEffect(() => {
    const t = setTimeout(() => setShowReply(true), 1800);
    dotOpacity.value = withDelay(200, withSpring(1, { mass: 0.5, damping: 8 }));
    return () => clearTimeout(t);
  }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));
  return (
    <Animated.View entering={FadeIn.delay(200)} style={preview.chatBox}>
      <Animated.View
        entering={FadeInDown.delay(100)}
        style={[preview.bubble, preview.bubbleUser]}
      >
        <Text style={preview.bubbleUserText}>Is this token safe to buy?</Text>
      </Animated.View>
      <View style={preview.bubbleAIRow}>
        <View style={preview.aiChip}>
          <Text style={preview.aiChipText}>AI</Text>
        </View>
        <Animated.View
          entering={FadeInDown.delay(350)}
          style={[preview.bubble, preview.bubbleAI]}
        >
          {showReply ? (
            <Animated.Text entering={FadeIn} style={preview.bubbleAIText}>
              {"⚠️ High risk.\n3rd-gen clone of $WIF.\nSame deployer: 14 prior rugs."}
            </Animated.Text>
          ) : (
            <Animated.View style={[preview.dotsRow, dotStyle]}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={preview.dot} />
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
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

function SlideItem({ item }: { item: SlideData }) {
  return (
    <View style={styles.slide}>
      <View style={styles.previewBox}>
        <item.Preview />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );
}

export default function OnboardingScreen() {
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
    <View style={styles.container}>
      <View style={styles.brandHeader}>
        <Text style={styles.brandLogo}>Lineage</Text>
        <View style={styles.brandDot} />
        <Text style={styles.brandSub}>Agent</Text>
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
  container: {
    flex: 1,
    backgroundColor: colors.background.deep,
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 56,
    paddingBottom: 8,
    gap: 6,
  },
  brandLogo: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: colors.accent.safe,
    letterSpacing: 1,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.ai,
  },
  brandSub: {
    fontFamily: Fonts.bold,
    fontSize: 20,
    color: colors.text.secondary,
    letterSpacing: 1,
  },
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
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    color: colors.text.secondary,
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
  dotsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: colors.accent.blue,
    width: 24,
  },
  dotInactive: {
    backgroundColor: colors.text.muted,
    width: 8,
  },
  btn: {
    width: "100%",
  },
  skipBtn: {
    width: "100%",
  },
});

const preview = StyleSheet.create({
  card: {
    width: "100%",
    backgroundColor: colors.glass.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.glass.border,
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
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  criticalBadge: {
    backgroundColor: `${colors.accent.danger}22`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  criticalText: {
    color: colors.accent.danger,
    fontSize: 10,
    fontWeight: "800",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.glass.bg,
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
    color: colors.text.muted,
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
    backgroundColor: colors.glass.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glass.border,
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
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 2,
  },
  alertToken: {
    color: colors.text.secondary,
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
    backgroundColor: `${colors.accent.ai}22`,
    borderWidth: 1,
    borderColor: colors.accent.ai,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  aiChipText: {
    color: colors.accent.ai,
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
    backgroundColor: colors.accent.ai,
  },
  bubbleAI: {
    flex: 1,
    backgroundColor: colors.glass.bgElevated,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  bubbleUserText: {
    color: colors.background.deep,
    fontSize: 13,
  },
  bubbleAIText: {
    color: colors.text.primary,
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
    backgroundColor: colors.accent.ai,
  },
});
