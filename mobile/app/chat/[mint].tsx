// app/chat/[mint].tsx
// AI Chat avec streaming SSE — Perplexity-style, accès premium uniquement

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  useAnimatedStyle,
  FadeIn,
  FadeInDown,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "@/src/store/auth";
import { getChatStreamUrl } from "@/src/lib/api";
import { colors } from "@/src/theme/colors";
import { HapticButton } from "@/src/components/ui/HapticButton";
import { GlassCard } from "@/src/components/ui/GlassCard";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

// Suggestions rapides
const QUICK_PROMPTS = [
  "Is this token a rug?",
  "Who deployed this token?",
  "Show me the money flow",
  "Is there bundle activity?",
  "What's the risk level?",
];

// ─────────────────────────────────────────────────────────────
// Typing indicator
// ─────────────────────────────────────────────────────────────
function TypingDots() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    const anim = (v: typeof dot1, delay: number) => {
      v.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 350 }),
          withTiming(0.3, { duration: 350 })
        ),
        -1,
        false
      );
    };
    anim(dot1, 0);
    setTimeout(() => anim(dot2, 150), 130);
    setTimeout(() => anim(dot3, 260), 260);
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={styles.dots}>
      <Animated.View style={[styles.dot, s1]} />
      <Animated.View style={[styles.dot, s2]} />
      <Animated.View style={[styles.dot, s3]} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      style={[styles.bubbleWrap, isUser ? styles.bubbleRight : styles.bubbleLeft]}
    >
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarText}>AI</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
        {msg.streaming && msg.text === "" ? (
          <TypingDots />
        ) : (
          <Text style={isUser ? styles.bubbleUserText : styles.bubbleAIText}>
            {msg.text}
            {msg.streaming && <Text style={{ color: colors.accent.ai }}>▌</Text>}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// Premium Gate overlay
// ─────────────────────────────────────────────────────────────
function PremiumGate() {
  return (
    <View style={styles.gateWrap}>
      <GlassCard elevated style={styles.gateCard}>
        <Text style={styles.gateEmoji}>🔒</Text>
        <Text style={styles.gateTitle}>AI Chat is Pro-only</Text>
        <Text style={styles.gateDesc}>
          Get unlimited AI forensic analysis, streaming answers,
          and voice mode with a Pro subscription.
        </Text>
        <HapticButton
          label="Upgrade to Pro"
          onPress={() => router.push("/paywall")}
          variant="primary"
          style={{ marginTop: 16 }}
        />
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.gateBack}>Go back</Text>
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────
export default function ChatScreen() {
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const { isPro, isAuthenticated } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abbreviate = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  // ── Scroll to bottom on new messages
  useEffect(() => {
    const timeout = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timeout);
  }, [messages]);

  // ── Send message via SSE
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const userMsg: Message = { id: Date.now().toString(), role: "user", text };
      const assistantId = (Date.now() + 1).toString();
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        text: "",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setIsStreaming(true);

      try {
        const url = getChatStreamUrl(mint!, text);
        abortRef.current = new AbortController();

        const response = await fetch(url, {
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) throw new Error("Stream failed");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // SSE format: "data: <text>\n\n"
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);
                const delta = parsed?.choices?.[0]?.delta?.content ?? parsed?.text ?? data;
                accumulated += delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, text: accumulated } : m
                  )
                );
              } catch {
                // raw text chunk
                accumulated += data;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, text: accumulated } : m
                  )
                );
              }
            }
          }
        }

        // Mark done
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m
          )
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, text: "An error occurred. Please try again.", streaming: false }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [mint, isStreaming]
  );

  const stopStreaming = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  // ── Premium gate
  if (!isAuthenticated || !isPro) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen
          options={{
            title: "AI Analysis",
            headerStyle: { backgroundColor: colors.background.deep },
            headerTintColor: colors.text.primary,
          }}
        />
        <PremiumGate />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: `AI — ${abbreviate(mint ?? "")}`,
          headerStyle: { backgroundColor: colors.background.deep },
          headerTintColor: colors.text.primary,
          headerRight: () =>
            isStreaming ? (
              <TouchableOpacity onPress={stopStreaming} style={{ marginRight: 8 }}>
                <Text style={{ color: colors.accent.danger, fontWeight: "600" }}>Stop</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.feed}
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 && (
            <Animated.View entering={FadeIn.delay(100)} style={styles.emptyWrap}>
              <View style={styles.aiOrbLarge}>
                <Text style={styles.aiOrbText}>AI</Text>
              </View>
              <Text style={styles.emptyTitle}>Forensic AI ready</Text>
              <Text style={styles.emptySubtitle}>
                Ask me anything about this token's activity, risk, or origins.
              </Text>
            </Animated.View>
          )}

          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
        </ScrollView>

        {/* Quick prompts */}
        {messages.length === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPrompts}
          >
            {QUICK_PROMPTS.map((p) => (
              <TouchableOpacity
                key={p}
                style={styles.quickPill}
                onPress={() => sendMessage(p)}
              >
                <Text style={styles.quickPillText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input bar */}
        <GlassCard style={styles.inputBar} noBorder>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about this token…"
            placeholderTextColor={colors.text.muted}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(input)}
            editable={!isStreaming}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, isStreaming && styles.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={isStreaming || !input.trim()}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color={colors.background.deep} />
            ) : (
              <Text style={styles.sendIcon}>↑</Text>
            )}
          </TouchableOpacity>
        </GlassCard>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.deep },
  feed: { flex: 1 },
  feedContent: { padding: 16, gap: 12, paddingBottom: 8 },

  // Empty state
  emptyWrap: { alignItems: "center", paddingTop: 48, gap: 12 },
  aiOrbLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${colors.accent.ai}33`,
    borderWidth: 2,
    borderColor: colors.accent.ai,
    alignItems: "center",
    justifyContent: "center",
  },
  aiOrbText: { color: colors.accent.ai, fontSize: 22, fontWeight: "800" },
  emptyTitle: { color: colors.text.primary, fontSize: 20, fontWeight: "700" },
  emptySubtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },

  // Bubbles
  bubbleWrap: { flexDirection: "row", gap: 8, maxWidth: "85%" },
  bubbleLeft: { alignSelf: "flex-start" },
  bubbleRight: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  bubble: { borderRadius: 16, padding: 12, maxWidth: "100%", flexShrink: 1 },
  bubbleUser: {
    backgroundColor: colors.accent.ai,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: colors.glass.bgElevated,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUserText: { color: colors.background.deep, fontSize: 14, lineHeight: 20 },
  bubbleAIText: { color: colors.text.primary, fontSize: 14, lineHeight: 22 },

  // AI avatar
  aiAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: `${colors.accent.ai}22`,
    borderWidth: 1,
    borderColor: colors.accent.ai,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    flexShrink: 0,
  },
  aiAvatarText: { color: colors.accent.ai, fontSize: 9, fontWeight: "800" },

  // Typing dots
  dots: { flexDirection: "row", gap: 4, padding: 4 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.ai,
  },

  // Quick prompts
  quickPrompts: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  quickPill: {
    backgroundColor: colors.glass.bg,
    borderWidth: 1,
    borderColor: colors.glass.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickPillText: { color: colors.text.secondary, fontSize: 12 },

  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    margin: 12,
    padding: 8,
    borderRadius: 24,
    gap: 8,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent.ai,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendIcon: { color: colors.background.deep, fontSize: 20, fontWeight: "800" },

  // Premium gate
  gateWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  gateCard: { padding: 28, alignItems: "center", gap: 12 },
  gateEmoji: { fontSize: 48 },
  gateTitle: { color: colors.text.primary, fontSize: 22, fontWeight: "800" },
  gateDesc: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  gateBack: { color: colors.text.muted, fontSize: 14 },
});
