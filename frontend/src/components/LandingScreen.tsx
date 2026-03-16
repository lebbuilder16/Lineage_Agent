import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
    category: 'Market Intelligence & Discovery',
    description: 'Our real-time radar surfaces emerging tokens before they trend, analyzing volume patterns and deployer history across Solana.',
    route: '/radar',
  },
  {
    title: 'Lineage Scan',
    category: 'Clone Detection & Family Mapping',
    description: 'Deep scan any token to uncover its full lineage tree, identifying forks, clones, and imposters across the Solana ecosystem.',
    route: `/token/${EXAMPLE_MINT}`,
  },
  {
    title: 'Death Clock',
    category: 'Rug Probability & Soft Rug Detection',
    description: 'Advanced risk scoring using deployer DNA, factory detection, and behavioral pattern analysis to flag threats before they materialize.',
    route: `/token/${EXAMPLE_MINT}`,
  },
  {
    title: 'Family Tree',
    category: 'Visual Lineage Visualization',
    description: 'Interactive graph mapping the complete family tree of any token, exposing hidden relationships and derivative chains at a glance.',
    route: `/token/${EXAMPLE_MINT}`,
  },
  {
    title: 'Cartel Detection',
    category: 'Coordinated Deployer Networks',
    description: 'Identify clusters of wallets operating as coordinated bad actors, deploying waves of scam tokens across the Solana ecosystem.',
    route: '/compare',
  },
  {
    title: 'Sol Trace',
    category: 'On-Chain Transaction Forensics',
    description: "Trace any token's complete on-chain footprint from genesis block through current activity with full transparency and precision.",
    route: `/token/${EXAMPLE_MINT}`,
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
  /* ── Load: nav ── */
  .la-nav {
    animation: la-fadeIn 0.4s ease forwards;
  }

  /* ── Load: hero headline ── */
  .la-hero-headline {
    animation: la-fadeInUp 0.8s ease forwards;
  }
  .la-hero-cta {
    animation: la-fadeInUp 0.8s ease 0.15s both;
  }

  @keyframes la-fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes la-fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Skeleton pulse ── */
  @keyframes la-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  .la-stat-skeleton {
    width: 120px;
    height: 80px;
    background: #f0f0f0;
    border-radius: 4px;
    animation: la-pulse 1.5s ease infinite;
  }

  /* ── Scroll reveal ── */
  .la-reveal {
    opacity: 0;
    transform: translateY(24px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .la-reveal.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    .la-nav, .la-hero-headline, .la-hero-cta { animation: none; }
    .la-reveal { opacity: 1; transform: none; transition: none; }
    .la-stat-skeleton { animation: none; }
  }

  /* ── Nav links ── */
  .la-nav-links {
    display: flex;
    gap: 32px;
    align-items: center;
  }
  .la-nav-link {
    font-size: 20px;
    color: #000;
    text-decoration: none;
    letter-spacing: -1px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .la-nav-link:hover { text-decoration: underline; }

  /* ── Mobile nav ── */
  .la-nav-menu-btn {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 22px;
    padding: 4px;
    line-height: 1;
    color: #000;
  }
  .la-mobile-menu {
    display: none;
    position: fixed;
    top: 53px;
    left: 0;
    right: 0;
    background: #fff;
    border-bottom: 1px solid #000;
    padding: 20px 15px;
    flex-direction: column;
    gap: 20px;
    z-index: 9998;
  }
  .la-mobile-menu.open { display: flex; }

  @media (max-width: 640px) {
    .la-nav-links { display: none; }
    .la-nav-menu-btn { display: flex; align-items: center; }
  }

  /* ── Hero CTA button ── */
  .la-hero-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 20px;
    color: #000;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    letter-spacing: -1px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    text-decoration: none;
    line-height: 1;
  }
  .la-hero-cta-btn .la-arrow {
    transition: transform 0.2s ease;
  }
  .la-hero-cta-btn:hover .la-arrow {
    transform: translateX(5px);
  }

  /* ── "See Feature" — underlined by default ── */
  .la-see-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 20px;
    color: #000;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    letter-spacing: -1px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    white-space: nowrap;
    text-decoration: underline;
    text-underline-position: from-font;
    line-height: 1;
  }
  .la-see-btn .la-arrow {
    transition: transform 0.2s ease;
  }
  .la-see-btn:hover .la-arrow {
    transform: translateX(5px);
  }

  /* ── CTA large arrow ── */
  .la-cta-arrow {
    transition: transform 0.2s ease;
    cursor: pointer;
    display: block;
  }
  .la-cta-arrow:hover {
    transform: translate(4px, -4px);
  }

  /* ── Footer links ── */
  .la-footer-link {
    font-size: 16px;
    color: #000;
    text-decoration: none;
    letter-spacing: -0.48px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    line-height: 1;
  }
  .la-footer-link:hover { text-decoration: underline; }

  .la-footer-nav-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 16px;
    color: #000;
    text-decoration: none;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  }
  .la-footer-nav-link:hover { text-decoration: underline; }
  .la-footer-nav-link .la-arrow {
    transition: transform 0.2s ease;
  }
  .la-footer-nav-link:hover .la-arrow {
    transform: translateX(3px);
  }

  /* ── Skip link ── */
  .la-skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    padding: 8px 16px;
    background: #000;
    color: #fff;
    z-index: 10000;
    text-decoration: none;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    font-size: 14px;
    transition: top 0.2s;
  }
  .la-skip-link:focus { top: 0; }

  /* ── Hero search ── */
  .la-hero-search-input {
    flex: 1;
    height: 44px;
    padding: 0 16px;
    border: 1px solid #000;
    background: #fff;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    font-size: 16px;
    letter-spacing: -0.48px;
    outline: none;
    color: #000;
  }
  .la-hero-search-input:focus {
    outline: 2px solid #000;
    outline-offset: -1px;
  }
  .la-hero-search-btn {
    height: 44px;
    padding: 0 20px;
    border: 1px solid #000;
    background: #000;
    color: #fff;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    font-size: 16px;
    cursor: pointer;
    letter-spacing: -0.48px;
    white-space: nowrap;
  }
  .la-hero-search-btn:hover { background: #333; }
`;

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */

const ArrowRight = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

/* Large arrow for CTA section */
const ArrowUpRightLarge = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
    stroke="#000" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    className="la-cta-arrow" aria-hidden="true">
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
);

/* ─────────────────────────────────────────────
   LOGO
───────────────────────────────────────────── */

const Logo = ({ height }: { height: string }) => (
  <>
    <img
      src="/logo.png"
      alt="Lineage Agent"
      style={{ height, objectFit: 'contain' }}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
        if (sib) sib.style.display = 'inline';
      }}
    />
    <span style={{
      display: 'none',
      fontWeight: 600,
      letterSpacing: '-0.48px',
      fontSize: height === '16px' ? '20px' : 'clamp(32px, 5vw, 59px)',
      lineHeight: 1,
    }}>
      Lineage
    </span>
  </>
);

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

export function LandingScreen() {
  const navigate = useNavigate();
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroQuery, setHeroQuery] = useState('');

  /* Intersection Observer — scroll reveal */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.la-reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* Fetch global stats */
  useEffect(() => {
    getGlobalStats().then(setGlobalStats).catch(() => {});
  }, []);

  /* Close mobile menu on outside click */
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  const statsDisplay = [
    {
      value: fmtStat(globalStats?.total_scanned_all_time),
      label: 'Tokens analyzed across the Solana ecosystem',
    },
    {
      value: fmtStat(globalStats?.active_deployers_24h),
      label: 'Active deployers tracked in the last 24h',
    },
    {
      value: fmtStat(globalStats?.rug_count_24h),
      label: 'Rug attempts flagged in the last 24h',
    },
  ];

  return (
    <div style={{
      fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
      background: '#ffffff',
      color: '#000000',
      minHeight: '100vh',
      overflowX: 'hidden',
    }}>
      <style>{css}</style>

      {/* ── Skip link ── */}
      <a href="#features" className="la-skip-link">
        Skip to main content
      </a>

      {/* ── Navigation ── */}
      <header>
        <nav className="la-nav" aria-label="Main navigation" style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: '53px', background: '#ffffff',
          borderBottom: '1px solid #000000',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 15px', zIndex: 9999,
        }}>
          <a href="/" aria-label="Lineage Agent — home">
            <Logo height="16px" />
          </a>
          <div className="la-nav-links">
            <a href="#features" className="la-nav-link">Work</a>
            <a href="#about"    className="la-nav-link">About</a>
            <a href="#contact"  className="la-nav-link">Contact</a>
          </div>
          <button
            className="la-nav-menu-btn"
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </nav>

        {/* Mobile menu */}
        <div className={`la-mobile-menu${menuOpen ? ' open' : ''}`} role="navigation" aria-label="Mobile navigation">
          <a href="#features" className="la-nav-link" onClick={() => setMenuOpen(false)}>Work</a>
          <a href="#about"    className="la-nav-link" onClick={() => setMenuOpen(false)}>About</a>
          <a href="#contact"  className="la-nav-link" onClick={() => setMenuOpen(false)}>Contact</a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section aria-labelledby="hero-heading" style={{
        paddingTop: 'calc(53px + 80px)',
        paddingBottom: '150px',
        paddingLeft: '15px',
        paddingRight: '15px',
        borderBottom: '1px solid #000000',
      }}>
        <h1 id="hero-heading" className="la-hero-headline" style={{
          fontSize: 'clamp(44px, 5vw, 64px)',
          fontWeight: 400,
          letterSpacing: '-3.2px',
          lineHeight: 1,
          margin: '0 0 40px 0',
          maxWidth: '915px',
        }}>
          Lineage Agent specializes in tracking the on-chain lineage of your Solana tokens
        </h1>
        <a href="#features" className="la-hero-cta-btn la-hero-cta">
          See Work
          <ArrowRight className="la-arrow" />
        </a>

        {/* Hero search bar */}
        <form
          role="search"
          aria-label="Search tokens"
          style={{ marginTop: '32px', display: 'flex', gap: '12px', maxWidth: '540px' }}
          onSubmit={(e) => {
            e.preventDefault();
            const q = heroQuery.trim();
            if (q) navigate(`/token/${q}`);
          }}
        >
          <input
            type="search"
            className="la-hero-search-input"
            value={heroQuery}
            onChange={(e) => setHeroQuery(e.target.value)}
            placeholder="Analyze any Solana token..."
            aria-label="Token address or name"
          />
          <button type="submit" className="la-hero-search-btn">
            Search
          </button>
        </form>
        <p style={{ marginTop: '8px', fontSize: '13px', color: '#6B6B6B', margin: '8px 0 0 0' }}>
          Try: <code>EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v</code>
        </p>
      </section>

      {/* ── Features / Work ── */}
      <main>
        <section id="features" aria-label="Features" style={{ padding: '0 15px', borderBottom: '1px solid #000000' }}>
          <h2 style={{
            position: 'absolute', width: '1px', height: '1px',
            overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap',
          }}>
            Our Features
          </h2>
          {features.map((feature, i) => (
            <article
              key={i}
              className="la-reveal"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '30px 0',
                borderBottom: i < features.length - 1 ? '1px solid #000000' : 'none',
              }}
            >
              <p style={{
                fontSize: '16px',
                color: '#6B6B6B',
                letterSpacing: '-0.48px',
                margin: 0,
                fontWeight: 600,
              }}>
                {feature.category}
              </p>
              <h3 style={{
                fontSize: '16px',
                fontWeight: 600,
                letterSpacing: '-0.48px',
                margin: 0,
                lineHeight: 1,
                color: '#000',
              }}>
                {feature.title}
              </h3>
              <p style={{
                fontSize: '16px',
                color: '#6B6B6B',
                letterSpacing: '-0.48px',
                margin: 0,
                maxWidth: '600px',
                lineHeight: 1.4,
              }}>
                {feature.description}
              </p>
              <button onClick={() => navigate(feature.route)} className="la-see-btn" aria-label={`See ${feature.title} feature`}>
                See Feature
                <ArrowRight className="la-arrow" />
              </button>
            </article>
          ))}
        </section>

        {/* ── Stats ── */}
        <section
          className="la-reveal"
          aria-label="Platform statistics"
          aria-live="polite"
          style={{
            padding: '50px 15px',
            borderBottom: '1px solid #000000',
            maxWidth: '633px',
          }}
        >
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 37px)',
            fontWeight: 400,
            letterSpacing: '-1.11px',
            lineHeight: 1,
            margin: '0 0 73px 0',
            color: '#000',
          }}>
            Lineage Agent delivers the on-chain intelligence that elevates your Solana strategy.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '73px' }}>
            {statsDisplay.map((stat, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {globalStats === null ? (
                  <div className="la-stat-skeleton" aria-hidden="true" />
                ) : (
                  <p style={{
                    fontSize: 'clamp(64px, 8vw, 105px)',
                    fontWeight: 400,
                    letterSpacing: '-5.25px',
                    margin: 0,
                    lineHeight: 1,
                  }}>
                    <AnimatedStat value={
                      [globalStats.total_scanned_all_time, globalStats.active_deployers_24h, globalStats.rug_count_24h][i] ?? 0
                    } />
                  </p>
                )}
                <p style={{
                  fontSize: '20px',
                  color: '#6B6B6B',
                  letterSpacing: '-0.48px',
                  margin: 0,
                  lineHeight: 1.3,
                }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section id="about" className="la-reveal" aria-label="Contact us" style={{
          padding: '50px 15px',
          borderBottom: '1px solid #000000',
          maxWidth: '625px',
        }}>
          <h2 style={{
            fontSize: 'clamp(24px, 3vw, 37px)',
            fontWeight: 400,
            letterSpacing: '-1.11px',
            lineHeight: 1.1,
            margin: '0 0 16px 0',
          }}>
            Lineage Agent crafts on-chain intelligence strategies that elevate your Solana project.
          </h2>
          <p style={{
            fontSize: '20px',
            color: '#6B6B6B',
            letterSpacing: '-0.48px',
            margin: '0 0 40px 0',
            lineHeight: 1.3,
          }}>
            Connect with us to explore your token's lineage potential.
          </p>
          <a href="mailto:hello@lineageagent.com" aria-label="Contact Lineage Agent by email">
            <ArrowUpRightLarge />
          </a>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer id="contact" role="contentinfo" style={{ padding: '30px 15px 50px 15px', background: '#fff' }}>

        {/* Large logo at top */}
        <div style={{ marginBottom: '50px' }}>
          <Logo height="59px" />
        </div>

        {/* 3 columns: OFFICE / CONTACT / SOCIAL */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '62px',
          marginBottom: '50px',
        }}>
          {/* OFFICE */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#6B6B6B', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>OFFICE</p>
            <p style={{ fontSize: '16px', color: '#000', letterSpacing: '-0.48px', margin: 0, lineHeight: 1.4 }}>
              Solana Ecosystem<br />Global
            </p>
          </div>

          {/* CONTACT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#6B6B6B', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>CONTACT</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <a href="mailto:hello@lineageagent.com" className="la-footer-link" style={{ textDecoration: 'underline' }}>
                hello@lineageagent.com
              </a>
            </div>
          </div>

          {/* SOCIAL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#6B6B6B', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>SOCIAL</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {socialLinks.map(({ label, href }) => (
                <a key={label} href={href} className="la-footer-link" target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom nav — right-aligned with arrows */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '50px',
        }}>
          <a href="#features" className="la-footer-nav-link">
            Work <ArrowRight className="la-arrow" />
          </a>
          <a href="#about" className="la-footer-nav-link">
            About <ArrowRight className="la-arrow" />
          </a>
          <a href="#contact" className="la-footer-nav-link">
            Contact <ArrowRight className="la-arrow" />
          </a>
        </div>
      </footer>
    </div>
  );
}
