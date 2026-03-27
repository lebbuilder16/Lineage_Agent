import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { animate } from 'motion';
import { getGlobalStats } from '../lib/api';
import type { GlobalStats } from '../types/api';

/* ─────────────────────────────────────────────
   ANIMATED COUNTER
───────────────────────────────────────────── */

function AnimatedStat({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      el.textContent = fmtStat(value) + suffix;
      return;
    }

    const ctrl = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = fmtStat(Math.round(v)) + suffix; },
      onComplete: () => { el.textContent = fmtStat(value) + suffix; },
    });

    return () => { ctrl.stop(); };
  }, [value, suffix]);

  return <span ref={ref}>{fmtStat(value)}{suffix}</span>;
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function fmtStat(n?: number): string {
  if (!n) return '\u2014';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const socialLinks = [
  { label: 'X / Twitter', href: 'https://x.com/LineageMemes' },
  { label: 'Telegram', href: 'https://t.me/lineageagent' },
  { label: 'Docs', href: 'https://lineage-4.gitbook.io/lineage-docs/' },
];

const howItWorks = [
  { step: '01', title: 'Paste. Scan. Know.', desc: 'Drop a contract address. In seconds, we tell you if it\'s the OG or just another copycat riding the hype.' },
  { step: '02', title: 'See who\'s behind it', desc: 'Full deployer family tree. Every clone, every fork, every wallet connection \u2014 exposed like a group chat screenshot.' },
  { step: '03', title: 'Don\'t get rugged', desc: 'Real-time rug alerts before your bag goes to zero. We catch the cartel wallets so you don\'t have to.' },
];

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */

function IconShield() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconGitBranch() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function IconApple() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15C4.34,1.91 4.93,1.97 5.38,2.29L21.38,12.29C21.75,12.55 22,12.96 22,13.41V13.59C22,14.04 21.75,14.45 21.38,14.71L5.38,21.71C4.93,22.03 4.34,22.09 3.84,21.85C3.34,21.61 3,21.09 3,20.5Z" />
    </svg>
  );
}

function IconArrowRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/* ─────────────────────────────────────────────
   CSS — Ultra-premium dark Solana
   Techniques: mesh gradients, conic animated
   borders, color-shifted shadows, glass layering,
   film grain, light-leak orbs, Linear/Raycast level
───────────────────────────────────────────── */

const css = `
  /* ── Design tokens ── */
  :root {
    --sol-purple: #9945FF;
    --sol-green: #14F195;
    --sol-cyan: #03E1FF;
    --sol-magenta: #DC1FFF;
    --sol-pink: #FB36FF;
    --bg-base: #08070d;
    --bg-raised: rgba(255,255,255,0.022);
    --bg-elevated: rgba(255,255,255,0.035);
    --border-subtle: rgba(255,255,255,0.04);
    --border-medium: rgba(255,255,255,0.07);
    /* Dark-mode optimized text — never pure #fff (causes halation) */
    --text-primary: #e1e1e6;
    --text-secondary: rgba(255,255,255,0.55);
    --text-tertiary: rgba(255,255,255,0.32);
    --text-quaternary: rgba(255,255,255,0.16);
    --glow-purple: rgba(153,69,255,0.35);
    --glow-green: rgba(20,241,149,0.25);
    --glow-cyan: rgba(3,225,255,0.20);
    /* Typography system — display + body separation like Resend/Arc */
    --font-display: 'Clash Display', 'Space Grotesk', system-ui, sans-serif;
    --font-body: 'Satoshi', 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'Space Grotesk', 'SF Mono', 'Fira Code', ui-monospace, monospace;
    /* Dark-mode weights — lighter to compensate for light-on-dark bloom */
    --weight-display: 500;
    --weight-display-heavy: 600;
    --weight-body: 400;
    --weight-body-medium: 500;
    --weight-label: 500;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* ── Root ── */
  .la-root {
    font-family: var(--font-body);
    font-weight: var(--weight-body);
    font-feature-settings: "liga" 1, "calt" 1;
    font-optical-sizing: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    background: var(--bg-base);
    background-image:
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(153,69,255,0.07) 0%, transparent 50%),
      radial-gradient(ellipse 60% 40% at 80% 0%, rgba(20,241,149,0.04) 0%, transparent 40%),
      radial-gradient(ellipse 50% 50% at 20% 100%, rgba(3,225,255,0.03) 0%, transparent 40%);
    color: var(--text-primary);
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    position: relative;
  }

  /* ── Film grain (SVG fine-noise + composited) ── */
  .la-root::after {
    content: '';
    position: fixed;
    inset: 0;
    opacity: 0.018;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    background-size: 256px 256px;
    pointer-events: none;
    z-index: 9999;
    mix-blend-mode: overlay;
  }

  .la-root > * { position: relative; z-index: 1; }

  /* ── Dot grid ── */
  .la-dot-grid {
    position: fixed;
    inset: 0;
    background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 32px 32px;
    -webkit-mask-image: radial-gradient(ellipse 70% 50% at 50% 30%, black 20%, transparent 70%);
    mask-image: radial-gradient(ellipse 70% 50% at 50% 30%, black 20%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  /* ── Mesh gradient orbs (3-layer parallax) ── */
  .la-orb {
    position: fixed;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    will-change: transform;
  }
  .la-orb--1 {
    width: 900px; height: 900px;
    top: -30%; left: -15%;
    background: radial-gradient(circle at 40% 40%,
      rgba(153,69,255,0.14) 0%,
      rgba(153,69,255,0.06) 30%,
      rgba(220,31,255,0.03) 60%,
      transparent 80%);
    filter: blur(100px);
    animation: la-orbit1 25s ease-in-out infinite;
  }
  .la-orb--2 {
    width: 700px; height: 700px;
    top: 5%; right: -20%;
    background: radial-gradient(circle at 60% 30%,
      rgba(20,241,149,0.10) 0%,
      rgba(20,241,149,0.04) 35%,
      rgba(3,225,255,0.03) 60%,
      transparent 80%);
    filter: blur(120px);
    animation: la-orbit2 30s ease-in-out infinite;
  }
  .la-orb--3 {
    width: 600px; height: 600px;
    bottom: 5%; left: 15%;
    background: radial-gradient(circle at 50% 50%,
      rgba(3,225,255,0.07) 0%,
      rgba(153,69,255,0.04) 40%,
      transparent 70%);
    filter: blur(110px);
    animation: la-orbit3 22s ease-in-out 5s infinite;
  }

  /* ── Container ── */
  .la-container {
    max-width: 1216px;
    margin: 0 auto;
    padding: 0 32px;
  }
  @media (max-width: 640px) {
    .la-container { padding: 0 20px; }
  }

  /* ══════════════════════════════════════════
     NAV — frosted glass w/ gradient border
  ══════════════════════════════════════════ */
  .la-nav {
    position: fixed; top: 0; left: 0; right: 0;
    height: 72px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 40px;
    z-index: 100;
    background: rgba(8,7,13,0.55);
    backdrop-filter: blur(40px) saturate(1.6) brightness(1.05);
    -webkit-backdrop-filter: blur(40px) saturate(1.6) brightness(1.05);
    border-bottom: 1px solid var(--border-subtle);
  }
  .la-nav::after {
    content: '';
    position: absolute;
    bottom: -1px; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent 5%, rgba(153,69,255,0.15) 30%, rgba(20,241,149,0.12) 60%, rgba(3,225,255,0.08) 80%, transparent 95%);
  }
  @media (max-width: 640px) { .la-nav { padding: 0 20px; } }

  .la-nav-logo {
    font-family: var(--font-display);
    font-weight: var(--weight-display); font-size: 20px; color: var(--text-primary);
    text-decoration: none; letter-spacing: -0.02em;
    display: flex; align-items: center; gap: 10px;
  }
  .la-nav-logo-dot {
    width: 32px; height: 32px;
    background: linear-gradient(145deg, #9945FF, #19FB9B);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 15px; font-weight: 700;
    box-shadow:
      0 0 16px rgba(153,69,255,0.4),
      0 0 48px rgba(20,241,149,0.12),
      inset 0 1px 1px rgba(255,255,255,0.25);
  }
  .la-nav-links {
    display: flex; gap: 36px; align-items: center;
  }
  .la-nav-link {
    font-family: var(--font-body);
    font-size: 14px; font-weight: var(--weight-body-medium); color: var(--text-tertiary);
    text-decoration: none; transition: color 0.3s; letter-spacing: -0.01em;
  }
  .la-nav-link:hover { color: var(--text-primary); }

  .la-nav-cta {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 22px;
    background: linear-gradient(145deg, #9945FF, #19FB9B);
    border: none; border-radius: 10px;
    color: #fff; font-size: 13px; font-weight: var(--weight-body-medium);
    cursor: pointer; font-family: var(--font-body); text-decoration: none;
    letter-spacing: 0.01em;
    box-shadow:
      0 1px 2px rgba(0,0,0,0.4),
      0 0 20px var(--glow-purple),
      inset 0 1px 0 rgba(255,255,255,0.2);
    transition: all 0.35s var(--ease-out-expo);
  }
  .la-nav-cta:hover {
    box-shadow:
      0 2px 4px rgba(0,0,0,0.4),
      0 0 32px var(--glow-purple),
      0 0 72px rgba(20,241,149,0.12),
      inset 0 1px 0 rgba(255,255,255,0.25);
    transform: translateY(-1px);
  }

  .la-nav-burger {
    display: none; background: none; border: none;
    color: var(--text-tertiary); font-size: 24px; cursor: pointer;
    padding: 4px; line-height: 1;
  }
  .la-mobile-menu {
    display: none; position: fixed; top: 72px; left: 0; right: 0;
    background: rgba(8,7,13,0.92);
    backdrop-filter: blur(40px) saturate(1.4);
    -webkit-backdrop-filter: blur(40px) saturate(1.4);
    border-bottom: 1px solid var(--border-subtle);
    padding: 24px 40px; flex-direction: column; gap: 20px; z-index: 99;
  }
  .la-mobile-menu.open { display: flex; }
  @media (max-width: 768px) {
    .la-nav-links { display: none; }
    .la-nav-burger { display: flex; align-items: center; }
  }

  /* ══════════════════════════════════════════
     HERO — mesh gradient backdrop + multi-stop text
  ══════════════════════════════════════════ */
  .la-hero {
    padding: 170px 0 110px;
    text-align: center;
    position: relative;
  }
  .la-hero-mesh {
    position: absolute;
    top: 0; left: 50%; transform: translateX(-50%);
    width: 120%; max-width: 1400px; height: 700px;
    pointer-events: none;
    background:
      radial-gradient(ellipse 50% 45% at 35% 42%, rgba(153,69,255,0.18) 0%, transparent 70%),
      radial-gradient(ellipse 40% 40% at 65% 35%, rgba(20,241,149,0.10) 0%, transparent 65%),
      radial-gradient(ellipse 35% 30% at 50% 70%, rgba(3,225,255,0.07) 0%, transparent 60%),
      radial-gradient(ellipse 25% 20% at 70% 55%, rgba(220,31,255,0.06) 0%, transparent 50%);
    filter: blur(70px);
    opacity: 0.9;
    animation: la-mesh-breathe 12s ease-in-out infinite;
  }
  @media (max-width: 640px) {
    .la-hero { padding: 130px 0 70px; }
  }

  .la-hero-headline {
    position: relative;
    font-family: var(--font-display);
    font-size: clamp(2.75rem, 6.5vw, 5rem);
    font-weight: var(--weight-display-heavy);
    letter-spacing: -0.045em;
    line-height: 0.95;
    margin: 0 0 1.5rem;
    color: var(--text-primary);
    text-wrap: balance;
    font-feature-settings: "liga" 1, "calt" 1, "ss03" 1;
  }
  .la-hero-headline-accent {
    display: block;
    font-weight: var(--weight-display-heavy);
    letter-spacing: -0.05em;
    background: linear-gradient(
      135deg,
      #9945FF 0%,
      #B84DFF 15%,
      #DC1FFF 30%,
      #19FB9B 55%,
      #03E1FF 78%,
      #14F195 100%
    );
    background-size: 200% 200%;
    animation: la-gradient-shift 8s ease infinite;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    padding-top: 0.15em;
  }
  .la-hero-sub {
    position: relative;
    font-family: var(--font-body);
    font-size: clamp(1rem, 1.8vw, 1.125rem);
    color: var(--text-secondary);
    line-height: 1.7;
    margin: 0 auto 3.25rem;
    max-width: 28rem;
    font-weight: var(--weight-body);
    letter-spacing: 0em;
    text-wrap: pretty;
  }
  .la-hero-actions {
    position: relative;
    display: flex; gap: 16px;
    justify-content: center; flex-wrap: wrap;
  }

  /* ══════════════════════════════════════════
     STORE BUTTONS — glass + glow
  ══════════════════════════════════════════ */
  .la-store-btn {
    display: inline-flex; align-items: center; gap: 12px;
    padding: 15px 28px; border-radius: 14px;
    font-size: 15px; font-weight: var(--weight-body-medium);
    cursor: pointer; font-family: var(--font-body); text-decoration: none;
    letter-spacing: -0.01em; border: none;
    transition: all 0.4s var(--ease-out-expo);
    position: relative;
  }
  .la-store-btn:active { transform: scale(0.97); }

  .la-store-btn--apple {
    background: linear-gradient(145deg, #9945FF 0%, #7B2FE0 40%, #19FB9B 100%);
    color: #fff;
    box-shadow:
      0 1px 3px rgba(0,0,0,0.5),
      0 4px 16px rgba(153,69,255,0.30),
      0 12px 48px rgba(153,69,255,0.15),
      inset 0 1px 0 rgba(255,255,255,0.18),
      inset 0 -1px 0 rgba(0,0,0,0.1);
  }
  .la-store-btn--apple:hover {
    transform: translateY(-3px) scale(1.01);
    box-shadow:
      0 2px 6px rgba(0,0,0,0.5),
      0 8px 32px rgba(153,69,255,0.40),
      0 20px 64px rgba(20,241,149,0.12),
      0 0 100px rgba(153,69,255,0.10),
      inset 0 1px 0 rgba(255,255,255,0.22),
      inset 0 -1px 0 rgba(0,0,0,0.1);
  }

  .la-store-btn--google {
    background: var(--bg-raised);
    color: var(--text-primary);
    border: 1px solid var(--border-medium);
    backdrop-filter: blur(12px);
  }
  .la-store-btn--google:hover {
    transform: translateY(-3px);
    background: var(--bg-elevated);
    border-color: rgba(153,69,255,0.25);
    box-shadow:
      0 8px 32px rgba(153,69,255,0.08),
      0 0 0 1px rgba(153,69,255,0.12),
      inset 0 1px 0 rgba(255,255,255,0.04);
  }

  .la-store-btn-text {
    display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2;
  }
  .la-store-btn-label {
    font-size: 9px; font-weight: var(--weight-body); opacity: 0.6;
    text-transform: uppercase; letter-spacing: 0.1em;
  }

  /* ══════════════════════════════════════════
     SOCIAL PROOF
  ══════════════════════════════════════════ */
  .la-proof {
    padding: 56px 0 72px; text-align: center;
    border-bottom: 1px solid var(--border-subtle);
    position: relative;
  }
  .la-proof::after {
    content: '';
    position: absolute; bottom: -1px; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(153,69,255,0.08), rgba(20,241,149,0.06), transparent);
  }
  .la-proof-label {
    font-family: var(--font-mono);
    font-size: 11px; font-weight: var(--weight-label);
    color: var(--text-quaternary);
    text-transform: uppercase; letter-spacing: 0.15em;
    margin: 0 0 28px;
  }
  .la-proof-logos {
    display: flex; justify-content: center; align-items: center;
    gap: 56px; flex-wrap: wrap;
  }
  .la-proof-logo {
    font-family: var(--font-body);
    font-size: 14px; font-weight: var(--weight-body-medium);
    color: rgba(255,255,255,0.12);
    letter-spacing: 0.08em; text-transform: uppercase;
    transition: all 0.4s;
  }
  .la-proof-logo:hover {
    color: rgba(255,255,255,0.35);
    text-shadow: 0 0 20px rgba(153,69,255,0.15);
  }

  /* ══════════════════════════════════════════
     SECTIONS — shared
  ══════════════════════════════════════════ */
  .la-how { padding: 120px 0; position: relative; }

  .la-section-label {
    font-family: var(--font-mono);
    font-size: 12px; font-weight: var(--weight-label);
    text-transform: uppercase; letter-spacing: 0.12em;
    margin: 0 0 1rem; text-align: center;
    background: linear-gradient(135deg, var(--sol-green), var(--sol-cyan));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: none;
  }
  .la-section-title {
    font-family: var(--font-display);
    font-size: clamp(1.875rem, 3.8vw, 3rem);
    font-weight: var(--weight-display); letter-spacing: -0.035em;
    margin: 0 0 4.5rem; text-align: center;
    color: var(--text-primary);
    line-height: 1.1;
    text-wrap: balance;
  }

  /* ══════════════════════════════════════════
     HOW-IT-WORKS CARDS — animated conic border
  ══════════════════════════════════════════ */
  .la-how-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  }
  @media (max-width: 768px) {
    .la-how-grid { grid-template-columns: 1fr; gap: 16px; }
  }

  .la-how-card {
    position: relative;
    background: var(--bg-raised);
    border: 1px solid var(--border-subtle);
    border-radius: 20px;
    padding: 44px 30px 36px;
    transition: all 0.5s var(--ease-out-expo);
    overflow: hidden;
  }
  /* Conic animated border on hover */
  .la-how-card::before {
    content: '';
    position: absolute; inset: -1px;
    border-radius: 21px;
    background: conic-gradient(
      from var(--angle, 0deg),
      transparent 0%,
      var(--sol-purple) 10%,
      var(--sol-magenta) 20%,
      var(--sol-green) 35%,
      var(--sol-cyan) 45%,
      transparent 55%,
      transparent 100%
    );
    opacity: 0;
    transition: opacity 0.5s;
    animation: la-conic-spin 4s linear infinite;
    z-index: -2;
  }
  /* Inner bg to "cut out" the border */
  .la-how-card::after {
    content: '';
    position: absolute; inset: 1px;
    border-radius: 19px;
    background: var(--bg-base);
    z-index: -1;
    transition: background 0.5s;
  }
  .la-how-card:hover::before { opacity: 1; }
  .la-how-card:hover::after { background: rgba(12,11,18,0.97); }
  .la-how-card:hover {
    transform: translateY(-8px);
    box-shadow:
      0 24px 64px rgba(153,69,255,0.06),
      0 8px 24px rgba(0,0,0,0.3);
  }

  /* Inner top-glow on hover */
  .la-how-card-glow {
    position: absolute; top: -40px; left: 50%; transform: translateX(-50%);
    width: 200px; height: 80px;
    background: radial-gradient(ellipse, var(--glow-purple) 0%, transparent 70%);
    filter: blur(40px);
    opacity: 0;
    transition: opacity 0.5s;
    pointer-events: none;
  }
  .la-how-card:hover .la-how-card-glow { opacity: 1; }

  .la-how-step {
    font-family: var(--font-display);
    font-size: 3.5rem; font-weight: var(--weight-display);
    line-height: 1; margin: 0 0 1.5rem;
    letter-spacing: -0.05em;
    font-variant-numeric: tabular-nums;
    background: linear-gradient(145deg, rgba(153,69,255,0.15), rgba(20,241,149,0.10));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    transition: all 0.5s;
  }
  .la-how-card:hover .la-how-step {
    background: linear-gradient(145deg, var(--sol-purple), var(--sol-green));
    -webkit-background-clip: text; background-clip: text;
    filter: drop-shadow(0 0 16px rgba(20,241,149,0.25));
  }
  .la-how-title {
    font-family: var(--font-display);
    font-size: 1.25rem; font-weight: var(--weight-display); color: var(--text-primary);
    margin: 0 0 0.75rem; letter-spacing: -0.025em;
    line-height: 1.25;
  }
  .la-how-desc {
    font-family: var(--font-body);
    font-size: 0.9375rem; color: var(--text-secondary);
    line-height: 1.65; margin: 0;
    letter-spacing: 0em;
    text-wrap: pretty;
  }

  /* ══════════════════════════════════════════
     VALUE PROPS
  ══════════════════════════════════════════ */
  .la-values {
    padding: 110px 0 120px;
    border-top: 1px solid var(--border-subtle);
    position: relative;
  }
  .la-values::before {
    content: '';
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 900px; height: 500px;
    background:
      radial-gradient(ellipse 40% 40% at 30% 40%, rgba(153,69,255,0.06) 0%, transparent 70%),
      radial-gradient(ellipse 30% 35% at 70% 60%, rgba(20,241,149,0.04) 0%, transparent 70%);
    filter: blur(80px); pointer-events: none;
  }
  .la-values-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 48px; text-align: center; position: relative;
  }
  @media (max-width: 768px) {
    .la-values-grid { grid-template-columns: 1fr; gap: 44px; }
  }

  .la-value-icon {
    width: 64px; height: 64px;
    border-radius: 18px;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 24px;
    color: #fff;
    position: relative;
    box-shadow:
      0 2px 8px rgba(0,0,0,0.3),
      inset 0 1px 0 rgba(255,255,255,0.15);
    transition: all 0.4s var(--ease-out-expo);
  }
  .la-value-icon::after {
    content: '';
    position: absolute; inset: -10px;
    border-radius: 24px;
    background: inherit; opacity: 0.18;
    filter: blur(20px); z-index: -1;
    transition: all 0.4s;
  }
  .la-reveal:hover .la-value-icon {
    transform: translateY(-4px) scale(1.05);
  }
  .la-reveal:hover .la-value-icon::after {
    opacity: 0.28; filter: blur(28px); inset: -16px;
  }

  .la-value-title {
    font-family: var(--font-display);
    font-size: 1.25rem; font-weight: var(--weight-display); color: var(--text-primary);
    margin: 0 0 0.625rem; letter-spacing: -0.02em;
    line-height: 1.25;
  }
  .la-value-desc {
    font-family: var(--font-body);
    font-size: 0.9375rem; color: var(--text-secondary);
    line-height: 1.65; margin: 0;
    max-width: 18.75rem; margin-left: auto; margin-right: auto;
    letter-spacing: 0em;
    text-wrap: pretty;
  }

  /* ══════════════════════════════════════════
     STATS — gradient line accent
  ══════════════════════════════════════════ */
  .la-stats {
    padding: 110px 0; position: relative;
    background: linear-gradient(180deg, rgba(153,69,255,0.015) 0%, var(--bg-base) 100%);
    border-top: 1px solid var(--border-subtle);
    border-bottom: 1px solid var(--border-subtle);
  }
  .la-stats::before, .la-stats::after {
    content: '';
    position: absolute; left: 0; right: 0; height: 1px;
  }
  .la-stats::before {
    top: -1px;
    background: linear-gradient(90deg,
      transparent 5%,
      rgba(153,69,255,0.20) 25%,
      rgba(220,31,255,0.15) 40%,
      rgba(20,241,149,0.15) 60%,
      rgba(3,225,255,0.12) 75%,
      transparent 95%
    );
  }
  .la-stats::after {
    bottom: -1px;
    background: linear-gradient(90deg,
      transparent 10%,
      rgba(3,225,255,0.08) 30%,
      rgba(20,241,149,0.10) 50%,
      rgba(153,69,255,0.08) 70%,
      transparent 90%
    );
  }

  .la-stats-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 48px; text-align: center;
  }
  @media (max-width: 600px) {
    .la-stats-grid { grid-template-columns: 1fr; gap: 44px; }
  }

  .la-stat-value {
    font-family: var(--font-display);
    font-size: clamp(3rem, 7vw, 4.75rem);
    font-weight: var(--weight-display); letter-spacing: -0.05em;
    margin: 0 0 0.875rem; line-height: 0.95;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1, "liga" 1;
    background: linear-gradient(
      145deg,
      #fff 0%,
      #e8e0ff 25%,
      var(--sol-purple) 55%,
      var(--sol-green) 85%,
      var(--sol-cyan) 100%
    );
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    filter: drop-shadow(0 2px 20px rgba(153,69,255,0.12));
  }
  .la-stat-label {
    font-family: var(--font-body);
    font-size: 0.875rem; color: var(--text-tertiary);
    line-height: 1.5; margin: 0; letter-spacing: 0em;
    font-weight: var(--weight-body);
  }
  .la-skeleton {
    background: var(--bg-raised);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    animation: la-pulse 2s ease infinite;
    display: inline-block;
  }

  /* ══════════════════════════════════════════
     CTA — ambient light pool
  ══════════════════════════════════════════ */
  .la-cta {
    padding: 150px 0;
    text-align: center; position: relative; overflow: hidden;
  }
  .la-cta-ambient {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 1000px; height: 600px;
    background:
      radial-gradient(ellipse 40% 35% at 40% 45%, rgba(153,69,255,0.12) 0%, transparent 70%),
      radial-gradient(ellipse 35% 30% at 60% 55%, rgba(20,241,149,0.07) 0%, transparent 70%),
      radial-gradient(ellipse 20% 25% at 50% 40%, rgba(220,31,255,0.05) 0%, transparent 60%);
    filter: blur(80px);
    animation: la-ambient-float 14s ease-in-out infinite;
    pointer-events: none;
  }
  .la-cta-headline {
    position: relative;
    font-family: var(--font-display);
    font-size: clamp(2rem, 4.5vw, 3.5rem);
    font-weight: var(--weight-display); letter-spacing: -0.04em;
    margin: 0 0 1.125rem; color: var(--text-primary);
    line-height: 1.08;
    text-wrap: balance;
  }
  .la-cta-sub {
    position: relative;
    font-family: var(--font-body);
    font-size: 1.0625rem; color: var(--text-secondary);
    margin: 0 0 3rem; letter-spacing: 0em;
    font-weight: var(--weight-body);
    text-wrap: pretty;
  }
  .la-cta-actions {
    position: relative;
    display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;
  }

  /* ══════════════════════════════════════════
     FOOTER
  ══════════════════════════════════════════ */
  .la-footer {
    padding: 64px 0 40px;
    border-top: 1px solid var(--border-subtle);
    position: relative;
  }
  .la-footer::before {
    content: '';
    position: absolute; top: -1px; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(153,69,255,0.06), rgba(20,241,149,0.04), transparent);
  }
  .la-footer-grid {
    display: grid; grid-template-columns: 2fr 1fr 1fr;
    gap: 48px; margin-bottom: 48px;
  }
  @media (max-width: 768px) {
    .la-footer-grid { grid-template-columns: 1fr; gap: 32px; }
  }
  .la-footer-brand {
    font-family: var(--font-display);
    font-size: 1.125rem; font-weight: var(--weight-display); color: var(--text-primary);
    letter-spacing: -0.02em; margin: 0 0 0.75rem;
    display: flex; align-items: center; gap: 10px;
  }
  .la-footer-tagline {
    font-family: var(--font-body);
    font-size: 0.875rem; color: var(--text-tertiary);
    line-height: 1.65; margin: 0; max-width: 18.75rem;
    letter-spacing: 0em;
  }
  .la-footer-heading {
    font-family: var(--font-mono);
    font-size: 0.6875rem; font-weight: var(--weight-label);
    color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: 0.1em;
    margin: 0 0 1rem;
  }
  .la-footer-link {
    font-family: var(--font-body);
    display: block; font-size: 0.875rem;
    color: var(--text-tertiary);
    text-decoration: none; padding: 0.3125rem 0;
    transition: all 0.3s; letter-spacing: -0.01em;
  }
  .la-footer-link:hover {
    color: var(--sol-green);
    text-shadow: 0 0 16px rgba(20,241,149,0.2);
  }
  .la-footer-bottom {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 24px;
    border-top: 1px solid var(--border-subtle);
    flex-wrap: wrap; gap: 12px;
  }
  .la-footer-copy {
    font-family: var(--font-body);
    font-size: 0.8125rem; color: var(--text-quaternary);
    margin: 0; letter-spacing: 0em;
  }
  .la-footer-socials { display: flex; gap: 16px; }
  .la-footer-social {
    font-family: var(--font-body);
    font-size: 0.8125rem; color: var(--text-tertiary);
    text-decoration: none; transition: all 0.3s;
  }
  .la-footer-social:hover {
    color: var(--sol-green);
    text-shadow: 0 0 12px rgba(20,241,149,0.2);
  }

  /* ══════════════════════════════════════════
     MOTION SYSTEM — Vercel/Linear/Resend level
  ══════════════════════════════════════════ */

  /* Easing tokens (from Vercel design system) */
  :root {
    --motion-swift: cubic-bezier(.175, .885, .32, 1.1);
    --motion-snappy: cubic-bezier(.32, .72, 0, 1);
    --motion-smooth: cubic-bezier(.25, .46, .45, .94);
    --motion-spring: cubic-bezier(.34, 1.56, .64, 1);
  }

  /* ── Nav slide-down (header-slide-down-fade, Resend) ── */
  .la-nav {
    animation: la-nav-in 0.8s ease-out both;
  }
  @keyframes la-nav-in {
    0% { opacity: 0; transform: translateY(-16px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  /* ── Hero word-by-word blur reveal (Linear) ── */
  .la-hero-word {
    display: inline-block;
    opacity: 0;
    filter: blur(10px);
    transform: translateY(20%);
    animation: la-word-reveal 0.6s var(--ease-out-expo) forwards;
  }
  @keyframes la-word-reveal {
    to { opacity: 1; filter: blur(0); transform: translateY(0); }
  }

  /* ── Hero subtitle blur-fade ── */
  .la-hero-sub {
    opacity: 0;
    filter: blur(6px);
    transform: translateY(16px);
    animation: la-blur-fade-in 0.8s var(--ease-out-expo) 0.6s forwards;
  }
  @keyframes la-blur-fade-in {
    to { opacity: 1; filter: blur(0); transform: translateY(0); }
  }

  /* ── Hero actions scale-up (Vercel hero-scale-in) ── */
  .la-hero-actions {
    opacity: 0;
    transform: scale(0.97) translateY(12px);
    animation: la-scale-in 0.7s var(--ease-out-expo) 0.8s forwards;
  }
  @keyframes la-scale-in {
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ── Button press (universal) ── */
  .la-store-btn:active,
  .la-nav-cta:active {
    transform: scale(0.97) !important;
    transition: transform 0.1s !important;
  }

  /* ── Shimmer on gradient text (Linear) ── */
  .la-hero-headline-accent {
    background-size: 300% 100%;
    animation: la-shimmer 3s linear 1.2s both, la-gradient-shift 8s ease 4s infinite;
  }
  @keyframes la-shimmer {
    0% { background-position: 300% center; opacity: 0; filter: blur(8px); }
    50% { opacity: 1; filter: blur(0); }
    100% { background-position: 0% center; opacity: 1; filter: blur(0); }
  }
  @keyframes la-gradient-shift {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  /* ── Scroll reveal — Vercel show/hide system ── */
  .la-reveal {
    opacity: 0;
    transform: translate3d(0, 40px, 0);
    filter: blur(4px);
    transition:
      opacity 0.7s var(--ease-out-expo),
      transform 0.7s var(--ease-out-expo),
      filter 0.7s var(--ease-out-expo);
  }
  .la-reveal.is-visible {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    filter: blur(0);
  }

  /* Stagger delays for grid children (Resend 250ms pattern) */
  .la-stagger-grid .la-reveal:nth-child(1) { transition-delay: 0ms; }
  .la-stagger-grid .la-reveal:nth-child(2) { transition-delay: 150ms; }
  .la-stagger-grid .la-reveal:nth-child(3) { transition-delay: 300ms; }

  /* ── Card hover spring (Vercel --motion-swift) ── */
  .la-how-card {
    transition: all 0.4s var(--motion-swift);
  }
  .la-how-card:hover {
    transform: translateY(-8px) scale(1.01);
  }
  .la-how-card:active {
    transform: translateY(-4px) scale(0.99);
    transition: transform 0.1s;
  }

  /* ── Value icon float (hover micro-interaction) ── */
  .la-value-icon {
    transition: all 0.4s var(--motion-swift);
  }
  .la-reveal:hover .la-value-icon {
    transform: translateY(-6px) scale(1.08);
  }

  /* ── Stats counter blur-in ── */
  .la-stat-value {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(12px);
    transition: all 0.8s var(--ease-out-expo);
  }
  .la-reveal.is-visible .la-stat-value {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }

  /* ── Proof logos stagger (fade + slide) ── */
  .la-proof-logo {
    opacity: 0;
    transform: translateY(8px);
    transition: all 0.5s var(--ease-out-expo);
  }
  .la-reveal.is-visible .la-proof-logo { opacity: 1; transform: translateY(0); }
  .la-reveal.is-visible .la-proof-logo:nth-child(1) { transition-delay: 0ms; }
  .la-reveal.is-visible .la-proof-logo:nth-child(2) { transition-delay: 100ms; }
  .la-reveal.is-visible .la-proof-logo:nth-child(3) { transition-delay: 200ms; }
  .la-reveal.is-visible .la-proof-logo:nth-child(4) { transition-delay: 300ms; }

  /* ── CTA headline text shimmer on reveal ── */
  .la-cta-headline {
    opacity: 0;
    filter: blur(6px);
    transform: translateY(20px);
    transition: all 0.8s var(--ease-out-expo);
  }
  .la-reveal.is-visible.la-cta-headline,
  .la-reveal.is-visible .la-cta-headline {
    opacity: 1; filter: blur(0); transform: translateY(0);
  }

  /* ── Background orb animations ── */
  @keyframes la-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
  @keyframes la-mesh-breathe {
    0%, 100% { opacity: 0.9; transform: translateX(-50%) scale(1); }
    50% { opacity: 1; transform: translateX(-50%) scale(1.06); }
  }
  @keyframes la-orbit1 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    25% { transform: translate(40px, 30px) scale(1.05); }
    50% { transform: translate(-20px, 50px) scale(0.97); }
    75% { transform: translate(30px, -20px) scale(1.02); }
  }
  @keyframes la-orbit2 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(-50px, 40px) scale(1.04); }
    66% { transform: translate(30px, -30px) scale(0.96); }
  }
  @keyframes la-orbit3 {
    0%, 100% { transform: translate(0, 0) scale(1); }
    40% { transform: translate(35px, -25px) scale(1.06); }
    70% { transform: translate(-40px, 20px) scale(0.98); }
  }
  @keyframes la-ambient-float {
    0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
    33% { transform: translate(-48%, -52%) scale(1.04) rotate(2deg); }
    66% { transform: translate(-52%, -48%) scale(0.96) rotate(-2deg); }
  }
  @property --angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }
  @keyframes la-conic-spin {
    to { --angle: 360deg; }
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    .la-reveal { opacity: 1; transform: none; filter: none; transition: none; }
    .la-hero-word { opacity: 1; filter: none; transform: none; }
    .la-hero-sub { opacity: 1; filter: none; transform: none; }
    .la-hero-actions { opacity: 1; transform: none; }
    .la-hero-headline-accent { background-size: 200% 200%; }
    .la-stat-value { opacity: 1; filter: none; transform: none; }
    .la-proof-logo { opacity: 1; transform: none; }
    .la-cta-headline { opacity: 1; filter: none; transform: none; }
  }
`;

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

/* ── Word wrapper for blur reveal ── */
function HeroWords({ text, baseDelay = 0 }: { text: string; baseDelay?: number }) {
  const words = text.split(' ');
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          <span
            className="la-hero-word"
            style={{ animationDelay: `${baseDelay + i * 80}ms` }}
          >
            {word}
          </span>
          {i < words.length - 1 && '\u00A0'}
        </span>
      ))}
    </>
  );
}

export function LandingScreen() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  /* Scroll reveal with stagger support */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
        }
      }),
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    document.querySelectorAll('.la-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => { getGlobalStats().then(setStats).catch(() => {}); }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <div className="la-root">
      <style>{css}</style>

      {/* ── Background layers ── */}
      <div className="la-dot-grid" aria-hidden="true" />
      <div className="la-orb la-orb--1" aria-hidden="true" />
      <div className="la-orb la-orb--2" aria-hidden="true" />
      <div className="la-orb la-orb--3" aria-hidden="true" />

      {/* ── Nav ── */}
      <nav className="la-nav">
        <a href="/" className="la-nav-logo">
          <span className="la-nav-logo-dot">L</span>
          Lineage
        </a>
        <div className="la-nav-links">
          <a href="#how" className="la-nav-link">How it works</a>
          <a href="#stats" className="la-nav-link">Stats</a>
          <a href="#download" className="la-nav-cta">
            Download App <IconArrowRight size={14} />
          </a>
        </div>
        <button className="la-nav-burger" aria-label="Open menu" aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
      </nav>

      <div className={`la-mobile-menu${menuOpen ? ' open' : ''}`} role="navigation" aria-label="Mobile navigation">
        <a href="#how" className="la-nav-link" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#stats" className="la-nav-link" onClick={() => setMenuOpen(false)}>Stats</a>
        <a href="#download" className="la-nav-cta" style={{ textAlign: 'center', justifyContent: 'center' }} onClick={() => setMenuOpen(false)}>
          Download App
        </a>
      </div>

      {/* ── Hero ── */}
      <section className="la-hero">
        <div className="la-hero-mesh" aria-hidden="true" />
        <div className="la-container">
          <h1 className="la-hero-headline">
            <HeroWords text="Stop buying" baseDelay={100} /><br />
            <span className="la-hero-headline-accent">
              <HeroWords text="someone else's exit" baseDelay={350} />
            </span>
          </h1>
          <p className="la-hero-sub">
            That token you're about to ape? It might be clone #47 from the same dev who rugged you last week. We check so you don't have to.
          </p>
          <div className="la-hero-actions">
            <a href="#download" className="la-store-btn la-store-btn--apple">
              <IconApple />
              <span className="la-store-btn-text">
                <span className="la-store-btn-label">Download on the</span>
                App Store
              </span>
            </a>
            <a href="#download" className="la-store-btn la-store-btn--google">
              <IconPlay />
              <span className="la-store-btn-text">
                <span className="la-store-btn-label">Get it on</span>
                Google Play
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Social proof ── */}
      <section className="la-proof la-reveal">
        <div className="la-container">
          <p className="la-proof-label">Powered by the chain that never sleeps</p>
          <div className="la-proof-logos">
            <span className="la-proof-logo">Solana</span>
            <span className="la-proof-logo">Helius</span>
            <span className="la-proof-logo">Jupiter</span>
            <span className="la-proof-logo">Birdeye</span>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="la-how">
        <div className="la-container">
          <p className="la-section-label la-reveal">How it works</p>
          <h2 className="la-section-title la-reveal">DYOR but actually do it this time</h2>
          <div className="la-how-grid la-stagger-grid">
            {howItWorks.map((item) => (
              <article key={item.step} className="la-how-card la-reveal">
                <div className="la-how-card-glow" aria-hidden="true" />
                <p className="la-how-step">{item.step}</p>
                <h3 className="la-how-title">{item.title}</h3>
                <p className="la-how-desc">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Value props ── */}
      <section className="la-values">
        <div className="la-container">
          <p className="la-section-label la-reveal">Why this exists</p>
          <h2 className="la-section-title la-reveal">Because "trust me bro" is not a strategy</h2>
          <div className="la-values-grid la-stagger-grid">
            <div className="la-reveal">
              <div className="la-value-icon" style={{ background: 'linear-gradient(145deg, #9945FF, #DC1FFF)' }}>
                <IconSearch />
              </div>
              <h3 className="la-value-title">Clone radar</h3>
              <p className="la-value-desc">Same dev, new ticker, same rug. We spot copypaste tokens before your portfolio finds out the hard way.</p>
            </div>
            <div className="la-reveal">
              <div className="la-value-icon" style={{ background: 'linear-gradient(145deg, #9945FF, #14F195)' }}>
                <IconGitBranch />
              </div>
              <h3 className="la-value-title">Deployer exposed</h3>
              <p className="la-value-desc">See every wallet, every fork, every connection. It's like a background check but for degens who move fast.</p>
            </div>
            <div className="la-reveal">
              <div className="la-value-icon" style={{ background: 'linear-gradient(145deg, #14F195, #03E1FF)', color: '#07060b' }}>
                <IconShield />
              </div>
              <h3 className="la-value-title">Rug-proof your bag</h3>
              <p className="la-value-desc">Alerts hit your phone before the dev hits the liquidity. Cartel wallets flagged. No more surprise -99%.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section id="stats" className="la-stats">
        <div className="la-container">
          <div className="la-stats-grid la-reveal">
            {[
              { val: stats?.total_scanned_all_time, label: 'Tokens scanned (and counting)' },
              { val: stats?.active_deployers_24h, label: 'Deployers under the microscope' },
              { val: stats?.rug_count_24h, label: 'Rugs caught in the last 24h' },
            ].map((s, i) => (
              <div key={i}>
                {stats === null ? (
                  <div className="la-skeleton" style={{ height: 60, width: 130, marginBottom: 10 }} />
                ) : (
                  <p className="la-stat-value">
                    <AnimatedStat value={s.val ?? 0} />
                  </p>
                )}
                <p className="la-stat-label">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section id="download" className="la-cta">
        <div className="la-cta-ambient" aria-hidden="true" />
        <div className="la-container">
          <h2 className="la-cta-headline la-reveal">Your next ape deserves a second opinion</h2>
          <p className="la-cta-sub la-reveal">Free. No wallet connect. No signup. Just download and stop getting played.</p>
          <div className="la-cta-actions la-reveal">
            <a href="#download" className="la-store-btn la-store-btn--apple">
              <IconApple />
              <span className="la-store-btn-text">
                <span className="la-store-btn-label">Download on the</span>
                App Store
              </span>
            </a>
            <a href="#download" className="la-store-btn la-store-btn--google">
              <IconPlay />
              <span className="la-store-btn-text">
                <span className="la-store-btn-label">Get it on</span>
                Google Play
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="la-footer">
        <div className="la-container">
          <div className="la-footer-grid">
            <div>
              <div className="la-footer-brand">
                <span className="la-nav-logo-dot" style={{ width: 28, height: 28, fontSize: 13, borderRadius: 8 }}>L</span>
                Lineage Agent
              </div>
              <p className="la-footer-tagline">
                On-chain intel for degens who'd rather not get rugged. Again.
              </p>
            </div>
            <div>
              <p className="la-footer-heading">Social</p>
              {socialLinks.map((s) => (
                <a key={s.label} href={s.href} className="la-footer-link" target="_blank" rel="noopener noreferrer">{s.label}</a>
              ))}
            </div>
            <div>
              <p className="la-footer-heading">Legal</p>
              <Link to="/privacy" className="la-footer-link">Privacy Policy</Link>
              <a href="mailto:hello@lineageagent.com" className="la-footer-link">Contact</a>
            </div>
          </div>
          <div className="la-footer-bottom">
            <p className="la-footer-copy">&copy; {new Date().getFullYear()} Lineage Agent. All rights reserved.</p>
            <div className="la-footer-socials">
              {socialLinks.map((s) => (
                <a key={s.label} href={s.href} className="la-footer-social" target="_blank" rel="noopener noreferrer">{s.label}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
