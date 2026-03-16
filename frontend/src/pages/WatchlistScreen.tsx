import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Key, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Skeleton } from '../components/ui/skeleton';
import { useAuthStore } from '../store/auth';
import { useWatches, useAddWatch, useDeleteWatch } from '../lib/query';

export default function WatchlistScreen() {
  const navigate = useNavigate();
  const { apiKey, setApiKey } = useAuthStore();
  const { data: watches, isLoading } = useWatches(apiKey);
  const addMutation = useAddWatch(apiKey);
  const deleteMutation = useDeleteWatch(apiKey);

  const [keyInput, setKeyInput] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<'mint' | 'deployer'>('mint');
  const [addValue, setAddValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auth gate
  if (!apiKey) {
    return (
      <div style={{ maxWidth: 400, margin: '60px auto', textAlign: 'center' }}>
        <Key size={40} color="var(--color-secondary)" style={{ marginBottom: 16 }} />
        <h1 style={{ fontSize: 'var(--text-main-heading)', fontWeight: 700, color: '#fff', marginBottom: 8 }}>Watchlist</h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 20 }}>Enter your API key to access your watchlist.</p>
        <form
          onSubmit={(e) => { e.preventDefault(); if (keyInput.trim()) setApiKey(keyInput.trim()); }}
          style={{ display: 'flex', gap: 8 }}
        >
          <div style={{ flex: 1 }}>
            <label htmlFor="api-key" className="sr-only">API Key</label>
            <input
              id="api-key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Your API key..."
              type="password"
              autoComplete="off"
              style={{
                width: '100%', padding: '10px 16px', borderRadius: 'var(--radius-pill)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', fontSize: 'var(--text-body)',
              }}
            />
          </div>
          <button type="submit" style={{
            padding: '10px 20px', borderRadius: 'var(--radius-pill)',
            background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
          }}>
            Connect
          </button>
        </form>
      </div>
    );
  }

  const mintWatches = watches?.filter((w) => w.sub_type === 'mint') ?? [];
  const deployerWatches = watches?.filter((w) => w.sub_type === 'deployer') ?? [];

  const handleAdd = () => {
    if (!addValue.trim()) return;
    addMutation.mutate({ sub_type: addType, value: addValue.trim() });
    setAddValue('');
    setAddOpen(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 'var(--text-main-heading)', fontWeight: 700, color: '#fff', margin: 0 }}>Watchlist</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Add Dialog */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 'var(--radius-pill)',
                background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500,
              }}>
                <Plus size={16} /> Add
              </button>
            </DialogTrigger>
            <DialogContent style={{ background: 'var(--bg-app)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <DialogHeader>
                <DialogTitle style={{ color: '#fff' }}>Add to Watchlist</DialogTitle>
              </DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['mint', 'deployer'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAddType(t)}
                      style={{
                        padding: '6px 16px', borderRadius: 'var(--radius-pill)',
                        background: addType === t ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
                        color: addType === t ? '#fff' : 'rgba(255,255,255,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', textTransform: 'capitalize',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div>
                  <label htmlFor="watch-address" className="sr-only">{addType === 'mint' ? 'Token' : 'Deployer'} address</label>
                  <input
                    id="watch-address"
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    placeholder={`${addType === 'mint' ? 'Token' : 'Deployer'} address...`}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-small)',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff', fontFamily: 'monospace',
                    }}
                  />
                </div>
                <button onClick={handleAdd} style={{
                  padding: '10px 20px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600,
                }}>
                  Add Watch
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Settings */}
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <button aria-label="Settings" style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
                <Settings size={20} color="rgba(255,255,255,0.5)" />
              </button>
            </DialogTrigger>
            <DialogContent style={{ background: 'var(--bg-app)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <DialogHeader>
                <DialogTitle style={{ color: '#fff' }}>Settings</DialogTitle>
              </DialogHeader>
              <div style={{ padding: '12px 0' }}>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 'var(--text-small)', marginBottom: 12 }}>
                  API Key: {apiKey.slice(0, 8)}...
                </p>
                <button
                  onClick={() => { setApiKey(null); setSettingsOpen(false); }}
                  style={{
                    padding: '8px 20px', borderRadius: 'var(--radius-pill)',
                    background: 'rgba(255,0,51,0.1)', border: '1px solid rgba(255,0,51,0.3)',
                    color: 'var(--color-error)', cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}

      {!isLoading && watches?.length === 0 && (
        <p style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', padding: 40 }}>
          Your watchlist is empty. Click "Add" to start watching tokens or deployers.
        </p>
      )}

      {/* Token Watches */}
      {mintWatches.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 'var(--text-section-header)', fontWeight: 600, color: '#fff', marginBottom: 12 }}>Tokens</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mintWatches.map((w) => (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <button
                  onClick={() => navigate(`/token/${w.value}`)}
                  style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <div style={{ color: '#fff', fontSize: 'var(--text-body)', fontWeight: 500 }}>{w.label || w.value.slice(0, 12) + '...'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 'var(--text-tiny)', fontFamily: 'monospace' }}>{w.value}</div>
                </button>
                <button
                  onClick={() => deleteMutation.mutate(w.id)}
                  aria-label="Remove watch"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
                >
                  <Trash2 size={16} color="rgba(255,255,255,0.3)" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deployer Watches */}
      {deployerWatches.length > 0 && (
        <div>
          <h2 style={{ fontSize: 'var(--text-section-header)', fontWeight: 600, color: '#fff', marginBottom: 12 }}>Deployers</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {deployerWatches.map((w) => (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: 'var(--text-body)', fontWeight: 500 }}>{w.label || w.value.slice(0, 12) + '...'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 'var(--text-tiny)', fontFamily: 'monospace' }}>{w.value}</div>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(w.id)}
                  aria-label="Remove watch"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
                >
                  <Trash2 size={16} color="rgba(255,255,255,0.3)" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
