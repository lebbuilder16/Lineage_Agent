import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';

const LS_KEY = 'lineage_history';
const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', black: '#000', gray: '#6B6B6B' };

function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]').slice(0, 8); } catch { return []; }
}

export function addToHistory(mint: string) {
  const h = getHistory().filter(m => m !== mint);
  h.unshift(mint);
  localStorage.setItem(LS_KEY, JSON.stringify(h.slice(0, 8)));
}

const isBase58 = (s: string) => s.length >= 32 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const submit = useCallback(() => {
    const q = value.trim();
    if (!q) return;
    setOpen(false); setValue('');
    if (isBase58(q)) { addToHistory(q); navigate(`/sol-trace/${q}`); }
    else navigate(`/search?q=${encodeURIComponent(q)}`);
  }, [value, navigate]);

  if (!open) return null;
  const history = getHistory();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120, background: 'rgba(255,255,255,0.9)' }} onClick={() => setOpen(false)}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, border: '1px solid #000', background: '#fff', fontFamily: ff.font }}>
        <Command shouldFilter={false}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #000' }}>
            <Command.Input
              value={value} onValueChange={setValue}
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="Search token or paste address…" autoFocus
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 16, letterSpacing: '-0.48px', fontFamily: 'inherit', background: 'transparent', color: '#000' }}
            />
          </div>
          <Command.List style={{ maxHeight: 280, overflowY: 'auto' }}>
            {history.length > 0 && (
              <Command.Group>
                <div style={{ padding: '8px 16px', fontSize: 13, color: ff.gray, fontWeight: 600 }}>Recent</div>
                {history.map(mint => (
                  <Command.Item key={mint} value={mint}
                    onSelect={() => { addToHistory(mint); setOpen(false); navigate(`/sol-trace/${mint}`); }}
                    style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontFamily: 'monospace', color: ff.gray, borderBottom: '1px solid #f0f0f0' }}
                  >
                    {mint.slice(0, 8)}…{mint.slice(-6)}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {value.trim() && (
              <Command.Item onSelect={submit} style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 16, letterSpacing: '-0.48px' }}>
                {isBase58(value.trim()) ? `Analyse ${value.trim().slice(0, 12)}…` : `Search "${value.trim()}"`}
              </Command.Item>
            )}
          </Command.List>
          <div style={{ padding: '8px 16px', fontSize: 12, color: ff.gray, borderTop: '1px solid #f0f0f0' }}>
            ⌘K to open · Esc to close
          </div>
        </Command>
      </div>
    </div>
  );
}
