// app/onboarding.tsx
// First-launch onboarding — 3 slides. Sets AsyncStorage flag on completion.

import React, { useRef, useState } from "react";
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
import { colors } from "@/src/theme/colors";
import { Fonts } from "@/src/theme/fonts";
import { HapticButton } from "@/src/components/ui/HapticButton";

const { width } = Dimensions.get("window");

export const ONBOARDING_KEY = "onboarding_done";

const SLIDES = [
  {
    id: "1",
    emoji: "🔍",
    title: "Detect Rug Pulls",
    description:
      "Lineage AI scans token lineage and on-chain forensics in real time — before you get rugged.",
  },
  {
    id: "2",
    emoji: "📊",
    title: "Track What Matters",
    description:
      "Watchlist your tokens, set risk alerts, and get notified the moment something suspicious happens.",
  },
  {
    id: "3",
    emoji: "🤖",
    title: "Ask the AI Analyst",
    description:
      "Chat with our AI analyst to unpack any token's history, wallet clusters, and red flags instantly.",
  },
];

type Slide = (typeof SLIDES)[number];

function DotIndicator({
  count,
  index,
}: {
  count: number;
  index: number;
}) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === index ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

function SlideItem({ item }: { item: Slide }) {
  return (
    <View style={styles.slide}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );
}

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);
  const isLast = currentIndex === SLIDES.length - 1;

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const handleNext = () => {
    if (isLast) {
      finish();
    } else {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  };

  const finish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
    router.replace("/auth");
  };

  return (
    <View style={styles.container}>
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
  slide: {
    width,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 32,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 28,
    color: colors.text.primary,
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontFamily: Fonts.regular,
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: "center",
    lineHeight: 24,
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
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: colors.accent.blue,
    width: 24,
  },
  dotInactive: {
    backgroundColor: colors.text.muted,
  },
  btn: {
    width: "100%",
  },
  skipBtn: {
    width: "100%",
  },
});
