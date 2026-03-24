import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Send } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { investigateChatStream } from '../../lib/investigate-streaming';
import { useInvestigateStore } from '../../store/investigate';
import { useAuthStore } from '../../store/auth';
import { tokens } from '../../theme/tokens';

// ─── Pulsing dot (chat indicator) ───────────────────────────────────────────

function PulsingDot({ color = tokens.secondary, size = 8 }: { color?: string; size?: number }) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, animStyle]}
    />
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export function ChatPanel({ mint }: { mint: string }) {
  const apiKey = useAuthStore((s) => s.apiKey);
  const messages = useInvestigateStore((s) => s.chatMessages);
  const busy = useInvestigateStore((s) => s.chatBusy);
  const { addChatMessage, setChatBusy } = useInvestigateStore.getState();

  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;

    addChatMessage({ role: 'user', content: text });
    setInput('');
    setChatBusy(true);

    let assistantContent = '';
    addChatMessage({ role: 'assistant', content: '' });

    cancelRef.current = investigateChatStream(
      mint,
      apiKey ?? '',
      text,
      messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-8),
      (token) => {
        assistantContent += token;
        const currentMsgs = useInvestigateStore.getState().chatMessages;
        const updated = [...currentMsgs];
        updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
        useInvestigateStore.setState({ chatMessages: updated });
      },
      () => {
        setChatBusy(false);
      },
      (err) => {
        setChatBusy(false);
        addChatMessage({ role: 'assistant', content: `Error: ${err.message}` });
      },
    );
  }, [input, busy, mint, apiKey, messages]);

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.chatCollapsed}
        onPress={() => setExpanded(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open follow-up chat"
      >
        <PulsingDot color={tokens.secondary} size={8} />
        <Send size={14} color={tokens.secondary} />
        <Text style={styles.chatCollapsedText}>Ask a follow-up question</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.chatPanel}>
      <TouchableOpacity
        style={styles.chatHandle}
        onPress={() => setExpanded(false)}
        accessibilityRole="button"
        accessibilityLabel="Collapse chat"
      >
        <View style={styles.chatHandleBar} />
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(_, i) => `msg-${i}`}
        style={styles.chatList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.chatBubble, item.role === 'user' ? styles.chatUser : styles.chatAssistant]}>
            <Text style={[styles.chatText, item.role === 'user' && styles.chatTextUser]}>
              {item.content || (busy ? '...' : '')}
            </Text>
          </View>
        )}
      />

      <View style={styles.chatInputRow}>
        <TextInput
          style={styles.chatInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about this token..."
          placeholderTextColor={tokens.textPlaceholder}
          maxLength={600}
          editable={!busy}
          onSubmitEditing={sendMessage}
          returnKeyType="send"
          accessibilityLabel="Chat message input"
        />
        <TouchableOpacity
          style={[styles.chatSendBtn, (!input.trim() || busy) && styles.chatSendDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !input.trim() || busy }}
        >
          <Send size={18} color={input.trim() && !busy ? tokens.white100 : tokens.textTertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  chatCollapsed: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14,
    borderTopWidth: 2, borderTopColor: tokens.secondary + '40',
  },
  chatCollapsedText: {
    fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.secondary,
  },
  chatPanel: {
    maxHeight: 420,
    borderTopWidth: 2, borderTopColor: tokens.secondary + '40',
  },
  chatHandle: { alignItems: 'center', paddingVertical: 8 },
  chatHandleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: tokens.white35,
  },
  chatList: { paddingHorizontal: tokens.spacing.screenPadding },
  chatBubble: {
    maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, marginBottom: 6,
  },
  chatUser: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.secondary + '30',
  },
  chatAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
  },
  chatText: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.small,
    color: tokens.white80, lineHeight: 20,
  },
  chatTextUser: { color: tokens.white100 },
  chatInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 8,
  },
  chatInput: {
    flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.body,
    color: tokens.white100, backgroundColor: tokens.bgGlass8 ?? 'rgba(255,255,255,0.08)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
  },
  chatSendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.secondary, alignItems: 'center', justifyContent: 'center',
  },
  chatSendDisabled: { opacity: 0.4 },
});
