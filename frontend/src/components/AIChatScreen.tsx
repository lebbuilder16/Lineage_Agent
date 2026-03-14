import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Send, Bot, User as UserIcon, Loader } from 'lucide-react';
import type { TokenSearchResult } from '../types/api';
import { chatStream } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface AIChatScreenProps {
  selectedToken: TokenSearchResult | null;
  onBack: () => void;
}

const SUGGESTIONS = [
  'Is this token a rug pull?',
  'Explain the deployer history',
  'What are the biggest red flags?',
  'Show bundle extraction risks',
  'Who controls this token?',
];

export function AIChatScreen({ selectedToken, onBack }: AIChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => () => { abortRef.current?.(); }, []);

  const sendMessage = async (text = input.trim()) => {
    if (!text || streaming) return;
    setInput('');

    const userMsg: Message = { role: 'user', content: text };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    // Append placeholder
    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }]);

    let accumulated = '';

    chatStream(
      selectedToken?.mint ?? undefined,
      text,
      history,
      (chunk) => {
        accumulated += chunk;
        setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: accumulated } : m));
      },
      () => {
        setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, streaming: false } : m));
        setStreaming(false);
        abortRef.current = null;
      },
      (err) => {
        setMessages((prev) => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: (err as Error)?.message || 'An error occurred.', streaming: false } : m));
        setStreaming(false);
        abortRef.current = null;
      },
    ).then((abort) => { abortRef.current = abort; });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-3 flex-shrink-0">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <ArrowLeft size={16} className="text-white/70" />
        </button>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(111,106,207,0.2)' }}>
          <Bot size={16} style={{ color: '#ADCEFF' }} />
        </div>
        <div>
          <h2 className="text-small font-bold text-white">AI ANALYST</h2>
          <p className="text-tiny text-white/40">
            {selectedToken ? `Analyzing ${selectedToken.symbol ?? selectedToken.mint.slice(0, 8)}` : 'General analysis mode'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 scrollbar-hide">
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(111,106,207,0.15)' }}>
                <Bot size={26} style={{ color: '#ADCEFF' }} />
              </div>
              <p className="text-small text-white/50">
                {selectedToken
                  ? `Ask me anything about ${selectedToken.symbol ?? 'this token'}`
                  : 'Ask about any Solana token or rug risk'}
              </p>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <motion.button
                  key={s}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => sendMessage(s)}
                  className="w-full bg-glass rounded-2xl px-3 py-2.5 text-left text-small text-white/60 hover:text-white/80 transition-colors flex items-center justify-between"
                >
                  {s}
                  <Send size={11} className="text-white/20 flex-shrink-0" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: msg.role === 'user' ? 'rgba(111,106,207,0.25)' : 'rgba(173,200,255,0.12)' }}
              >
                {msg.role === 'user'
                  ? <UserIcon size={12} style={{ color: '#ADCEFF' }} />
                  : <Bot size={12} style={{ color: '#ADCEFF' }} />
                }
              </div>
              <div
                className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-small leading-relaxed"
                style={{
                  background: msg.role === 'user' ? 'rgba(111,106,207,0.2)' : 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.85)',
                }}
              >
                {msg.content}
                {msg.streaming && (
                  <span className="inline-block w-1 h-3.5 rounded-sm ml-0.5 animate-pulse align-middle" style={{ background: '#ADCEFF' }} />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pt-2 pb-4">
        <div className="flex gap-2 items-end">
          <input
            type="text"
            placeholder="Ask the AI analyst…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            disabled={streaming}
            className="flex-1 bg-glass rounded-2xl px-4 py-3 text-small text-white placeholder-white/25 outline-none border border-white/5 focus:border-white/20 disabled:opacity-50"
          />
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => sendMessage()}
            disabled={!input.trim() || streaming}
            className="w-11 h-11 rounded-2xl flex items-center justify-center disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #6F6ACF, #ADCEFF)' }}
          >
            {streaming
              ? <Loader size={14} className="text-white animate-spin" />
              : <Send size={14} className="text-white" />
            }
          </motion.button>
        </div>
      </div>
    </div>
  );
}
