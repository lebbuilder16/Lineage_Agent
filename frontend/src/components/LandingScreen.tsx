import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { animate } from 'motion';
import { getGlobalStats } from '../lib/api';
import type { GlobalStats } from '../types/api';

/* ─────────────────────────────────────────────
   ANIMATED COUNTER
───────────────────────────────────────────── */

function AnimatedStat({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      el.textContent = fmtStat(value);
      return;
    }

    const ctrl = animate(0, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = fmtStat(Math.round(v)); },
      onComplete: () => { el.textContent = fmtStat(value); },
    });

    return () => { ctrl.stop(); };
  }, [value]);

  return <span ref={ref}>{fmtStat(value)}</span>;
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function fmtStat(n?: number): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const EXAMPLE_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const features = [
  {
    title: 'Token Radar',
    category: 'Market Intelligence',
    description: 'Real-time radar surfaces emerging tokens before they trend, analyzing volume patterns and deployer history.',
    route: '/search',
    color: '#3B82F6',
  },
  {
    title: 'Lineage Scan',
    category: 'Clone Detection',
    description: 'Deep scan any token to uncover its full lineage tree, identifying forks, clones, and imposters.',
    route: `/lineage/${EXAMPLE_MINT}`,
    color: '#10B981',
  },
  {
    title: 'Death Clock',
    category: 'Rug Probability',
    description: 'Advanced risk scoring using deployer DNA, factory detection, and behavioral pattern analysis.',
    route: `/lineage/${EXAMPLE_MINT}`,
    color: '#EF4444',
  },
  {
    title: 'Family Tree',
    category: 'Lineage Visualization',
    description: 'Interactive graph mapping the complete family tree, exposing hidden relationships and derivative chains.',
    route: `/lineage/${EXAMPLE_MINT}`,
    color: '#8B5CF6',
  },
  {
    title: 'Cartel Detection',
    category: 'Deployer Networks',
    description: 'Identify clusters of wallets operating as coordinated bad actors deploying scam tokens.',
    route: '/compare',
    color: '#F59E0B',
  },
  {
    title: 'Sol Trace',
    category: 'Transaction Forensics',
    description: "Trace any token's complete on-chain footprint from genesis through current activity.",
    route: `/lineage/${EXAMPLE_MINT}`,
    color: '#06B6D4',
  },
];

const socialLinks = [
  { label: 'Twitter',  href: 'https://twitter.com/lineageagent' },
  { label: 'Telegram', href: 'https://t.me/lineageagent' },
  { label: 'GitHub',   href: 'https://github.com/lineageagent' },
];

/* ─────────────────────────────────────────────
   CSS
───────────────────────────────────────────── */

const css = `
  /* ── Root ── */
  .l-root {
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    background: #09090B;
    color: #FAFAFA;
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Background pattern ── */
  .l-bg-grid {
    background-image: radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px);
    background-size: 24px 24px;
  }

  /* ── Nav ── */
  .l-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    z-index: 100;
    background: rgba(9, 9, 11, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .l-nav-logo {
    font-weight: 600;
    font-size: 18px;
    color: #FAFAFA;
    text-decoration: none;
    letter-spacing: -0.48px;
  }
  .l-nav-center {
    display: flex;
    gap: 32px;
    align-items: center;
  }
  .l-nav-link {
    font-size: 14px;
    color: #71717A;
    text-decoration: none;
    transition: color 0.2s;
    letter-spacing: -0.2px;
  }
  .l-nav-link:hover { color: #FAFAFA; }
  .l-nav-connect {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 18px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 9px;
    color: #FAFAFA;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
    text-decoration: none;
    letter-spacing: -0.2px;
  }
  .l-nav-connect:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.18);
  }
  .l-nav-right {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .l-nav-burger {
    display: none;
    background: none;
    border: none;
    color: #A1A1AA;
    font-size: 20px;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }
  .l-mobile-menu {
    display: none;
    position: fixed;
    top: 64px;
    left: 0;
    right: 0;
    background: rgba(9,9,11,0.97);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    padding: 20px 24px;
    flex-direction: column;
    gap: 16px;
    z-index: 99;
  }
  .l-mobile-menu.open { display: flex; }
  @media (max-width: 768px) {
    .l-nav-center { display: none; }
    .l-nav-right .l-nav-connect { display: none; }
    .l-nav-burger { display: flex; align-items: center; }
  }

  /* ── Hero ── */
  .l-hero {
    position: relative;
    padding: 180px 24px 120px;
    max-width: 780px;
    margin: 0 auto;
    text-align: center;
  }
  .l-hero::before {
    content: '';
    position: absolute;
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%);
    pointer-events: none;
  }
  .l-hero-headline {
    position: relative;
    font-size: clamp(38px, 5.5vw, 64px);
    font-weight: 600;
    letter-spacing: -2.5px;
    line-height: 1.05;
    margin: 0 0 24px;
    background: linear-gradient(180deg, #FAFAFA 20%, #52525B 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: l-fadeInUp 0.8s ease both;
  }
  .l-hero-sub {
    position: relative;
    font-size: clamp(15px, 1.8vw, 17px);
    color: #71717A;
    line-height: 1.65;
    margin: 0 auto 44px;
    max-width: 480px;
    animation: l-fadeInUp 0.8s ease 0.1s both;
  }

  /* ── Hero search ── */
  .l-search-form {
    position: relative;
    display: flex;
    gap: 0;
    max-width: 520px;
    margin: 0 auto 16px;
    animation: l-fadeInUp 0.8s ease 0.2s both;
  }
  .l-search-input {
    flex: 1;
    height: 50px;
    padding: 0 18px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-right: none;
    border-radius: 12px 0 0 12px;
    color: #FAFAFA;
    font-size: 15px;
    outline: none;
    font-family: inherit;
    letter-spacing: -0.3px;
    transition: border-color 0.2s;
  }
  .l-search-input::placeholder { color: #3F3F46; }
  .l-search-input:focus { border-color: rgba(59,130,246,0.5); }
  .l-search-btn {
    height: 50px;
    padding: 0 24px;
    background: linear-gradient(135deg, #3B82F6, #6366F1);
    border: none;
    border-radius: 0 12px 12px 0;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: -0.3px;
    white-space: nowrap;
    transition: opacity 0.2s;
  }
  .l-search-btn:hover { opacity: 0.9; }
  .l-hero-hint {
    position: relative;
    font-size: 13px;
    color: #3F3F46;
    margin: 0;
    animation: l-fadeInUp 0.8s ease 0.3s both;
  }
  .l-hero-hint code {
    color: #52525B;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
  }

  /* ── Stat pills ── */
  .l-stat-pills {
    position: relative;
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 56px;
    flex-wrap: wrap;
    animation: l-fadeInUp 0.8s ease 0.4s both;
  }
  .l-stat-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 100px;
    font-size: 13px;
    color: #71717A;
    letter-spacing: -0.2px;
  }
  .l-stat-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ── Features ── */
  .l-features {
    padding: 100px 24px 80px;
    max-width: 1120px;
    margin: 0 auto;
  }
  .l-features-label {
    font-size: 13px;
    color: #3B82F6;
    text-transform: uppercase;
    letter-spacing: 2px;
    font-weight: 600;
    text-align: center;
    margin: 0 0 12px;
  }
  .l-features-title {
    font-size: clamp(24px, 3vw, 32px);
    font-weight: 600;
    letter-spacing: -1px;
    margin: 0 0 56px;
    text-align: center;
  }
  .l-features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  @media (max-width: 900px) {
    .l-features-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 560px) {
    .l-features-grid { grid-template-columns: 1fr; }
  }
  .l-feature-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 28px 24px;
    transition: all 0.3s ease;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .l-feature-card:hover {
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.12);
    transform: translateY(-2px);
  }
  .l-feature-dot {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .l-feature-dot-inner {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .l-feature-cat {
    font-size: 12px;
    color: #52525B;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0;
    font-weight: 500;
  }
  .l-feature-name {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.5px;
    margin: 0;
    color: #FAFAFA;
  }
  .l-feature-desc {
    font-size: 14px;
    color: #52525B;
    line-height: 1.6;
    margin: 0;
  }
  .l-feature-arrow {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: #3B82F6;
    margin-top: auto;
    padding-top: 4px;
    transition: gap 0.2s;
    font-weight: 500;
    letter-spacing: -0.2px;
  }
  .l-feature-card:hover .l-feature-arrow { gap: 8px; }

  /* ── Stats ── */
  .l-stats {
    padding: 80px 24px 100px;
    max-width: 1000px;
    margin: 0 auto;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .l-stats-heading {
    font-size: clamp(18px, 2.2vw, 24px);
    font-weight: 400;
    letter-spacing: -0.5px;
    line-height: 1.5;
    color: #71717A;
    margin: 0 0 64px;
    max-width: 520px;
  }
  .l-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 48px;
  }
  @media (max-width: 600px) {
    .l-stats-grid { grid-template-columns: 1fr; gap: 40px; }
  }
  .l-stat-value {
    font-size: clamp(48px, 7vw, 72px);
    font-weight: 600;
    letter-spacing: -3px;
    margin: 0 0 8px;
    line-height: 1;
    background: linear-gradient(135deg, #FAFAFA 0%, #71717A 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .l-stat-label {
    font-size: 14px;
    color: #3F3F46;
    line-height: 1.5;
    margin: 0;
    letter-spacing: -0.2px;
  }

  /* ── CTA ── */
  .l-cta {
    padding: 100px 24px;
    text-align: center;
    border-top: 1px solid rgba(255,255,255,0.06);
    position: relative;
  }
  .l-cta::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 500px;
    height: 300px;
    background: radial-gradient(ellipse, rgba(99,102,241,0.06) 0%, transparent 70%);
    pointer-events: none;
  }
  .l-cta-headline {
    position: relative;
    font-size: clamp(26px, 3.5vw, 40px);
    font-weight: 600;
    letter-spacing: -1.5px;
    margin: 0 0 14px;
  }
  .l-cta-sub {
    position: relative;
    font-size: 16px;
    color: #52525B;
    margin: 0 0 36px;
    letter-spacing: -0.2px;
  }
  .l-cta-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 14px 32px;
    background: linear-gradient(135deg, #3B82F6, #6366F1);
    border: none;
    border-radius: 12px;
    color: #fff;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: -0.3px;
    transition: opacity 0.2s, transform 0.2s;
    text-decoration: none;
  }
  .l-cta-btn:hover { opacity: 0.9; transform: translateY(-1px); }
  .l-cta-btn:active { transform: scale(0.99); }

  /* ── Footer ── */
  .l-footer {
    padding: 56px 24px 36px;
    border-top: 1px solid rgba(255,255,255,0.06);
    max-width: 1120px;
    margin: 0 auto;
  }
  .l-footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 48px;
    margin-bottom: 48px;
  }
  @media (max-width: 768px) {
    .l-footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  }
  @media (max-width: 480px) {
    .l-footer-grid { grid-template-columns: 1fr; gap: 24px; }
  }
  .l-footer-brand {
    font-size: 18px;
    font-weight: 600;
    color: #FAFAFA;
    letter-spacing: -0.48px;
    margin-bottom: 10px;
  }
  .l-footer-tagline {
    font-size: 14px;
    color: #3F3F46;
    line-height: 1.6;
    margin: 0;
    max-width: 260px;
  }
  .l-footer-heading {
    font-size: 12px;
    font-weight: 600;
    color: #52525B;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin: 0 0 16px;
  }
  .l-footer-link {
    display: block;
    font-size: 14px;
    color: #52525B;
    text-decoration: none;
    padding: 5px 0;
    transition: color 0.2s;
    letter-spacing: -0.2px;
  }
  .l-footer-link:hover { color: #FAFAFA; }
  .l-footer-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 24px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .l-footer-copy {
    font-size: 13px;
    color: #27272A;
    margin: 0;
    letter-spacing: -0.2px;
  }

  /* ── Scroll reveal ── */
  .l-reveal {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .l-reveal.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* ── Skeleton ── */
  .l-skeleton {
    background: rgba(255,255,255,0.04);
    border-radius: 8px;
    animation: l-pulse 1.5s ease infinite;
  }

  /* ── Animations ── */
  @keyframes l-fadeInUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes l-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @media (prefers-reduced-motion: reduce) {
    .l-hero-headline, .l-hero-sub, .l-search-form, .l-hero-hint, .l-stat-pills {
      animation: none !important;
    }
    .l-reveal { opacity: 1; transform: none; transition: none; }
    .l-skeleton { animation: none; }
  }
`;

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

export function LandingScreen() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [heroQuery, setHeroQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  /* Scroll reveal */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.1 },
    );
    document.querySelectorAll('.l-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* Fetch stats */
  useEffect(() => { getGlobalStats().then(setStats).catch(() => {}); }, []);

  /* Close mobile menu */
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <div className="l-root l-bg-grid">
      <style>{css}</style>

      {/* ── Nav ── */}
      <nav className="l-nav">
        <a href="/" className="l-nav-logo">Lineage</a>
        <div className="l-nav-center">
          <a href="#features" className="l-nav-link">Features</a>
          <a href="#stats" className="l-nav-link">Stats</a>
          <a href="#about" className="l-nav-link">About</a>
        </div>
        <div className="l-nav-right">
          <Link to="/auth" className="l-nav-connect">
            Connect
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </Link>
          <button className="l-nav-burger" aria-label="Open menu" aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>
            {menuOpen ? '\u2715' : '\u2630'}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <div className={`l-mobile-menu${menuOpen ? ' open' : ''}`} role="navigation" aria-label="Mobile navigation">
        <a href="#features" className="l-nav-link" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#stats" className="l-nav-link" onClick={() => setMenuOpen(false)}>Stats</a>
        <a href="#about" className="l-nav-link" onClick={() => setMenuOpen(false)}>About</a>
        <Link to="/auth" className="l-nav-connect" style={{ textAlign: 'center', justifyContent: 'center' }} onClick={() => setMenuOpen(false)}>Connect</Link>
      </div>

      {/* ── Hero ── */}
      <section className="l-hero">
        <h1 className="l-hero-headline">
          On-chain intelligence<br />for Solana tokens
        </h1>
        <p className="l-hero-sub">
          Track token lineage, detect rug pulls, and map deployer cartels across the entire Solana ecosystem in real time.
        </p>
        <form
          className="l-search-form"
          role="search"
          aria-label="Analyze a token"
          onSubmit={(e) => {
            e.preventDefault();
            const q = heroQuery.trim();
            if (q) navigate(`/lineage/${q}`);
          }}
        >
          <input
            type="search"
            className="l-search-input"
            value={heroQuery}
            onChange={(e) => setHeroQuery(e.target.value)}
            placeholder="Paste a token address to analyze..."
            aria-label="Token address"
          />
          <button type="submit" className="l-search-btn">Analyze</button>
        </form>
        <p className="l-hero-hint">
          Try: <code>{EXAMPLE_MINT}</code>
        </p>

        {/* Stat pills */}
        <div className="l-stat-pills">
          <div className="l-stat-pill">
            <div className="l-stat-dot" style={{ background: '#10B981' }} />
            {stats ? fmtStat(stats.total_scanned_all_time) : '\u2014'} tokens scanned
          </div>
          <div className="l-stat-pill">
            <div className="l-stat-dot" style={{ background: '#3B82F6' }} />
            {stats ? fmtStat(stats.active_deployers_24h) : '\u2014'} deployers tracked
          </div>
          <div className="l-stat-pill">
            <div className="l-stat-dot" style={{ background: '#EF4444' }} />
            {stats ? fmtStat(stats.rug_count_24h) : '\u2014'} rugs flagged
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="l-features">
        <p className="l-features-label l-reveal">Intelligence Suite</p>
        <h2 className="l-features-title l-reveal">Everything you need to stay safe on Solana</h2>
        <div className="l-features-grid">
          {features.map((f, i) => (
            <article
              key={i}
              className="l-feature-card l-reveal"
              onClick={() => navigate(f.route)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(f.route); }}
            >
              <div className="l-feature-dot" style={{ background: `${f.color}15` }}>
                <div className="l-feature-dot-inner" style={{ background: f.color }} />
              </div>
              <p className="l-feature-cat">{f.category}</p>
              <h3 className="l-feature-name">{f.title}</h3>
              <p className="l-feature-desc">{f.description}</p>
              <span className="l-feature-arrow">
                Explore <span>\u2192</span>
              </span>
            </article>
          ))}
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="stats" className="l-stats l-reveal">
        <p className="l-stats-heading">
          Lineage Agent delivers the on-chain intelligence that elevates your Solana strategy.
        </p>
        <div className="l-stats-grid">
          {[
            { val: stats?.total_scanned_all_time, label: 'Tokens analyzed across the Solana ecosystem' },
            { val: stats?.active_deployers_24h, label: 'Active deployers tracked in the last 24 hours' },
            { val: stats?.rug_count_24h, label: 'Rug attempts flagged in the last 24 hours' },
          ].map((s, i) => (
            <div key={i}>
              {stats === null ? (
                <div className="l-skeleton" style={{ height: 64, width: 140, marginBottom: 8 }} />
              ) : (
                <p className="l-stat-value">
                  <AnimatedStat value={s.val ?? 0} />
                </p>
              )}
              <p className="l-stat-label">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="about" className="l-cta l-reveal">
        <h2 className="l-cta-headline">Ready to protect your investments?</h2>
        <p className="l-cta-sub">Start scanning tokens for free. No wallet required.</p>
        <Link to="/search" className="l-cta-btn">
          Get Started <span>\u2192</span>
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="l-footer">
        <div className="l-footer-grid">
          <div>
            <div className="l-footer-brand">Lineage</div>
            <p className="l-footer-tagline">On-chain intelligence for the Solana ecosystem. Track, analyze, and protect.</p>
          </div>
          <div>
            <p className="l-footer-heading">Product</p>
            <Link to="/dashboard" className="l-footer-link">Dashboard</Link>
            <Link to="/search" className="l-footer-link">Analyze</Link>
            <Link to="/compare" className="l-footer-link">Compare</Link>
          </div>
          <div>
            <p className="l-footer-heading">Social</p>
            {socialLinks.map((s) => (
              <a key={s.label} href={s.href} className="l-footer-link" target="_blank" rel="noopener noreferrer">{s.label}</a>
            ))}
          </div>
          <div>
            <p className="l-footer-heading">Legal</p>
            <Link to="/privacy" className="l-footer-link">Privacy Policy</Link>
            <a href="mailto:hello@lineageagent.com" className="l-footer-link">Contact</a>
          </div>
        </div>
        <div className="l-footer-bottom">
          <p className="l-footer-copy">&copy; {new Date().getFullYear()} Lineage Agent. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
