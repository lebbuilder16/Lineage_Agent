import { useEffect } from 'react';

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const features = [
  {
    title: 'Token Radar',
    category: 'Market Intelligence & Discovery',
    description: 'Our real-time radar surfaces emerging tokens before they trend, analyzing volume patterns and deployer history across Solana.',
  },
  {
    title: 'Lineage Scan',
    category: 'Clone Detection & Family Mapping',
    description: 'Deep scan any token to uncover its full lineage tree, identifying forks, clones, and imposters across the Solana ecosystem.',
  },
  {
    title: 'Death Clock',
    category: 'Rug Probability & Soft Rug Detection',
    description: 'Advanced risk scoring using deployer DNA, factory detection, and behavioral pattern analysis to flag threats before they materialize.',
  },
  {
    title: 'Family Tree',
    category: 'Visual Lineage Visualization',
    description: 'Interactive graph mapping the complete family tree of any token, exposing hidden relationships and derivative chains at a glance.',
  },
  {
    title: 'Cartel Detection',
    category: 'Coordinated Deployer Networks',
    description: 'Identify clusters of wallets operating as coordinated bad actors, deploying waves of scam tokens across the Solana ecosystem.',
  },
  {
    title: 'Sol Trace',
    category: 'On-Chain Transaction Forensics',
    description: "Trace any token's complete on-chain footprint from genesis block through current activity with full transparency and precision.",
  },
];

const stats = [
  { value: '—', label: 'Tokens analyzed across the Solana ecosystem' },
  { value: '—', label: 'Active lineage families tracked in real time' },
  { value: '—', label: 'Rug attempts identified and flagged' },
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
  }

  /* ── Nav links ── */
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
`;

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */

const ArrowRight = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

/* Large arrow for CTA section */
const ArrowUpRightLarge = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
    stroke="#000" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
    className="la-cta-arrow">
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

  return (
    <div style={{
      fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
      background: '#ffffff',
      color: '#000000',
      minHeight: '100vh',
      overflowX: 'hidden',
    }}>
      <style>{css}</style>

      {/* ── Navigation ── */}
      <nav className="la-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: '53px', background: '#ffffff',
        borderBottom: '1px solid #000000',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 15px', zIndex: 9999,
      }}>
        <Logo height="16px" />
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <a href="#features" className="la-nav-link">Work</a>
          <a href="#about"    className="la-nav-link">About</a>
          <a href="#contact"  className="la-nav-link">Contact</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        paddingTop: 'calc(53px + 80px)',
        paddingBottom: '150px',
        paddingLeft: '15px',
        paddingRight: '15px',
        borderBottom: '1px solid #000000',
      }}>
        <h1 className="la-hero-headline" style={{
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
      </section>

      {/* ── Features / Work ── */}
      <section id="features" style={{ padding: '0 15px', borderBottom: '1px solid #000000' }}>
        {features.map((feature, i) => (
          <div
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
              color: '#767676',
              letterSpacing: '-0.48px',
              margin: 0,
              fontWeight: 600,
            }}>
              {feature.category}
            </p>
            <p style={{
              fontSize: '16px',
              fontWeight: 600,
              letterSpacing: '-0.48px',
              margin: 0,
              lineHeight: 1,
              color: '#000',
            }}>
              {feature.title}
            </p>
            <p style={{
              fontSize: '16px',
              color: '#767676',
              letterSpacing: '-0.48px',
              margin: 0,
              maxWidth: '600px',
              lineHeight: 1.4,
            }}>
              {feature.description}
            </p>
            <a href="#contact" className="la-see-btn">
              See Feature
              <ArrowRight className="la-arrow" />
            </a>
          </div>
        ))}
      </section>

      {/* ── Stats ── */}
      <section className="la-reveal" style={{
        padding: '50px 15px',
        borderBottom: '1px solid #000000',
        maxWidth: '633px',
      }}>
        {/* Headline above stats */}
        <p style={{
          fontSize: 'clamp(24px, 3vw, 37px)',
          fontWeight: 400,
          letterSpacing: '-1.11px',
          lineHeight: 1,
          margin: '0 0 73px 0',
          color: '#000',
        }}>
          Lineage Agent delivers the on-chain intelligence that elevates your Solana strategy.
        </p>

        {/* Stats — flex column, 73px gap, 105px display numbers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '73px' }}>
          {stats.map((stat, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{
                fontSize: 'clamp(64px, 8vw, 105px)',
                fontWeight: 400,
                letterSpacing: '-5.25px',
                margin: 0,
                lineHeight: 1,
              }}>
                {stat.value}
              </p>
              <p style={{
                fontSize: '20px',
                color: '#767676',
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
      <section id="about" className="la-reveal" style={{
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
          color: '#767676',
          letterSpacing: '-0.48px',
          margin: '0 0 40px 0',
          lineHeight: 1.3,
        }}>
          Connect with us to explore your token's lineage potential.
        </p>
        <ArrowUpRightLarge />
      </section>

      {/* ── Footer ── */}
      <footer id="contact" style={{ padding: '30px 15px 50px 15px', background: '#fff' }}>

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
            <p style={{ fontSize: '16px', color: '#767676', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>OFFICE</p>
            <p style={{ fontSize: '16px', color: '#000', letterSpacing: '-0.48px', margin: 0, lineHeight: 1.4 }}>
              Solana Ecosystem<br />Global
            </p>
          </div>

          {/* CONTACT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#767676', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>CONTACT</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <a href="mailto:hello@lineageagent.com" className="la-footer-link" style={{ textDecoration: 'underline' }}>
                hello@lineageagent.com
              </a>
            </div>
          </div>

          {/* SOCIAL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#767676', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>SOCIAL</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['Twitter', 'Telegram', 'GitHub'].map((link) => (
                <a key={link} href="#" className="la-footer-link">{link}</a>
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
