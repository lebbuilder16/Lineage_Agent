import { useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { useChatStore } from '../store/chat';
import { chatStream } from '../lib/api';

export function ChatFloatingPanel() {
  const { isOpen, toggle, close, messages, addMessage, updateLastAssistant, streaming, setStreaming, contextMint, setContextMint, clearMessages } = useChatStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const location = useLocation();

  // Auto-detect mint from URL
  useEffect(() => {
    const match = location.pathname.match(/^\/token\/(.+)$/);
    setContextMint(match ? match[1] : null);
  }, [location.pathname, setContextMint]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const input = inputRef.current;
    if (!input || !input.value.trim() || streaming) return;
    const text = input.value.trim();
    input.value = '';

    addMessage({ role: 'user', content: text });
    addMessage({ role: 'assistant', content: '' });
    setStreaming(true);

    let accumulated = '';
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    const cancel = await chatStream(
      contextMint ?? undefined,
      text,
      history,
      (chunk) => { accumulated += chunk; updateLastAssistant(accumulated); },
      () => setStreaming(false),
      () => setStreaming(false),
    );
    cancelRef.current = cancel;
  }, [streaming, contextMint, messages, addMessage, updateLastAssistant, setStreaming]);

  const handleCancel = () => {
    cancelRef.current?.();
    setStreaming(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={toggle}
        aria-label="Open chat"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 50,
          width: 52, height: 52, borderRadius: '50%',
          background: 'var(--color-primary)', color: '#fff',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(111,106,207,0.4)',
        }}
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 50,
      width: 380, height: 520,
      background: 'var(--bg-app)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 'var(--radius-card)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      fontFamily: 'Lexend, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <span style={{ fontWeight: 600, color: '#fff', fontSize: 'var(--text-body)' }}>AI Chat</span>
          {contextMint && (
            <span style={{ marginLeft: 8, fontSize: 'var(--text-tiny)', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
              {contextMint.slice(0, 6)}...
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {messages.length > 0 && (
            <button onClick={clearMessages} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 'var(--text-small)' }}>
              Clear
            </button>
          )}
          <button onClick={close} aria-label="Close chat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 40, fontSize: 'var(--text-body)' }}>
            Ask anything about {contextMint ? 'this token' : 'Solana tokens'}...
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: 12,
              background: m.role === 'user' ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: 'var(--text-body)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {m.content || (streaming && i === messages.length - 1 ? '...' : '')}
          </div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
        style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <input
          ref={inputRef}
          placeholder="Type a message..."
          disabled={streaming}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 'var(--radius-pill)', padding: '8px 14px',
            color: '#fff', fontSize: 'var(--text-body)', fontFamily: 'Lexend, sans-serif', outline: 'none',
          }}
        />
        {streaming ? (
          <button type="button" onClick={handleCancel} aria-label="Cancel streaming" style={{ background: 'var(--color-error)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
          </button>
        ) : (
          <button type="submit" aria-label="Send message" style={{ background: 'var(--color-primary)', border: 'none', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Send size={16} color="#fff" />
          </button>
        )}
      </form>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
