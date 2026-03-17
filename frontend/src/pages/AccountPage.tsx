import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useWatches, useAddWatch, useDeleteWatch } from '../lib/query';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

export default function AccountPage() {
  const { apiKey, setApiKey } = useAuthStore();
  const { data: watches, isLoading } = useWatches(apiKey);
  const addMutation = useAddWatch(apiKey);
  const deleteMutation = useDeleteWatch(apiKey);

  const [keyInput, setKeyInput] = useState('');
  const [addType, setAddType] = useState<'mint' | 'deployer'>('mint');
  const [addValue, setAddValue] = useState('');
  const [showKey, setShowKey] = useState(false);

  if (!apiKey) {
    return (
      <div style={{ maxWidth: 420, fontFamily: ff.font }}>
        <h1 className="ff-page-title" style={{ marginBottom: 8 }}>Account</h1>
        <p className="ff-body" style={{ marginBottom: 24 }}>Enter your API key to manage your watchlist and preferences.</p>
        <form onSubmit={e => { e.preventDefault(); if (keyInput.trim()) setApiKey(keyInput.trim()); }} style={{ display: 'flex', gap: 12 }}>
          <label htmlFor="api-key" className="sr-only">API Key</label>
          <input id="api-key" className="ff-input" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Your API key…" type="password" autoComplete="off" style={{ flex: 1 }} />
          <button type="submit" className="ff-btn">Connect</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 32 }}>Account</h1>

      {/* API Key */}
      <div className="ff-section">
        <h2 className="ff-label" style={{ marginBottom: 12, textTransform: 'uppercase' }}>API Key</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ff-address">{showKey ? apiKey : `${apiKey.slice(0, 8)}${'•'.repeat(16)}`}</span>
          <button onClick={() => setShowKey(s => !s)} className="ff-link" style={{ fontSize: 13 }}>{showKey ? 'Hide' : 'Show'}</button>
          <button onClick={() => navigator.clipboard.writeText(apiKey)} className="ff-link" style={{ fontSize: 13 }}>Copy</button>
        </div>
        <button onClick={() => setApiKey(null)} className="ff-link" style={{ marginTop: 12, fontSize: 13, color: ff.gray }}>Disconnect</button>
      </div>

      {/* Add Watch */}
      <div className="ff-section">
        <h2 className="ff-label" style={{ marginBottom: 12, textTransform: 'uppercase' }}>Add Watch</h2>
        <form onSubmit={e => { e.preventDefault(); if (addValue.trim()) { addMutation.mutate({ sub_type: addType, value: addValue.trim() }); setAddValue(''); } }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {(['mint', 'deployer'] as const).map(t => (
              <button key={t} type="button" onClick={() => setAddType(t)} style={{ fontSize: 16, letterSpacing: '-0.48px', fontFamily: ff.font, fontWeight: addType === t ? 600 : 400, color: addType === t ? '#000' : ff.gray, textDecoration: addType === t ? 'underline' : 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'capitalize' }}>
                {t}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <label htmlFor="watch-addr" className="sr-only">{addType} address</label>
            <input id="watch-addr" className="ff-input" value={addValue} onChange={e => setAddValue(e.target.value)} placeholder={`${addType === 'mint' ? 'Token' : 'Deployer'} address…`} style={{ flex: 1 }} />
            <button type="submit" className="ff-btn">Add</button>
          </div>
        </form>
      </div>

      {/* Watches */}
      <div className="ff-section">
        <h2 className="ff-label" style={{ marginBottom: 12, textTransform: 'uppercase' }}>Watches</h2>
        {isLoading && <div className="ff-skeleton" style={{ height: 100 }} />}
        {watches && watches.length === 0 && <p className="ff-body">No watches yet.</p>}
        {watches && watches.map(w => (
          <div key={w.id} className="ff-row">
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#000', textTransform: 'uppercase' }}>{w.sub_type}</span>
              <div className="ff-address" style={{ marginTop: 2 }}>{w.value}</div>
            </div>
            <button onClick={() => deleteMutation.mutate(w.id)} className="ff-link" style={{ fontSize: 13, color: ff.gray }} aria-label="Remove">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
