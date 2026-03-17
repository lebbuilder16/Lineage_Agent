// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Chat — Dual-mode adapter
// Routes chat through OpenClaw when available, falls back to Lineage API.
// ─────────────────────────────────────────────────────────────────────────────
import { isOpenClawAvailable, sendRequest } from './openclaw';
import { chatStream } from './streaming';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Dual-mode chat: OpenClaw agent session when available, direct API otherwise.
 * Returns a cancel function.
 */
export async function smartChatStream(
  mint: string | undefined,
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  // Try OpenClaw first
  if (isOpenClawAvailable()) {
    try {
      return await openClawChatStream(mint, message, history, onChunk, onDone, onError);
    } catch {
      // OpenClaw failed — fall through to direct API
    }
  }

  // Fallback: direct Lineage API chat
  return chatStream(mint, message, history, onChunk, onDone, onError);
}

/** Whether the current chat session is using OpenClaw */
export function isChatOpenClawMode(): boolean {
  return isOpenClawAvailable();
}

// ─── OpenClaw chat via Gateway WebSocket ─────────────────────────────────────

async function openClawChatStream(
  mint: string | undefined,
  message: string,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  let cancelled = false;

  const sessionKey = mint ? `lineage:token:${mint}` : 'lineage:chat:global';

  // Build the system context for the Lineage skill
  const contextPrefix = mint
    ? `[Context: Analyzing Solana token ${mint}. Use your Lineage skill to fetch data if needed.]\n\n`
    : '[Context: General Lineage Agent chat. Use your Lineage skill to fetch data if needed.]\n\n';

  try {
    // Use OpenClaw's chat.send method which returns a streaming response
    const result = await sendRequest<{ text?: string; chunks?: string[] }>('chat.send', {
      sessionKey,
      message: contextPrefix + message,
      stream: false, // WS req/res doesn't support true streaming; get full response
    });

    if (cancelled) return () => {};

    // Deliver the response in simulated chunks for smooth UX
    const fullText = typeof result === 'string'
      ? result
      : (result as { text?: string })?.text ?? JSON.stringify(result);

    // Simulate streaming by chunking the response
    const words = fullText.split(' ');
    let i = 0;
    const chunkInterval = setInterval(() => {
      if (cancelled || i >= words.length) {
        clearInterval(chunkInterval);
        if (!cancelled) onDone();
        return;
      }
      const chunk = (i > 0 ? ' ' : '') + words[i];
      onChunk(chunk);
      i++;
    }, 20); // ~50 words/sec for natural feel

    return () => {
      cancelled = true;
      clearInterval(chunkInterval);
    };
  } catch (err) {
    // Rethrow so smartChatStream can fall back to the direct Lineage API
    cancelled = true;
    throw err;
  }
}
