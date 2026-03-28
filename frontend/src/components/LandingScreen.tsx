import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate } from 'motion';
import { getGlobalStats } from '../lib/api';
import type { GlobalStats } from '../types/api';

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

/* ─── Icons ─── */
function IconArrow({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
}
function IconShield() { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>; }
function IconSearch() { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IconGitBranch() { return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>; }
function IconApple() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>; }
function IconPlay() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15C4.34,1.91 4.93,1.97 5.38,2.29L21.38,12.29C21.75,12.55 22,12.96 22,13.41V13.59C22,14.04 21.75,14.45 21.38,14.71L5.38,21.71C4.93,22.03 4.34,22.09 3.84,21.85C3.34,21.61 3,21.09 3,20.5Z"/></svg>; }

/* ═══════════════════════════════════════════
   CSS — Solana Mobile design system replica
   Palette: #101618 bg, #f6f6f5 text, #cfe6e4 accent
   Fonts: General Sans (display) + Inter (body)
   Border-radius: 16px cards, 30px buttons
   Glow: pulseGlow #cfe6e4
═══════════════════════════════════════════ */

const css = `
  :root {
    --bg: #101618;
    --bg-deep: #020101;
    --bg-card: #10282c;
    --bg-card-hover: #162e33;
    --accent: #cfe6e4;
    --accent-mid: #95d2e6;
    --accent-dim: #61afbd;
    --text: #f6f6f5;
    --text-warm: #faf9f4;
    --text-muted: #99b3be;
    --text-dim: #373c3e;
    --font-display: 'General Sans', 'Inter', system-ui, sans-serif;
    --font-body: 'Inter', system-ui, -apple-system, sans-serif;
    --r-card: 16px;
    --r-btn: 30px;
    --ease: cubic-bezier(.25,.46,.45,.94);
    --ease-spring: cubic-bezier(.175,.885,.32,1.1);
  }

  /* ── Root ── */
  .sm-root {
    font-family: var(--font-body);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-weight: 400;
    font-optical-sizing: auto;
  }

  .sm-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
  }
  @media (max-width: 640px) { .sm-container { padding: 0 20px; } }

  /* ── Nav ── */
  .sm-nav {
    position: fixed; top: 0; left: 0; right: 0;
    height: 72px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 40px;
    z-index: 100;
    background: rgba(16,22,24,0.8);
    backdrop-filter: blur(24px) saturate(1.3);
    -webkit-backdrop-filter: blur(24px) saturate(1.3);
    border-bottom: 1px solid rgba(207,230,228,0.06);
    animation: sm-slideDown .6s var(--ease) both;
  }
  @media (max-width: 640px) { .sm-nav { padding: 0 20px; } }

  .sm-nav-logo {
    font-family: var(--font-display);
    font-weight: 600; font-size: 20px;
    color: var(--text); text-decoration: none;
    letter-spacing: -.48px;
    display: flex; align-items: center; gap: 10px;
  }
  .sm-nav-logo-mark {
    width: 32px; height: 32px;
    background: var(--accent);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: var(--bg); font-size: 15px; font-weight: 700;
    box-shadow: 0 0 16px rgba(207,230,228,0.25);
  }
  .sm-nav-links { display: flex; gap: 32px; align-items: center; }
  .sm-nav-link {
    font-size: 14px; font-weight: 500;
    color: var(--text-muted); text-decoration: none;
    transition: color .25s; letter-spacing: -.28px;
  }
  .sm-nav-link:hover { color: var(--text); }
  .sm-nav-cta {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 24px;
    background: var(--accent); color: var(--bg);
    border: none; border-radius: var(--r-btn);
    font-family: var(--font-display);
    font-size: 14px; font-weight: 600;
    cursor: pointer; text-decoration: none;
    letter-spacing: -.28px;
    transition: all .3s var(--ease);
    box-shadow: 0 0 12px rgba(207,230,228,0.2);
  }
  .sm-nav-cta:hover {
    box-shadow: 0 0 24px rgba(207,230,228,0.35);
    transform: translateY(-1px);
  }
  .sm-nav-cta:active { transform: scale(.97); }
  .sm-nav-burger {
    display: none; background: none; border: none;
    color: var(--text-muted); font-size: 24px; cursor: pointer;
  }
  .sm-mobile-menu {
    display: none; position: fixed; top: 72px; left: 0; right: 0;
    background: rgba(16,22,24,0.96);
    backdrop-filter: blur(24px);
    border-bottom: 1px solid rgba(207,230,228,0.06);
    padding: 24px 40px; flex-direction: column; gap: 20px; z-index: 99;
  }
  .sm-mobile-menu.open { display: flex; }
  @media (max-width: 768px) {
    .sm-nav-links { display: none; }
    .sm-nav-burger { display: flex; align-items: center; }
  }

  /* ── Hero ── */
  .sm-hero {
    padding: 180px 0 120px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  @media (max-width: 640px) { .sm-hero { padding: 140px 0 80px; } }
  .sm-hero-glow {
    position: absolute;
    top: -100px; left: 50%; transform: translateX(-50%);
    width: 800px; height: 500px;
    background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(207,230,228,0.08) 0%, transparent 70%);
    filter: blur(60px);
    pointer-events: none;
    animation: sm-breathe 10s ease-in-out infinite;
  }
  .sm-hero-label {
    position: relative;
    font-family: var(--font-body);
    font-size: 12px; font-weight: 500;
    color: var(--accent);
    text-transform: uppercase; letter-spacing: .12em;
    margin: 0 0 24px;
    animation: sm-fadeUp .7s var(--ease) .1s both;
  }
  .sm-hero-headline {
    position: relative;
    font-family: var(--font-display);
    font-size: clamp(36px, 6vw, 64px);
    font-weight: 600;
    letter-spacing: -.64px;
    line-height: 110%;
    margin: 0 0 24px;
    color: var(--text-warm);
    animation: sm-fadeUp .7s var(--ease) .2s both;
    text-wrap: balance;
  }
  .sm-hero-headline em {
    font-style: normal;
    color: var(--accent);
  }
  .sm-hero-sub {
    position: relative;
    font-size: clamp(16px, 1.6vw, 18px);
    color: var(--text-muted);
    line-height: 150%;
    margin: 0 auto 48px;
    max-width: 520px;
    letter-spacing: -.32px;
    animation: sm-fadeUp .7s var(--ease) .35s both;
    text-wrap: pretty;
  }
  .sm-hero-actions {
    position: relative;
    display: flex; gap: 14px;
    justify-content: center; flex-wrap: wrap;
    animation: sm-fadeUp .7s var(--ease) .5s both;
  }

  /* ── Buttons ── */
  .sm-btn {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 16px 32px;
    border-radius: var(--r-btn);
    font-family: var(--font-display);
    font-size: 16px; font-weight: 600;
    cursor: pointer; text-decoration: none;
    letter-spacing: -.32px; border: none;
    transition: all .3s var(--ease);
  }
  .sm-btn:active { transform: scale(.97); transition: transform .1s; }
  .sm-btn--primary {
    background: var(--accent); color: var(--bg);
    box-shadow: 0 0 16px rgba(207,230,228,0.2);
  }
  .sm-btn--primary:hover {
    box-shadow: 0 0 32px rgba(207,230,228,0.35);
    transform: translateY(-2px);
  }
  .sm-btn--ghost {
    background: transparent; color: var(--text);
    border: 1px solid rgba(207,230,228,0.15);
  }
  .sm-btn--ghost:hover {
    border-color: rgba(207,230,228,0.3);
    background: rgba(207,230,228,0.04);
    transform: translateY(-2px);
  }
  .sm-btn-sub {
    font-size: 10px; font-weight: 400;
    opacity: .6; text-transform: uppercase;
    letter-spacing: .1em; display: block;
  }
  .sm-btn-stack { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }

  /* ── Proof ── */
  .sm-proof {
    padding: 48px 0 64px;
    text-align: center;
    border-bottom: 1px solid rgba(207,230,228,0.06);
  }
  .sm-proof-label {
    font-size: 11px; font-weight: 500;
    color: var(--text-dim); text-transform: uppercase;
    letter-spacing: .15em; margin: 0 0 24px;
  }
  .sm-proof-logos {
    display: flex; justify-content: center; align-items: center;
    gap: 48px; flex-wrap: wrap;
  }
  .sm-proof-logo {
    font-family: var(--font-display);
    font-size: 14px; font-weight: 500;
    color: var(--text-dim); letter-spacing: .06em;
    text-transform: uppercase;
    transition: color .3s;
  }
  .sm-proof-logo:hover { color: var(--text-muted); }

  /* ── Section shared ── */
  .sm-section { padding: 120px 0; position: relative; }
  .sm-section-label {
    font-family: var(--font-body);
    font-size: 12px; font-weight: 500;
    color: var(--accent); text-transform: uppercase;
    letter-spacing: .12em; margin: 0 0 16px;
    text-align: center;
  }
  .sm-section-title {
    font-family: var(--font-display);
    font-size: clamp(28px, 3.5vw, 42px);
    font-weight: 600; letter-spacing: -.56px;
    line-height: 120%; margin: 0 0 64px;
    text-align: center; color: var(--text-warm);
    text-wrap: balance;
  }

  /* ── Cards grid ── */
  .sm-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  }
  @media (max-width: 768px) { .sm-grid { grid-template-columns: 1fr; } }

  .sm-card {
    background: var(--bg-card);
    border: 1px solid rgba(207,230,228,0.05);
    border-radius: var(--r-card);
    padding: 40px 28px 32px;
    transition: all .4s var(--ease-spring);
    position: relative; overflow: hidden;
  }
  .sm-card::after {
    content: ''; position: absolute;
    top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(207,230,228,0.12), transparent);
    opacity: 0; transition: opacity .4s;
  }
  .sm-card:hover {
    background: var(--bg-card-hover);
    border-color: rgba(207,230,228,0.1);
    transform: translateY(-6px);
    box-shadow: 0 16px 48px rgba(0,0,0,0.3);
  }
  .sm-card:hover::after { opacity: 1; }

  .sm-card-step {
    font-family: var(--font-display);
    font-size: 52px; font-weight: 600;
    color: rgba(207,230,228,0.08);
    line-height: 1; margin: 0 0 20px;
    letter-spacing: -.04em;
    transition: color .4s;
  }
  .sm-card:hover .sm-card-step { color: rgba(207,230,228,0.18); }

  .sm-card-title {
    font-family: var(--font-display);
    font-size: 20px; font-weight: 600;
    color: var(--text-warm); margin: 0 0 10px;
    letter-spacing: -.36px; line-height: 120%;
  }
  .sm-card-desc {
    font-size: 15px; color: var(--text-muted);
    line-height: 150%; margin: 0;
    letter-spacing: -.28px;
  }

  /* ── Value props ── */
  .sm-values { border-top: 1px solid rgba(207,230,228,0.06); }
  .sm-values-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 48px; text-align: center;
  }
  @media (max-width: 768px) { .sm-values-grid { grid-template-columns: 1fr; gap: 40px; } }

  .sm-value-icon {
    width: 64px; height: 64px;
    border-radius: var(--r-card);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
    color: var(--bg);
    background: var(--accent);
    box-shadow: 0 0 20px rgba(207,230,228,0.15);
    transition: all .4s var(--ease-spring);
  }
  .sm-value-item:hover .sm-value-icon {
    transform: translateY(-4px) scale(1.06);
    box-shadow: 0 0 32px rgba(207,230,228,0.3);
  }
  .sm-value-title {
    font-family: var(--font-display);
    font-size: 20px; font-weight: 600;
    color: var(--text-warm); margin: 0 0 10px;
    letter-spacing: -.36px;
  }
  .sm-value-desc {
    font-size: 15px; color: var(--text-muted);
    line-height: 150%; margin: 0;
    max-width: 300px; margin-left: auto; margin-right: auto;
    letter-spacing: -.28px;
  }

  /* ── Stats ── */
  .sm-stats {
    padding: 100px 0;
    background: var(--bg-deep);
    border-top: 1px solid rgba(207,230,228,0.06);
    border-bottom: 1px solid rgba(207,230,228,0.06);
    position: relative;
  }
  .sm-stats::before {
    content: ''; position: absolute;
    top: -1px; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent 10%, rgba(207,230,228,0.15) 50%, transparent 90%);
  }
  .sm-stats-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 48px; text-align: center;
  }
  @media (max-width: 600px) { .sm-stats-grid { grid-template-columns: 1fr; gap: 40px; } }

  .sm-stat-value {
    font-family: var(--font-display);
    font-size: clamp(48px, 7vw, 72px);
    font-weight: 600; letter-spacing: -.04em;
    line-height: 100%; margin: 0 0 12px;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .sm-stat-label {
    font-size: 14px; color: var(--text-muted);
    letter-spacing: -.28px; margin: 0;
  }
  .sm-skeleton {
    background: rgba(207,230,228,0.06);
    border-radius: 8px;
    animation: sm-pulse 2s ease infinite;
    display: inline-block;
  }

  /* ── CTA ── */
  .sm-cta {
    padding: 140px 0;
    text-align: center; position: relative;
    overflow: hidden;
  }
  .sm-cta-glow {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 700px; height: 400px;
    background: radial-gradient(ellipse, rgba(207,230,228,0.06) 0%, transparent 70%);
    filter: blur(80px); pointer-events: none;
    animation: sm-breathe 12s ease-in-out infinite;
  }
  .sm-cta-headline {
    position: relative;
    font-family: var(--font-display);
    font-size: clamp(30px, 4vw, 52px);
    font-weight: 600; letter-spacing: -.56px;
    margin: 0 0 16px; color: var(--text-warm);
    line-height: 110%; text-wrap: balance;
  }
  .sm-cta-sub {
    position: relative;
    font-size: 17px; color: var(--text-muted);
    margin: 0 0 44px; letter-spacing: -.32px;
    text-wrap: pretty;
  }
  .sm-cta-actions {
    position: relative;
    display: flex; gap: 14px;
    justify-content: center; flex-wrap: wrap;
  }

  /* ── Footer ── */
  .sm-footer {
    padding: 56px 0 36px;
    border-top: 1px solid rgba(207,230,228,0.06);
  }
  .sm-footer-grid {
    display: grid; grid-template-columns: 2fr 1fr 1fr;
    gap: 48px; margin-bottom: 48px;
  }
  @media (max-width: 768px) { .sm-footer-grid { grid-template-columns: 1fr; gap: 28px; } }

  .sm-footer-brand {
    font-family: var(--font-display);
    font-size: 18px; font-weight: 600;
    color: var(--text); letter-spacing: -.48px;
    margin: 0 0 10px;
    display: flex; align-items: center; gap: 10px;
  }
  .sm-footer-tagline {
    font-size: 14px; color: var(--text-dim);
    line-height: 150%; margin: 0; max-width: 280px;
    letter-spacing: -.28px;
  }
  .sm-footer-heading {
    font-family: var(--font-body);
    font-size: 11px; font-weight: 600;
    color: var(--text-dim); text-transform: uppercase;
    letter-spacing: .1em; margin: 0 0 14px;
  }
  .sm-footer-link {
    display: block; font-size: 14px;
    color: var(--text-muted); text-decoration: none;
    padding: 4px 0; transition: color .25s;
    letter-spacing: -.28px;
  }
  .sm-footer-link:hover { color: var(--accent); }
  .sm-footer-bottom {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 20px;
    border-top: 1px solid rgba(207,230,228,0.06);
    flex-wrap: wrap; gap: 12px;
  }
  .sm-footer-copy {
    font-size: 12px; color: var(--text-dim); margin: 0;
  }
  .sm-footer-socials { display: flex; gap: 16px; }
  .sm-footer-social {
    font-size: 13px; color: var(--text-dim);
    text-decoration: none; transition: color .25s;
  }
  .sm-footer-social:hover { color: var(--accent); }

  /* ── Scroll reveal ── */
  .sm-reveal {
    opacity: 0; transform: translateY(32px);
    transition: opacity .7s var(--ease), transform .7s var(--ease);
  }
  .sm-reveal.is-visible { opacity: 1; transform: translateY(0); }
  .sm-stagger .sm-reveal:nth-child(1) { transition-delay: 0ms; }
  .sm-stagger .sm-reveal:nth-child(2) { transition-delay: 120ms; }
  .sm-stagger .sm-reveal:nth-child(3) { transition-delay: 240ms; }

  /* ── Glow pulse (solanamobile signature) ── */
  @keyframes sm-glow {
    from { box-shadow: 0 0 9px rgba(207,230,228,0.4); }
    to { box-shadow: 0 0 20px rgba(207,230,228,0.6); }
  }

  /* ── Keyframes ── */
  @keyframes sm-slideDown {
    from { opacity: 0; transform: translateY(-16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes sm-fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes sm-breathe {
    0%, 100% { opacity: .8; transform: translateX(-50%) scale(1); }
    50% { opacity: 1; transform: translateX(-50%) scale(1.08); }
  }
  @keyframes sm-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .3; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
    .sm-reveal { opacity: 1; transform: none; }
  }
`;

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

      {/* ── Nav ── */}
      <nav className="sm-nav">
        <a href="/" className="sm-nav-logo">
          <span className="sm-nav-logo-mark">L</span>
          Lineage
        </a>
        <div className="sm-nav-links">
          <a href="#how" className="sm-nav-link">How it works</a>
          <a href="#stats" className="sm-nav-link">Stats</a>
          <a href="#download" className="sm-nav-cta">
            Download App
          </a>
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

      {/* ── Hero ── */}
      <section className="sm-hero">
        <div className="sm-hero-glow" aria-hidden="true" />
        <div className="sm-container">
          <p className="sm-hero-label">On-chain intelligence for Solana</p>
          <h1 className="sm-hero-headline">
            Stop buying<br /><em>someone else's exit</em>
          </h1>
          <p className="sm-hero-sub">
            That token you're about to ape? It might be clone #47 from the same dev who rugged you last week. We check so you don't have to.
          </p>
          <div className="sm-hero-actions">
            <a href="#download" className="sm-btn sm-btn--primary">
              <IconApple />
              <span className="sm-btn-stack">
                <span className="sm-btn-sub">Download on the</span>
                App Store
              </span>
            </a>
            <a href="#download" className="sm-btn sm-btn--ghost">
              <IconPlay />
              <span className="sm-btn-stack">
                <span className="sm-btn-sub">Get it on</span>
                Google Play
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Proof ── */}
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

      {/* ── How it works ── */}
      <section id="how" className="sm-section">
        <div className="sm-container">
          <p className="sm-section-label sm-reveal">How it works</p>
          <h2 className="sm-section-title sm-reveal">DYOR but actually do it this time</h2>
          <div className="sm-grid sm-stagger">
            {[
              { step: '01', title: 'Paste. Scan. Know.', desc: 'Drop a contract address. In seconds, we tell you if it\'s the OG or just another copycat riding the hype.' },
              { step: '02', title: 'See who\'s behind it', desc: 'Full deployer family tree. Every clone, every fork, every wallet connection \u2014 exposed like a group chat screenshot.' },
              { step: '03', title: 'Don\'t get rugged', desc: 'Real-time rug alerts before your bag goes to zero. We catch the cartel wallets so you don\'t have to.' },
            ].map(item => (
              <article key={item.step} className="sm-card sm-reveal">
                <p className="sm-card-step">{item.step}</p>
                <h3 className="sm-card-title">{item.title}</h3>
                <p className="sm-card-desc">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="sm-section sm-values">
        <div className="sm-container">
          <p className="sm-section-label sm-reveal">Why Lineage</p>
          <h2 className="sm-section-title sm-reveal">Because "trust me bro" is not a strategy</h2>
          <div className="sm-values-grid sm-stagger">
            <div className="sm-value-item sm-reveal">
              <div className="sm-value-icon"><IconSearch /></div>
              <h3 className="sm-value-title">Clone radar</h3>
              <p className="sm-value-desc">Same dev, new ticker, same rug. We spot copypaste tokens before your portfolio finds out the hard way.</p>
            </div>
            <div className="sm-value-item sm-reveal">
              <div className="sm-value-icon"><IconGitBranch /></div>
              <h3 className="sm-value-title">Deployer exposed</h3>
              <p className="sm-value-desc">See every wallet, every fork, every connection. It's like a background check but for degens who move fast.</p>
            </div>
            <div className="sm-value-item sm-reveal">
              <div className="sm-value-icon"><IconShield /></div>
              <h3 className="sm-value-title">Rug-proof your bag</h3>
              <p className="sm-value-desc">Alerts hit your phone before the dev hits the liquidity. Cartel wallets flagged. No more surprise -99%.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
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

      {/* ── CTA ── */}
      <section id="download" className="sm-cta">
        <div className="sm-cta-glow" aria-hidden="true" />
        <div className="sm-container">
          <h2 className="sm-cta-headline sm-reveal">Your next ape deserves a second opinion</h2>
          <p className="sm-cta-sub sm-reveal">Free. No wallet connect. No signup. Just download and stop getting played.</p>
          <div className="sm-cta-actions sm-reveal">
            <a href="#download" className="sm-btn sm-btn--primary">
              <IconApple />
              <span className="sm-btn-stack">
                <span className="sm-btn-sub">Download on the</span>
                App Store
              </span>
            </a>
            <a href="#download" className="sm-btn sm-btn--ghost">
              <IconPlay />
              <span className="sm-btn-stack">
                <span className="sm-btn-sub">Get it on</span>
                Google Play
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
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
