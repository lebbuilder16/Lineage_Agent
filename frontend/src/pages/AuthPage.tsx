import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { detectWallets, connectWallet, type DetectedWallet } from '../lib/wallets';
import { authLogin, getMe } from '../lib/api';
import { useAuthStore } from '../store/auth';

/* ── Styles ────────────────────────────────────────────── */

const css = `
  .auth-page {
    min-height: 100vh;
    background: #09090B;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    position: relative;
    overflow: hidden;
  }
  .auth-page::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, rgba(139,92,246,0.04) 0%, transparent 50%);
    pointer-events: none;
  }

  .auth-card {
    position: relative;
    width: 100%;
    max-width: 420px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 20px;
    padding: 40px 32px;
    backdrop-filter: blur(20px);
    animation: auth-fadeIn 0.5s ease both;
  }

  .auth-logo {
    text-align: center;
    margin-bottom: 32px;
  }
  .auth-logo a {
    text-decoration: none;
  }
  .auth-logo span {
    font-size: 20px;
    font-weight: 600;
    color: #FAFAFA;
    letter-spacing: -0.48px;
  }

  .auth-title {
    font-size: 22px;
    font-weight: 600;
    color: #FAFAFA;
    letter-spacing: -0.5px;
    margin: 0 0 8px;
    text-align: center;
  }

  .auth-subtitle {
    font-size: 14px;
    color: #71717A;
    text-align: center;
    margin: 0 0 32px;
    line-height: 1.6;
  }

  .wallet-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 0;
  }

  .wallet-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 16px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    color: #FAFAFA;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
    letter-spacing: -0.3px;
    box-sizing: border-box;
  }
  .wallet-btn:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.14);
  }
  .wallet-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .wallet-btn:active:not(:disabled) {
    transform: scale(0.99);
  }

  .wallet-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 15px;
    color: #fff;
    flex-shrink: 0;
  }

  .wallet-badge {
    margin-left: auto;
    font-size: 11px;
    color: #52525B;
    font-weight: 400;
    flex-shrink: 0;
  }

  .auth-divider {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 24px 0;
  }
  .auth-divider-line {
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.07);
  }
  .auth-divider-text {
    font-size: 12px;
    color: #3F3F46;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-weight: 500;
  }

  .auth-input {
    width: 100%;
    padding: 13px 16px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    color: #FAFAFA;
    font-size: 15px;
    outline: none;
    font-family: inherit;
    letter-spacing: -0.3px;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .auth-input:focus {
    border-color: rgba(59, 130, 246, 0.5);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.08);
  }
  .auth-input::placeholder {
    color: #3F3F46;
  }

  .auth-submit-btn {
    width: 100%;
    padding: 13px;
    background: linear-gradient(135deg, #3B82F6, #6366F1);
    border: none;
    border-radius: 12px;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.2s;
    font-family: inherit;
    letter-spacing: -0.3px;
  }
  .auth-submit-btn:hover { opacity: 0.9; }
  .auth-submit-btn:active { transform: scale(0.99); }
  .auth-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .auth-error {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.15);
    border-radius: 10px;
    padding: 12px 16px;
    color: #FCA5A5;
    font-size: 13px;
    margin-bottom: 16px;
    line-height: 1.5;
  }

  .auth-text-btn {
    background: none;
    border: none;
    color: #52525B;
    font-size: 13px;
    cursor: pointer;
    padding: 8px 0;
    font-family: inherit;
    transition: color 0.2s;
    text-align: center;
    width: 100%;
  }
  .auth-text-btn:hover { color: #A1A1AA; }

  .auth-back {
    display: block;
    text-align: center;
    margin-top: 24px;
    color: #3F3F46;
    font-size: 13px;
    text-decoration: none;
    transition: color 0.2s;
    position: relative;
  }
  .auth-back:hover { color: #71717A; }

  .auth-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #fff;
    border-radius: 50%;
    animation: auth-spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes auth-spin { to { transform: rotate(360deg); } }
  @keyframes auth-fadeIn {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 480px) {
    .auth-card { padding: 32px 20px; border-radius: 16px; }
  }
`;

/* ── Component ─────────────────────────────────────────── */

export default function AuthPage() {
  const navigate = useNavigate();
  const { apiKey, setApiKey, setUser } = useAuthStore();
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'wallets' | 'email' | 'apikey'>('wallets');
  const [email, setEmail] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');

  useEffect(() => {
    if (apiKey) navigate('/dashboard', { replace: true });
  }, [apiKey, navigate]);

  useEffect(() => {
    setWallets(detectWallets());
  }, []);

  const handleWalletConnect = async (name: string) => {
    setError(null);
    setLoading(name);
    try {
      const wallet = await connectWallet(name);
      const result = await authLogin(wallet.publicKey, wallet.publicKey);
      setApiKey(result.api_key);
      try { const me = await getMe(result.api_key); setUser(me); } catch { /* optional */ }
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setLoading(null);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError(null);
    setLoading('email');
    try {
      const result = await authLogin(trimmed, undefined, trimmed);
      setApiKey(result.api_key);
      try { const me = await getMe(result.api_key); setUser(me); } catch { /* optional */ }
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(null);
    }
  };

  const handleApiKeyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const key = apiKeyInput.trim();
    if (!key) return;
    setApiKey(key);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="auth-page">
      <style>{css}</style>
      <div className="auth-card">
        <div className="auth-logo">
          <Link to="/"><span>Lineage</span></Link>
        </div>

        <h1 className="auth-title">Connect to Lineage</h1>
        <p className="auth-subtitle">
          Connect your Solana wallet or sign in with email to access the full intelligence suite.
        </p>

        {error && <div className="auth-error">{error}</div>}

        {/* ── Wallet buttons ── */}
        <div className="wallet-list">
          {wallets.map((w) => (
            <button
              key={w.name}
              className="wallet-btn"
              onClick={() => w.installed ? handleWalletConnect(w.name) : window.open(w.downloadUrl, '_blank')}
              disabled={loading !== null}
              style={!w.installed ? { opacity: 0.5 } : undefined}
            >
              <div className="wallet-icon" style={{ background: w.color }}>
                {w.name[0]}
              </div>
              {loading === w.name ? (
                <><span className="auth-spinner" /> Connecting...</>
              ) : (
                w.name
              )}
              <span className="wallet-badge">{w.installed ? 'Detected' : 'Install \u2192'}</span>
            </button>
          ))}
        </div>

        {/* ── Divider ── */}
        <div className="auth-divider">
          <div className="auth-divider-line" />
          <span className="auth-divider-text">or</span>
          <div className="auth-divider-line" />
        </div>

        {/* ── Secondary auth methods ── */}
        {mode === 'wallets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="wallet-btn" onClick={() => setMode('email')} style={{ justifyContent: 'center' }}>
              Continue with email
            </button>
            <button className="auth-text-btn" onClick={() => setMode('apikey')}>
              I have an API key
            </button>
          </div>
        )}

        {mode === 'email' && (
          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              autoComplete="email"
            />
            <button type="submit" className="auth-submit-btn" disabled={!email.trim() || loading !== null}>
              {loading === 'email' ? <span className="auth-spinner" /> : 'Continue'}
            </button>
            <button type="button" className="auth-text-btn" onClick={() => setMode('wallets')}>
              \u2190 Back to wallets
            </button>
          </form>
        )}

        {mode === 'apikey' && (
          <form onSubmit={handleApiKeyLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              className="auth-input"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="lin_..."
              autoFocus
              autoComplete="off"
            />
            <button type="submit" className="auth-submit-btn" disabled={!apiKeyInput.trim()}>
              Connect
            </button>
            <button type="button" className="auth-text-btn" onClick={() => setMode('wallets')}>
              \u2190 Back to wallets
            </button>
          </form>
        )}
      </div>

      <Link to="/" className="auth-back">\u2190 Back to home</Link>
    </div>
  );
}
