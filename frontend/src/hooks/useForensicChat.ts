"use client";

import { useState, useCallback, useRef } from "react";
import { streamForensicChat, type ChatMessage } from "@/lib/api";

export interface ForensicChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  send: (message: string) => void;
  reset: () => void;
}

const MAX_HISTORY = 20; // keep last 20 messages (~10 turns)

export function useForensicChat(mint: string): ForensicChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    (userMessage: string) => {
      if (!userMessage.trim() || isStreaming) return;

      // Cancel any ongoing stream
      abortRef.current?.abort();

      const userMsg: ChatMessage = { role: "user", content: userMessage.trim() };

      // Optimistically add user message
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);
      setError(null);

      // Prepare history (all previous messages + new user message)
      setMessages((prev) => {
        const history = prev.slice(0, -1).slice(-MAX_HISTORY); // exclude the just-added user msg
        let assistantText = "";
        const assistantPlaceholder: ChatMessage = { role: "assistant", content: "" };

        abortRef.current = streamForensicChat(
          mint,
          userMessage.trim(),
          history,
          // onToken
          (chunk) => {
            assistantText += chunk;
            setMessages((m) => {
              const updated = [...m];
              updated[updated.length - 1] = { role: "assistant", content: assistantText };
              return updated;
            });
          },
          // onDone
          () => {
            setIsStreaming(false);
          },
          // onError
          (detail) => {
            setError(detail);
            setIsStreaming(false);
            setMessages((m) => {
              // Remove the empty assistant placeholder on error
              if (m.at(-1)?.role === "assistant" && !m.at(-1)?.content) {
                return m.slice(0, -1);
              }
              return m;
            });
          },
        );

        return [...prev, assistantPlaceholder];
      });
    },
    [mint, isStreaming],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIsStreaming(false);
    setError(null);
  }, []);

  return { messages, isStreaming, error, send, reset };
}
