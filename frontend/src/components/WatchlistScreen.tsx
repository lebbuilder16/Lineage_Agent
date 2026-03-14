import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bookmark, Plus, Trash2, Key, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';
import type { TokenSearchResult } from '../types/api';
import type { Screen } from '../App';
import { getMe, getWatches, addWatch, deleteWatch } from '../lib/api';
import { useAuthStore } from '../store/auth';

interface WatchlistScreenProps {
  selectedToken: TokenSearchResult | null;
  onNavigate: (screen: Screen) => void;
}

export function WatchlistScreen({ selectedToken, onNavigate }: WatchlistScreenProps) {
  const { apiKey, setApiKey, user, setUser, watches, setWatches, addWatch: storeAddWatch, removeWatch } = useAuthStore();
  const [keyInput, setKeyInput] = useState(apiKey ?? '');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [loadingWatches, setLoadingWatches] = useState(false);
  const [addingMint, setAddingMint] = useState(false);
  const [deleteIds, setDeleteIds] = useState<Set<string>>(new Set());

  // Load watches when apiKey is set
  useEffect(() => {
    if (apiKey) {
      loadWatches(apiKey);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const loadWatches = async (key: string) => {
    setLoadingWatches(true);
    try {
      const ws = await getWatches(key);
      setWatches(ws);
    } catch {
      // silently ignore
    } finally {
      setLoadingWatches(false);
    }
  };

  const handleValidateKey = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setIsValidating(true);
    setKeyError(null);
    try {
      const u = await getMe(trimmed);
      setApiKey(trimmed);
      setUser(u);
      const ws = await getWatches(trimmed);
      setWatches(ws);
    } catch {
      setKeyError('Invalid API key. Check your key and try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAddWatch = async () => {
    if (!apiKey || !selectedToken) return;
    setAddingMint(true);
    try {
      const w = await addWatch(apiKey, 'mint', selectedToken.mint);
      storeAddWatch(w);
    } catch {
      // silently ignore
    } finally {
      setAddingMint(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!apiKey) return;
    setDeleteIds((prev) => new Set(prev).add(id));
    try {
      await deleteWatch(apiKey, id);
      removeWatch(id);
    } catch {
      setDeleteIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const alreadyWatched = selectedToken && watches.some((w) => w.identifier === selectedToken.mint);

  return (
    <div className="px-4 pt-2 pb-4 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(173,200,255,0.12)' }}>
          <Bookmark size={16} style={{ color: '#ADCEFF' }} />
        </div>
        <div>
          <h2 className="text-section-header font-bold text-white">WATCHLIST</h2>
          <p className="text-tiny text-white/40">Track tokens with live alerts</p>
        </div>
      </div>

      {/* API Key Section */}
      {!apiKey ? (
        <div className="mb-4 bg-glass rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Key size={14} style={{ color: '#ADCEFF' }} />
            <span className="text-small font-bold text-white">Enter API Key</span>
          </div>
          <input
            type="password"
            placeholder="Your Lineage Agent API key…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleValidateKey()}
            className="w-full bg-black/20 rounded-xl px-3 py-2.5 text-small text-white placeholder-white/25 outline-none border border-white/5 focus:border-white/20 mb-2.5"
          />
          {keyError && (
            <div className="flex items-center gap-1.5 mb-2.5 text-tiny" style={{ color: '#FF3366' }}>
              <AlertTriangle size={11} />
              {keyError}
            </div>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleValidateKey}
            disabled={isValidating || !keyInput.trim()}
            className="w-full py-2.5 rounded-xl text-small font-bold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #6F6ACF, #ADCEFF)' }}
          >
            {isValidating ? 'Validating…' : 'Activate Watch Mode'}
          </motion.button>
        </div>
      ) : (
        <div className="mb-4 bg-glass rounded-2xl p-3 flex items-center gap-3">
          <CheckCircle size={14} style={{ color: '#00FF88' }} />
          <div className="flex-1">
            <div className="text-small font-semibold text-white">{user?.username ?? 'Authenticated'}</div>
            <div className="text-tiny text-white/40">{watches.length} token{watches.length !== 1 ? 's' : ''} watched</div>
          </div>
          <button
            onClick={() => { setApiKey(null); setUser(null); setWatches([]); setKeyInput(''); }}
            className="text-tiny text-white/30 hover:text-white/60 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}

      {/* Add current token */}
      {selectedToken && apiKey && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleAddWatch}
          disabled={addingMint || alreadyWatched}
          className="w-full mb-4 py-3 rounded-2xl text-small font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
          style={{
            background: alreadyWatched
              ? 'rgba(0,255,136,0.12)'
              : 'rgba(111,106,207,0.18)',
            border: alreadyWatched
              ? '1px solid rgba(0,255,136,0.25)'
              : '1px solid rgba(111,106,207,0.25)',
            color: alreadyWatched ? '#00FF88' : '#ADCEFF',
          }}
        >
          {alreadyWatched ? (
            <><CheckCircle size={14} /> Watching {selectedToken.symbol ?? selectedToken.mint.slice(0, 8)}</>
          ) : (
            <><Plus size={14} /> Watch {selectedToken.symbol ?? selectedToken.mint.slice(0, 8)}</>
          )}
        </motion.button>
      )}

      {/* No token selected + no API key */}
      {!apiKey && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(173,200,255,0.07)' }}>
            <Bookmark size={28} style={{ color: '#ADCEFF', opacity: 0.4 }} />
          </div>
          <p className="text-small text-white/30 mb-2">Enter your API key<br />to enable token tracking</p>
          <button
            onClick={() => onNavigate('radar')}
            className="text-tiny flex items-center gap-1 mt-2"
            style={{ color: '#6F6ACF' }}
          >
            Browse tokens first <ExternalLink size={10} />
          </button>
        </div>
      )}

      {/* Watches List */}
      {apiKey && (
        <div>
          {loadingWatches ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-glass rounded-2xl h-16 animate-pulse" />
              ))}
            </div>
          ) : watches.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-small text-white/30 mb-3">No tokens on watchlist yet</p>
              <button
                onClick={() => onNavigate('radar')}
                className="text-small font-semibold"
                style={{ color: '#6F6ACF' }}
              >
                Discover tokens →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-tiny font-bold uppercase tracking-wider text-white/30 px-1 mb-1">Watching</p>
              <AnimatePresence>
                {watches.map((w) => (
                  <motion.div
                    key={w.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12, height: 0 }}
                    className="bg-glass rounded-2xl p-3 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-small" style={{ background: 'rgba(111,106,207,0.15)', color: '#ADCEFF' }}>
                      {w.identifier.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-small font-semibold text-white font-mono truncate">{w.identifier.slice(0, 16)}…</div>
                      <div className="text-tiny text-white/30">Added {new Date(w.created_at).toLocaleDateString()}</div>
                    </div>
                    <button
                      onClick={() => handleDelete(w.id)}
                      disabled={deleteIds.has(w.id)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40"
                      style={{ background: 'rgba(255,51,102,0.1)' }}
                    >
                      {deleteIds.has(w.id)
                        ? <div className="w-3 h-3 rounded-full border border-white/20 border-t-white animate-spin" />
                        : <Trash2 size={13} style={{ color: '#FF3366' }} />
                      }
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
