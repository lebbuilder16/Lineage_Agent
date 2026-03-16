import { create } from 'zustand';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  isOpen: boolean;
  contextMint: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  toggle: () => void;
  open: (mint?: string) => void;
  close: () => void;
  setContextMint: (mint: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  updateLastAssistant: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  contextMint: null,
  messages: [],
  streaming: false,

  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: (mint) => set({ isOpen: true, ...(mint ? { contextMint: mint } : {}) }),
  close: () => set({ isOpen: false }),
  setContextMint: (mint) => set({ contextMint: mint }),

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

  updateLastAssistant: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content };
      }
      return { messages: msgs };
    }),

  setStreaming: (streaming) => set({ streaming }),
  clearMessages: () => set({ messages: [] }),
}));
