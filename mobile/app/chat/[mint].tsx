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

// ─────────────────────────────────────────────────────────────
// Markdown renderer (lightweight — no extra deps)
// ─────────────────────────────────────────────────────────────
type InlineToken =
  | { kind: "text"; content: string }
  | { kind: "bold"; content: string }
  | { kind: "italic"; content: string }
  | { kind: "code"; content: string };

function parseInline(raw: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Combined pattern: **bold**, *italic*, `code`
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) tokens.push({ kind: "text", content: raw.slice(last, m.index) });
    if (m[2] !== undefined) tokens.push({ kind: "bold", content: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: "italic", content: m[3] });
    else if (m[4] !== undefined) tokens.push({ kind: "code", content: m[4] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) tokens.push({ kind: "text", content: raw.slice(last) });
  return tokens;
}

function InlineParts({ raw, baseStyle }: { raw: string; baseStyle: object }) {
  const tokens = parseInline(raw);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === "bold")
          return <Text key={i} style={[baseStyle, { fontWeight: "800" }]}>{t.content}</Text>;
        if (t.kind === "italic")
          return <Text key={i} style={[baseStyle, { fontStyle: "italic" }]}>{t.content}</Text>;
        if (t.kind === "code")
          return (
            <Text key={i} style={[baseStyle, mdStyles.inlineCode]}>{t.content}</Text>
          );
        return <Text key={i} style={baseStyle}>{t.content}</Text>;
      })}
    </>
  );
}

function MarkdownText({ text, textStyle }: { text: string; textStyle: object }) {
  const lines = text.split("\n");
  return (
    <View style={{ gap: 4 }}>
      {lines.map((line, i) => {
        // Heading
        const h3 = line.match(/^###\s+(.*)/);
        const h2 = line.match(/^##\s+(.*)/);
        const h1 = line.match(/^#\s+(.*)/);
        if (h1 || h2 || h3) {
          const level = h1 ? 1 : h2 ? 2 : 3;
          const content = (h1 ?? h2 ?? h3)![1];
          const fontSize = level === 1 ? 18 : level === 2 ? 16 : 14;
          return (
            <Text key={i} style={[textStyle, { fontWeight: "800", fontSize, marginTop: 6 }]}>
              <InlineParts raw={content} baseStyle={[textStyle, { fontWeight: "800", fontSize }]} />
            </Text>
          );
        }
        // Bullet list
        const bullet = line.match(/^[-*]\s+(.*)/);
        if (bullet) {
          return (
            <View key={i} style={mdStyles.bulletRow}>
              <Text style={[textStyle, mdStyles.bulletDot]}>•</Text>
              <Text style={[textStyle, { flex: 1 }]}>
                <InlineParts raw={bullet[1]} baseStyle={textStyle} />
              </Text>
            </View>
          );
        }
        // Blockquote
        const quote = line.match(/^>\s+(.*)/);
        if (quote) {
          return (
            <View key={i} style={mdStyles.quoteBar}>
              <Text style={[textStyle, mdStyles.quoteText]}>
                <InlineParts raw={quote[1]} baseStyle={[textStyle, mdStyles.quoteText]} />
              </Text>
            </View>
          );
        }
        // Blank line
        if (line.trim() === "") return <View key={i} style={{ height: 4 }} />;
        // Normal paragraph
        return (
          <Text key={i} style={textStyle}>
            <InlineParts raw={line} baseStyle={textStyle} />
          </Text>
        );
      })}
    </View>
  );
}

const mdStyles = StyleSheet.create({
  inlineCode: {
    fontFamily: "monospace",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 12,
  },
  bulletRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  bulletDot: { marginTop: 2, minWidth: 12 },
  quoteBar: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.ai,
    paddingLeft: 8,
    paddingVertical: 2,
  },
  quoteText: { color: colors.text.secondary, fontStyle: "italic" },
});

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
        ) : isUser ? (
          <Text style={styles.bubbleUserText}>
            {msg.text}
          </Text>
        ) : (
          <MarkdownText text={msg.text} textStyle={styles.bubbleAIText} />
        )}
        {msg.streaming && msg.text !== "" && (
          <Text style={{ color: colors.accent.ai }}>▌</Text>
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
        const url = getChatStreamUrl(mint!);
        abortRef.current = new AbortController();

        // Build conversation history from completed messages (last 8 turns)
        const history = messages
          .filter((m) => !m.streaming)
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.text }));

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history }),
          signal: abortRef.current.signal as any,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => `HTTP ${response.status}`);
          throw new Error(errText);
        }

        // Shared SSE parser — works for both streaming and buffered (non-streaming) responses.
        // Returns true when the "done" sentinel is encountered.
        let accumulated = "";
        let currentEvent = "";
        const processLines = (rawChunk: string): boolean => {
          for (const line of rawChunk.split("\n")) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (currentEvent === "done" || data === "[DONE]") return true;
              if (currentEvent === "error") {
                try {
                  const errParsed = JSON.parse(data);
                  throw new Error(errParsed?.detail ?? "Stream error");
                } catch (e) {
                  throw e instanceof Error ? e : new Error("Stream error");
                }
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed?.text ?? "";
                if (delta) {
                  accumulated += delta;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, text: accumulated } : m
                    )
                  );
                }
              } catch {
                if (data && data !== "{}") {
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
          return false;
        };

        if (!response.body) {
          // Fallback for React Native environments where response.body is null
          // even for successful streaming responses — read everything at once.
          const rawText = await response.text();
          processLines(rawText);
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let streamDone = false;
          while (!streamDone) {
            const { done, value } = await reader.read();
            if (done) break;
            streamDone = processLines(decoder.decode(value, { stream: true }));
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

  // ── Auth gate (Pro no longer required — all authenticated users can use AI analysis)
  if (!isAuthenticated) {
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
