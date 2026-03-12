"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, RotateCcw, X, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useForensicChat } from "@/hooks/useForensicChat";

interface Props {
  mint: string;
  tokenName?: string;
}

const SUGGESTIONS = [
  "What are the biggest red flags?",
  "Is this a copy of a previous rug?",
  "Who controls the liquidity?",
  "What does the bundle activity indicate?",
  "Summarise the SOL flow extraction.",
];

export function ChatPanel({ mint, tokenName }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const { messages, isStreaming, error, send, reset } = useForensicChat(mint);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    send(input.trim());
    setInput("");
  }

  function handleSuggestion(text: string) {
    if (isStreaming) return;
    send(text);
  }

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3",
          "bg-card border border-white/10 shadow-xl",
          "hover:border-[#622EC3]/40 hover:shadow-[0_0_20px_rgba(98,46,195,0.15)]",
          "transition-all duration-200 font-medium text-sm",
          open ? "border-[#622EC3]/40 text-[#B370F0]" : "text-foreground",
        )}
        aria-label={open ? "Close chat" : "Open forensic chat"}
      >
        {open ? (
          <X className="h-4 w-4" />
        ) : (
          <>
            <MessageCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Ask AI</span>
            {messages.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#622EC3] text-white text-[10px] font-bold">
                {messages.filter((m) => m.role === "assistant").length}
              </span>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-20 right-6 z-50 flex flex-col",
            "w-[min(420px,_calc(100vw-3rem))]",
            "h-[min(580px,_calc(100vh-8rem))]",
            "bg-card border border-white/10 rounded-2xl shadow-2xl",
            "shadow-[0_0_40px_rgba(0,0,0,0.6)]",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#53E9F6]" />
              <span className="font-display font-bold text-sm">
                Forensic Chat{tokenName ? ` — ${tokenName}` : ""}
              </span>
            </div>
            <button
              onClick={reset}
              title="Clear conversation"
              className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {!hasMessages && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ask me anything about this token&apos;s on-chain behaviour. I have access
                  to the forensic analysis already computed.
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className={cn(
                        "w-full text-left text-xs px-3 py-2 rounded-lg",
                        "bg-white/5 hover:bg-[#622EC3]/10 hover:text-[#B370F0]",
                        "border border-white/5 hover:border-[#622EC3]/20",
                        "transition-colors truncate",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 items-start",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row",
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px]",
                    msg.role === "user"
                      ? "bg-[#622EC3]/20 text-[#B370F0] border border-[#622EC3]/30"
                      : "bg-white/10 text-muted-foreground border border-white/10",
                  )}
                >
                  {msg.role === "user" ? (
                    <User className="h-3 w-3" />
                  ) : (
                    <Bot className="h-3 w-3" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                    msg.role === "user"
                      ? "bg-[#622EC3]/15 text-foreground rounded-tr-sm"
                      : "bg-white/5 text-foreground/90 rounded-tl-sm",
                  )}
                >
                  {msg.content ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    // Streaming placeholder
                    <span className="flex gap-1 items-center py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#53E9F6]/60 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[#53E9F6]/60 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[#53E9F6]/60 animate-bounce [animation-delay:300ms]" />
                    </span>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <p className="text-xs text-red-400/80 text-center px-2">{error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 px-3 py-3 border-t border-white/10"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this token..."
              disabled={isStreaming}
              className={cn(
                "flex-1 bg-white/5 rounded-full px-4 py-2 text-sm outline-none",
                "placeholder:text-muted-foreground/50",
                "border border-white/10 focus:border-[#622EC3]/30",
                "transition-colors disabled:opacity-50",
              )}
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                "bg-[#622EC3] text-white transition-all",
                "hover:bg-[#7B45E0] active:scale-95",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
