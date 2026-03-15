import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { ChevronLeft, Send, Bot } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { chatStream } from '../../src/lib/api';
import { tokens } from '../../src/theme/tokens';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Ask me anything about this token — its deployer history, bundle activity, risk factors, or on-chain behaviour.',
};

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { mint } = useLocalSearchParams<{ mint: string }>();
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Cancel any in-flight stream on unmount
  useEffect(() => () => { cancelRef.current?.(); }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    setInput('');

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    // Build history from current messages (before new user message)
    const history = messages
      .filter((m) => m.id !== 'welcome' && !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setBusy(true);

    try {
      const cancel = await chatStream(
        mint,
        text,
        history,
        (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m,
            ),
          );
        },
        () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m,
            ),
          );
          setBusy(false);
          cancelRef.current = null;
        },
        () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || 'An error occurred. Please try again.', streaming: false }
                : m,
            ),
          );
          setBusy(false);
          cancelRef.current = null;
        },
      );
      cancelRef.current = cancel;
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Connection error. Please try again.', streaming: false }
            : m,
        ),
      );
      setBusy(false);
    }
  }, [input, busy, messages, mint]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      const isUser = item.role === 'user';
      return (
        <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
          {!isUser && (
            <View style={styles.avatarWrap}>
              <Bot size={14} color={tokens.secondary} />
            </View>
          )}
          <View
            style={[
              styles.bubble,
              isUser ? styles.bubbleUser : styles.bubbleAssistant,
            ]}
          >
            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
              {item.content}
              {item.streaming && item.content.length > 0 && (
                <Text style={styles.cursor}> ▋</Text>
              )}
            </Text>
            {item.streaming && item.content.length === 0 && (
              <ActivityIndicator
                size="small"
                color={tokens.secondary}
                style={{ marginVertical: 2 }}
              />
            )}
          </View>
        </View>
      );
    },
    [],
  );

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.safe}>
        {/* Navbar */}
        <View style={styles.navbar}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft size={24} color={tokens.white100} />
          </TouchableOpacity>
          <View style={styles.navCenter}>
            <Bot size={15} color={tokens.secondary} />
            <Text style={styles.navTitle}>AI CHAT</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Message list */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask about this token…"
              placeholderTextColor={tokens.white35}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              multiline
              maxLength={600}
              editable={!busy}
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!input.trim() || busy}
              style={[
                styles.sendBtn,
                (!input.trim() || busy) && styles.sendBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Send size={18} color={tokens.bgMain} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  safe: { flex: 1 },
  kav: { flex: 1 },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 12,
  },
  navCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.small,
    color: tokens.white60,
    letterSpacing: 1.5,
  },

  listContent: {
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 12,
    gap: 12,
  },

  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },

  avatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${tokens.secondary}18`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}35`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  bubble: {
    maxWidth: '80%',
    borderRadius: tokens.radius.md,
    padding: 12,
    borderWidth: 1,
  },
  bubbleUser: {
    backgroundColor: `${tokens.secondary}18`,
    borderColor: `${tokens.secondary}40`,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: tokens.bgGlass8,
    borderColor: tokens.borderSubtle,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white80,
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: tokens.white100,
  },
  cursor: {
    color: tokens.secondary,
    fontFamily: 'Lexend-Regular',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingVertical: 12,
    paddingBottom: 20,
    backgroundColor: tokens.bgGlass8,
    borderTopWidth: 1,
    borderTopColor: tokens.borderSubtle,
  },
  input: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
    backgroundColor: tokens.bgGlass12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: tokens.white20,
  },
});
