import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate } from 'motion';
import { getGlobalStats } from '../lib/api';
import type { GlobalStats } from '../types/api';
import { Radar, ScanSearch, ShieldCheck, Network, Fingerprint, ScanEye, Apple, Play } from 'lucide-react';

/* ─── Animated counter ─── */
function AnimatedStat({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(value); return; }
    const c = animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: v => { el.textContent = fmt(Math.round(v)); }, onComplete: () => { el.textContent = fmt(value); } });
    return () => c.stop();
  }, [value]);
  return <span ref={ref}>{fmt(value)}</span>;
}

function fmt(n?: number): string {
  if (!n) return '\u2014';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/* ─── Data ─── */
const socialLinks = [
  { label: 'X / Twitter', href: 'https://x.com/LineageMemes' },
  { label: 'Telegram', href: 'https://t.me/lineageagent' },
  { label: 'Docs', href: 'https://lineage-4.gitbook.io/lineage-docs/' },
];


/* ═══════════════════════════════════════════
   CSS
═══════════════════════════════════════════ */

const css = `
  :root {
    /* solanamobile.com exact design tokens */
    --bg: #101618;                /* token-c13276b7 */
    --bg-deep: #010101;           /* token-72e936a6 */
    --bg-card: #10282c;           /* token-fa9894f1 */
    --accent: #cfe6e4;            /* token-f8c2dc16 */
    --accent-mid: #95d2e6;        /* token-773ba8cd */
    --accent-dim: #61afbd;        /* token-f69577af */
    --text: #f6f6f5;              /* token-d6fe9890 */
    --text-warm: #faf9f4;         /* token-1974720f */
    --text-muted: #99b3be;        /* token-2aa7c029 */
    --text-dim: #373c3e;          /* token-8a48a353 */
    --border: #373c3e;            /* SM card/section borders = solid #373c3e */
    --border-sep: #eeeeee;        /* SM separator lines = rgb(238,238,238) */
    --black: #010101;             /* SM button text black */
    --glow-sm: 0 0 9px #cfe6e4;
    --glow-lg: 0 0 20px #cfe6e4;
    --font: 'General Sans', 'Inter', system-ui, sans-serif;
    --r-card: 16px;
    --r-pill: 59px;
    --ease: cubic-bezier(.25,.46,.45,.94);
    --ease-spring: cubic-bezier(.175,.885,.32,1.1);
  }

  .sm-root {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    position: relative;
  }

  /* ── Film grain ── */
  .sm-root::after {
    content: '';
    position: fixed; inset: 0;
    opacity: .015;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 256px; pointer-events: none; z-index: 9999; mix-blend-mode: overlay;
  }
  .sm-root > * { position: relative; z-index: 1; }

  /* ── Ambient orbs ── */
  .sm-orb { position: fixed; border-radius: 50%; pointer-events: none; z-index: 0; }
  .sm-orb--1 {
    width: 600px; height: 600px; top: -15%; left: -10%;
    background: radial-gradient(circle, rgba(207,230,228,.08) 0%, transparent 70%);
    filter: blur(80px); animation: sm-orbit 25s ease-in-out infinite;
  }
  .sm-orb--2 {
    width: 500px; height: 500px; top: 40%; right: -15%;
    background: radial-gradient(circle, rgba(149,210,230,.06) 0%, transparent 70%);
    filter: blur(100px); animation: sm-orbit 30s ease-in-out infinite reverse;
  }

  .sm-container { max-width: 1200px; margin: 0 auto; padding: 0 32px; }
  @media (max-width: 640px) { .sm-container { padding: 0 20px; } }

  /* ══ NAV ══ */
  .sm-nav {
    position: fixed; top: 0; left: 0; right: 0; height: 72px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 40px; z-index: 100;
    background: rgba(16,22,24,.8);
    backdrop-filter: blur(24px) saturate(1.3);
    border-bottom: 1px solid var(--border);
    animation: sm-slideDown .6s var(--ease) both;
  }
  @media (max-width: 640px) { .sm-nav { padding: 0 20px; } }
  .sm-nav-logo {
    font-weight: 600; font-size: 22px; color: var(--text);
    text-decoration: none; letter-spacing: -.56px;
    display: flex; align-items: center; gap: 10px;
  }
  .sm-nav-logo-mark {
    width: 32px; height: 32px;
    background: var(--accent); border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: var(--bg); font-size: 15px; font-weight: 700;
    box-shadow: var(--glow-sm);
    animation: sm-glow 2s infinite alternate;
  }
  .sm-nav-links { display: flex; gap: 32px; align-items: center; }
  .sm-nav-link {
    font-size: 14px; font-weight: 400; color: var(--text-muted);
    text-decoration: none; transition: color .25s; letter-spacing: -.32px;
  }
  .sm-nav-link:hover { color: var(--accent); }
  .sm-nav-cta {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 28px;
    background: var(--accent); color: var(--black);
    border: 1px solid var(--accent); border-radius: var(--r-pill);
    font-size: 14px; font-weight: 400;
    cursor: pointer; text-decoration: none; letter-spacing: 0px;
    transition: all .3s var(--ease);
    box-shadow: var(--glow-sm);
  }
  .sm-nav-cta:hover { box-shadow: var(--glow-lg); transform: translateY(-1px); }
  .sm-nav-cta:active { transform: scale(.97); }
  .sm-nav-burger {
    display: none; background: none; border: none;
    color: var(--text-muted); font-size: 24px; cursor: pointer;
  }
  .sm-mobile-menu {
    display: none; position: fixed; top: 72px; left: 0; right: 0;
    background: rgba(16,22,24,.96); backdrop-filter: blur(24px);
    border-bottom: 1px solid var(--border);
    padding: 24px 40px; flex-direction: column; gap: 20px; z-index: 99;
  }
  .sm-mobile-menu.open { display: flex; }
  @media (max-width: 768px) {
    .sm-nav-links { display: none; }
    .sm-nav-burger { display: flex; align-items: center; }
  }

  /* ══ HERO ══ */
  .sm-hero {
    padding: 160px 0 100px;
    position: relative; overflow: hidden;
  }
  @media (max-width: 640px) { .sm-hero { padding: 130px 0 70px; } }
  .sm-hero-inner {
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .sm-hero-glow {
    position: absolute; top: -80px; left: 30%; width: 600px; height: 400px;
    background: radial-gradient(ellipse, rgba(207,230,228,.07) 0%, transparent 70%);
    filter: blur(60px); pointer-events: none;
    animation: sm-breathe 10s ease-in-out infinite;
  }

  /* Hero text */
  .sm-hero-word {
    display: inline-block;
    opacity: 0; filter: blur(8px); transform: translateY(16px);
    animation: sm-wordReveal .5s var(--ease) forwards;
  }
  .sm-hero-headline {
    font-size: clamp(34px, 5.5vw, 52px);
    font-weight: 600; letter-spacing: 0px; line-height: 110%;
    margin: 0 0 24px; color: var(--text-warm);
    text-wrap: balance;
  }
  .sm-hero-headline em { font-style: normal; color: var(--accent); }
  .sm-hero-sub {
    font-size: 16px; color: var(--text-muted);
    line-height: 150%; margin: 0 0 40px; max-width: 460px;
    letter-spacing: -.32px;
    opacity: 0; animation: sm-fadeUp .7s var(--ease) .6s forwards;
    text-wrap: pretty;
  }
  .sm-hero-sub { margin-left: auto; margin-right: auto; }
  .sm-hero-actions {
    display: flex; gap: 14px; flex-wrap: wrap; justify-content: center;
    opacity: 0; animation: sm-fadeUp .7s var(--ease) .8s forwards;
  }

  /* ══ BUTTONS ══ */
  .sm-btn {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 14px 32px; border-radius: var(--r-pill);
    font-size: 16px; font-weight: 400;
    cursor: pointer; text-decoration: none;
    letter-spacing: 0px; border: 1px solid var(--accent);
    transition: all .3s var(--ease);
  }
  .sm-btn:active { transform: scale(.97); transition: transform .1s; }
  .sm-btn--primary {
    background: var(--accent); color: var(--black);
    box-shadow: var(--glow-sm); animation: sm-glow 2s infinite alternate;
  }
  .sm-btn--primary:hover { box-shadow: var(--glow-lg); transform: translateY(-2px); }
  .sm-btn--ghost { background: transparent; color: var(--accent); }
  .sm-btn--ghost:hover { background: rgba(207,230,228,.06); box-shadow: var(--glow-sm); transform: translateY(-2px); }
  .sm-btn-stack { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }
  .sm-btn-sub { font-size: 10px; font-weight: 400; opacity: .6; text-transform: uppercase; letter-spacing: .1em; }

  /* ══ PROOF ══ */
  .sm-proof {
    padding: 48px 0 64px; text-align: center;
    border-bottom: 1px solid var(--border);
  }
  .sm-proof-label {
    font-size: 11px; font-weight: 500; color: var(--text-dim);
    text-transform: uppercase; letter-spacing: .15em; margin: 0 0 24px;
  }
  .sm-proof-logos { display: flex; justify-content: center; align-items: center; gap: 48px; flex-wrap: wrap; }
  .sm-proof-logo {
    font-size: 14px; font-weight: 500; color: var(--text-dim);
    letter-spacing: .06em; text-transform: uppercase;
    transition: all .4s;
  }
  .sm-proof-logo:hover { color: var(--accent); text-shadow: 0 0 12px rgba(207,230,228,.2); }

  /* ══ SECTIONS ══ */
  .sm-section { padding: 120px 0; position: relative; }
  .sm-section-label {
    font-size: 14px; font-weight: 400; color: var(--accent);
    text-transform: uppercase; letter-spacing: 1.08px;
    margin: 0 0 20px; text-align: center;
  }
  .sm-section-title {
    font-size: clamp(29px, 3.5vw, 42px);
    font-weight: 600; letter-spacing: 0px; line-height: 110%;
    margin: 0 0 72px; text-align: center; color: var(--text-warm);
    text-wrap: balance;
  }

  /* ══ CARDS ══ */
  .sm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  @media (max-width: 768px) { .sm-grid { grid-template-columns: 1fr; } }
  .sm-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--r-card);
    padding: 40px 28px 32px;
    transition: all .4s var(--ease-spring);
    position: relative; overflow: hidden;
  }
  .sm-card:hover {
    background: var(--bg-card); border-color: var(--accent);
    transform: translateY(-8px) scale(1.01);
    box-shadow: 0 20px 60px rgba(0,0,0,.3), var(--glow-sm);
  }
  .sm-card:active { transform: translateY(-4px) scale(.99); transition: transform .15s; }

  .sm-card-icon {
    width: 56px; height: 56px;
    background: rgba(207,230,228,.06);
    border: 1px solid var(--border);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 24px;
    color: var(--accent);
    transition: all .4s var(--ease-spring);
  }
  .sm-card:hover .sm-card-icon {
    background: rgba(207,230,228,.1);
    border-color: var(--accent);
    box-shadow: var(--glow-sm);
    transform: scale(1.08);
  }
  .sm-card-title {
    font-size: 22px; font-weight: 600; color: var(--text-warm);
    margin: 0 0 12px; letter-spacing: -.56px; line-height: 120%;
  }
  .sm-card-desc {
    font-size: 16px; color: var(--text-muted); line-height: 150%;
    margin: 0; letter-spacing: -.32px;
  }

  /* ══ VALUES ══ */
  .sm-values { border-top: 1px solid var(--border); }
  .sm-values-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 48px; text-align: center;
  }
  @media (max-width: 768px) { .sm-values-grid { grid-template-columns: 1fr; gap: 40px; } }
  .sm-value-icon {
    width: 80px; height: 80px;
    border-radius: 20px;
    background: rgba(207,230,228,.04);
    border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 24px;
    color: var(--accent);
    transition: all .4s var(--ease-spring);
  }
  .sm-value-item:hover .sm-value-icon {
    background: rgba(207,230,228,.08);
    border-color: var(--accent);
    box-shadow: var(--glow-lg);
    transform: translateY(-6px) scale(1.06);
  }
  .sm-value-title {
    font-size: 22px; font-weight: 600; color: var(--text-warm);
    margin: 0 0 10px; letter-spacing: -.56px;
  }
  .sm-value-desc {
    font-size: 16px; color: var(--text-muted); line-height: 150%;
    margin: 0; max-width: 300px; margin-left: auto; margin-right: auto;
    letter-spacing: -.32px;
  }

  /* ══ STATS ══ */
  .sm-stats {
    padding: 100px 0; background: var(--bg-deep);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    position: relative;
  }
  .sm-stats-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 48px; text-align: center;
  }
  @media (max-width: 600px) { .sm-stats-grid { grid-template-columns: 1fr; gap: 40px; } }
  .sm-stat-value {
    font-size: clamp(42px, 7vw, 64px);
    font-weight: 600; letter-spacing: 0px; line-height: 110%;
    margin: 0 0 12px; color: var(--accent);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 40px rgba(207,230,228,.15);
  }
  .sm-stat-label {
    font-size: 16px; color: var(--text-muted);
    letter-spacing: -.32px; line-height: 150%; margin: 0;
  }
  .sm-skeleton {
    background: rgba(207,230,228,.06); border-radius: 8px;
    animation: sm-pulse 2s ease infinite; display: inline-block;
  }

  /* ══ CTA ══ */
  .sm-cta {
    padding: 140px 0; text-align: center; position: relative; overflow: hidden;
  }
  .sm-cta-glow {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 700px; height: 400px;
    background: radial-gradient(ellipse, rgba(207,230,228,.06) 0%, transparent 70%);
    filter: blur(80px); pointer-events: none;
    animation: sm-breathe 12s ease-in-out infinite;
  }
  .sm-cta-headline {
    position: relative; font-size: clamp(29px, 4vw, 42px);
    font-weight: 600; letter-spacing: 0px; margin: 0 0 20px;
    color: var(--text-warm); line-height: 110%; text-wrap: balance;
  }
  .sm-cta-sub {
    position: relative; font-size: 16px; color: var(--text-muted);
    margin: 0 0 44px; letter-spacing: -.32px; line-height: 150%;
    text-wrap: pretty;
  }
  .sm-cta-actions {
    position: relative; display: flex; gap: 14px;
    justify-content: center; flex-wrap: wrap;
  }

  /* ══ FOOTER ══ */
  .sm-footer { padding: 56px 0 36px; border-top: 1px solid var(--border); }
  .sm-footer-grid {
    display: grid; grid-template-columns: 2fr 1fr 1fr;
    gap: 48px; margin-bottom: 48px;
  }
  @media (max-width: 768px) { .sm-footer-grid { grid-template-columns: 1fr; gap: 28px; } }
  .sm-footer-brand {
    font-size: 22px; font-weight: 600; color: var(--text);
    letter-spacing: -.56px; margin: 0 0 12px;
    display: flex; align-items: center; gap: 10px;
  }
  .sm-footer-tagline {
    font-size: 16px; color: var(--text-muted); line-height: 150%;
    margin: 0; max-width: 320px; letter-spacing: -.32px;
  }
  .sm-footer-heading {
    font-size: 14px; font-weight: 400; color: var(--accent);
    text-transform: uppercase; letter-spacing: 1.08px; margin: 0 0 16px;
  }
  .sm-footer-link {
    display: block; font-size: 16px; color: var(--text-muted);
    text-decoration: none; padding: 5px 0; transition: color .25s;
    letter-spacing: -.32px;
  }
  .sm-footer-link:hover { color: var(--accent); }
  .sm-footer-bottom {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 20px; border-top: 1px solid var(--border);
    flex-wrap: wrap; gap: 12px;
  }
  .sm-footer-copy { font-size: 14px; color: var(--text-muted); margin: 0; letter-spacing: -.32px; }
  .sm-footer-socials { display: flex; gap: 16px; }
  .sm-footer-social {
    font-size: 14px; color: var(--text-muted);
    text-decoration: none; transition: color .25s; letter-spacing: -.32px;
  }
  .sm-footer-social:hover { color: var(--accent); }

  /* ══ SCROLL REVEAL ══ */
  .sm-reveal {
    opacity: 0; transform: translateY(32px); filter: blur(4px);
    transition: opacity .7s var(--ease), transform .7s var(--ease), filter .7s var(--ease);
  }
  .sm-reveal.is-visible { opacity: 1; transform: translateY(0); filter: blur(0); }
  .sm-stagger .sm-reveal:nth-child(1) { transition-delay: 0ms; }
  .sm-stagger .sm-reveal:nth-child(2) { transition-delay: 150ms; }
  .sm-stagger .sm-reveal:nth-child(3) { transition-delay: 300ms; }

  /* ══ KEYFRAMES ══ */
  @keyframes sm-glow {
    from { box-shadow: 0 0 9px rgba(207,230,228,.4); }
    to { box-shadow: 0 0 20px rgba(207,230,228,.6); }
  }
  @keyframes sm-slideDown {
    from { opacity: 0; transform: translateY(-16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes sm-fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes sm-wordReveal {
    to { opacity: 1; filter: blur(0); transform: translateY(0); }
  }
  @keyframes sm-fadeIn {
    to { opacity: 1; }
  }
  @keyframes sm-breathe {
    0%, 100% { opacity: .8; transform: translateX(-50%) scale(1); }
    50% { opacity: 1; transform: translateX(-50%) scale(1.08); }
  }
  @keyframes sm-orbit {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(30px, 20px) scale(1.04); }
    66% { transform: translate(-20px, 30px) scale(.97); }
  }
  @keyframes sm-pulse {
    0%, 100% { opacity: 1; } 50% { opacity: .3; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
    .sm-reveal { opacity: 1; transform: none; filter: none; }
    .sm-hero-word { opacity: 1; filter: none; transform: none; }
    .sm-hero-sub, .sm-hero-actions { opacity: 1; }
  }
`;

/* ─── Word-by-word reveal ─── */
function HeroWords({ text, baseDelay = 0 }: { text: string; baseDelay?: number }) {
  const words = text.split(' ');
  return <>{words.map((w, i) => (
    <span key={i}>
      <span className="sm-hero-word" style={{ animationDelay: `${baseDelay + i * 80}ms` }}>{w}</span>
      {i < words.length - 1 && '\u00A0'}
    </span>
  ))}</>;
}

/* ═══════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════ */

export function LandingScreen() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    document.querySelectorAll('.sm-reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => { getGlobalStats().then(setStats).catch(() => {}); }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <div className="sm-root">
      <style>{css}</style>

      {/* Background */}
      <div className="sm-orb sm-orb--1" aria-hidden="true" />
      <div className="sm-orb sm-orb--2" aria-hidden="true" />

      {/* Nav */}
      <nav className="sm-nav">
        <a href="/" className="sm-nav-logo">
          <span className="sm-nav-logo-mark">L</span>
          Lineage
        </a>
        <div className="sm-nav-links">
          <a href="#how" className="sm-nav-link">How it works</a>
          <a href="#stats" className="sm-nav-link">Stats</a>
          <a href="#download" className="sm-nav-cta">Download App</a>
        </div>
        <button className="sm-nav-burger" aria-label="Open menu" aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}>
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
      </nav>

      <div className={`sm-mobile-menu${menuOpen ? ' open' : ''}`} role="navigation" aria-label="Mobile navigation">
        <a href="#how" className="sm-nav-link" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#stats" className="sm-nav-link" onClick={() => setMenuOpen(false)}>Stats</a>
        <a href="#download" className="sm-nav-cta" style={{ justifyContent: 'center' }} onClick={() => setMenuOpen(false)}>Download App</a>
      </div>

      {/* Hero */}
      <section className="sm-hero">
        <div className="sm-hero-glow" aria-hidden="true" />
        <div className="sm-container">
          <div className="sm-hero-inner">
            <div>
              <h1 className="sm-hero-headline">
                <HeroWords text="Stop buying" baseDelay={100} /><br />
                <em><HeroWords text="someone else's exit" baseDelay={300} /></em>
              </h1>
              <p className="sm-hero-sub">
                That token you're about to ape? It might be clone #47 from the same dev who rugged you last week. We check so you don't have to.
              </p>
              <div className="sm-hero-actions">
                <a href="#download" className="sm-btn sm-btn--primary">
                  <Apple size={20} />
                  <span className="sm-btn-stack">
                    <span className="sm-btn-sub">Download on the</span>App Store
                  </span>
                </a>
                <a href="#download" className="sm-btn sm-btn--ghost">
                  <Play size={20} />
                  <span className="sm-btn-stack">
                    <span className="sm-btn-sub">Get it on</span>Google Play
                  </span>
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Proof */}
      <section className="sm-proof sm-reveal">
        <div className="sm-container">
          <p className="sm-proof-label">Powered by</p>
          <div className="sm-proof-logos">
            <span className="sm-proof-logo">Solana</span>
            <span className="sm-proof-logo">Helius</span>
            <span className="sm-proof-logo">Jupiter</span>
            <span className="sm-proof-logo">Birdeye</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="sm-section">
        <div className="sm-container">
          <p className="sm-section-label sm-reveal">How it works</p>
          <h2 className="sm-section-title sm-reveal">DYOR but actually do it this time</h2>
          <div className="sm-grid sm-stagger">
            {[
              { icon: <ScanSearch size={28} />, title: 'Paste. Scan. Know.', desc: 'Drop a contract address. In seconds, we tell you if it\'s the OG or just another copycat riding the hype.' },
              { icon: <Network size={28} />, title: 'See who\'s behind it', desc: 'Full deployer family tree. Every clone, every fork, every wallet connection \u2014 exposed like a group chat screenshot.' },
              { icon: <ShieldCheck size={28} />, title: 'Don\'t get rugged', desc: 'Real-time rug alerts before your bag goes to zero. We catch the cartel wallets so you don\'t have to.' },
            ].map((item, i) => (
              <article key={i} className="sm-card sm-reveal">
                <div className="sm-card-icon">{item.icon}</div>
                <h3 className="sm-card-title">{item.title}</h3>
                <p className="sm-card-desc">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="sm-section sm-values">
        <div className="sm-container">
          <p className="sm-section-label sm-reveal">Why Lineage</p>
          <h2 className="sm-section-title sm-reveal">Because "trust me bro" is not a strategy</h2>
          <div className="sm-values-grid sm-stagger">
            <div className="sm-value-item sm-reveal">
              <div className="sm-value-icon"><ScanSearch size={28} /></div>
              <h3 className="sm-value-title">Clone radar</h3>
              <p className="sm-value-desc">Same dev, new ticker, same rug. We spot copypaste tokens before your portfolio finds out the hard way.</p>
            </div>
            <div className="sm-value-item sm-reveal">
              <div className="sm-value-icon"><Network size={28} /></div>
              <h3 className="sm-value-title">Deployer exposed</h3>
              <p className="sm-value-desc">See every wallet, every fork, every connection. It's like a background check but for degens who move fast.</p>
            </div>
            <div className="sm-value-item sm-reveal">
              <div className="sm-value-icon"><ShieldCheck size={28} /></div>
              <h3 className="sm-value-title">Rug-proof your bag</h3>
              <p className="sm-value-desc">Alerts hit your phone before the dev hits the liquidity. Cartel wallets flagged. No more surprise -99%.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="sm-stats">
        <div className="sm-container">
          <div className="sm-stats-grid sm-reveal">
            {[
              { val: stats?.total_scanned_all_time, label: 'Tokens scanned (and counting)' },
              { val: stats?.active_deployers_24h, label: 'Deployers under the microscope' },
              { val: stats?.rug_count_24h, label: 'Rugs caught in the last 24h' },
            ].map((s, i) => (
              <div key={i}>
                {stats === null ? (
                  <div className="sm-skeleton" style={{ height: 56, width: 120, marginBottom: 10 }} />
                ) : (
                  <p className="sm-stat-value"><AnimatedStat value={s.val ?? 0} /></p>
                )}
                <p className="sm-stat-label">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="download" className="sm-cta">
        <div className="sm-cta-glow" aria-hidden="true" />
        <div className="sm-container">
          <h2 className="sm-cta-headline sm-reveal">Your next ape deserves a second opinion</h2>
          <p className="sm-cta-sub sm-reveal">Free. No wallet connect. No signup. Just download and stop getting played.</p>
          <div className="sm-cta-actions sm-reveal">
            <a href="#download" className="sm-btn sm-btn--primary">
              <Apple size={20} />
              <span className="sm-btn-stack"><span className="sm-btn-sub">Download on the</span>App Store</span>
            </a>
            <a href="#download" className="sm-btn sm-btn--ghost">
              <Play size={20} />
              <span className="sm-btn-stack"><span className="sm-btn-sub">Get it on</span>Google Play</span>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="sm-footer">
        <div className="sm-container">
          <div className="sm-footer-grid">
            <div>
              <div className="sm-footer-brand">
                <span className="sm-nav-logo-mark" style={{ width: 26, height: 26, fontSize: 13, borderRadius: 8 }}>L</span>
                Lineage Agent
              </div>
              <p className="sm-footer-tagline">On-chain intel for degens who'd rather not get rugged. Again.</p>
            </div>
            <div>
              <p className="sm-footer-heading">Community</p>
              {socialLinks.map(s => (
                <a key={s.label} href={s.href} className="sm-footer-link" target="_blank" rel="noopener noreferrer">{s.label}</a>
              ))}
            </div>
            <div>
              <p className="sm-footer-heading">Legal</p>
              <Link to="/privacy" className="sm-footer-link">Privacy Policy</Link>
              <a href="mailto:hello@lineageagent.com" className="sm-footer-link">Contact</a>
            </div>
          </div>
          <div className="sm-footer-bottom">
            <p className="sm-footer-copy">&copy; {new Date().getFullYear()} Lineage Agent</p>
            <div className="sm-footer-socials">
              {socialLinks.map(s => (
                <a key={s.label} href={s.href} className="sm-footer-social" target="_blank" rel="noopener noreferrer">{s.label}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
