import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSearchTokens } from '../lib/query';

export function GlobalSearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState('');
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = useSearchTokens(debounced, open && debounced.length > 1);

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const submit = useCallback((mint: string) => {
    setOpen(false);
    setQuery('');
    navigate(`/token/${mint}`);
  }, [navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length > 10) submit(q);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1, maxWidth: 480 }}>
      <form onSubmit={handleSubmit} role="search" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-pill)', padding: '6px 14px' }}>
        <Search size={16} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search token or paste address... (Cmd+K)"
          aria-label="Search token or paste address"
          style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: 'var(--text-body)', fontFamily: 'Lexend, sans-serif' }}
        />
      </form>

      {open && results && results.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--bg-app)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-small)', maxHeight: 320, overflowY: 'auto', zIndex: 50 }}>
          {results.slice(0, 8).map((t) => (
            <button
              key={t.mint}
              onClick={() => submit(t.mint)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {t.image_uri && <img src={t.image_uri} alt="" width={28} height={28} loading="lazy" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontSize: 'var(--text-body)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || t.mint.slice(0, 12)}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 'var(--text-small)' }}>{t.symbol}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
