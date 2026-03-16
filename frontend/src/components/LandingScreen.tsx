/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const features = [
  {
    title: 'Token Radar',
    category: 'Market Intelligence & Discovery',
    description:
      'Our real-time radar surfaces emerging tokens before they trend, analyzing volume patterns and deployer history across Solana.',
  },
  {
    title: 'Lineage Scan',
    category: 'Clone Detection & Family Mapping',
    description:
      'Deep scan any token to uncover its full lineage tree, identifying forks, clones, and imposters across the Solana ecosystem.',
  },
  {
    title: 'Death Clock',
    category: 'Rug Probability & Soft Rug Detection',
    description:
      'Advanced risk scoring using deployer DNA, factory detection, and behavioral pattern analysis to flag threats before they materialize.',
  },
  {
    title: 'Family Tree',
    category: 'Visual Lineage Visualization',
    description:
      'Interactive graph mapping the complete family tree of any token, exposing hidden relationships and derivative chains at a glance.',
  },
  {
    title: 'Cartel Detection',
    category: 'Coordinated Deployer Networks',
    description:
      'Identify clusters of wallets operating as coordinated bad actors, deploying waves of scam tokens across the Solana ecosystem.',
  },
  {
    title: 'Sol Trace',
    category: 'On-Chain Transaction Forensics',
    description:
      "Trace any token's complete on-chain footprint from genesis block through current activity with full transparency and precision.",
  },
];

const stats = [
  { value: '—', label: 'Tokens analyzed across the Solana ecosystem' },
  { value: '—', label: 'Active lineage families tracked in real time' },
  { value: '—', label: 'Rug attempts identified and flagged' },
];

const marqueeItems = [
  'TOKEN RADAR',
  'LINEAGE SCAN',
  'DEATH CLOCK',
  'FAMILY TREE',
  'CARTEL DETECTION',
  'SOL TRACE',
  'ON-CHAIN INTELLIGENCE',
  'SOLANA ECOSYSTEM',
];

/* ─────────────────────────────────────────────
   CSS — all animations + hover states
───────────────────────────────────────────── */

const css = `
  @keyframes marqueeScroll {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }

  .la-marquee-track {
    display: flex;
    width: max-content;
    animation: marqueeScroll 30s linear infinite;
  }
  .la-marquee-wrap:hover .la-marquee-track {
    animation-play-state: paused;
  }

  .la-nav-link {
    font-size: 20px;
    color: #000;
    text-decoration: none;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .la-nav-link:hover {
    text-decoration: underline;
  }

  .la-see-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 20px;
    color: #000;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    flex-shrink: 0;
    align-self: center;
    white-space: nowrap;
    text-decoration: none;
  }
  .la-see-btn:hover {
    text-decoration: underline;
  }
  .la-see-btn .la-arrow {
    transition: transform 0.2s ease;
  }
  .la-see-btn:hover .la-arrow {
    transform: translateX(5px);
  }

  .la-cta-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-top: 50px;
    padding: 0;
    font-size: 20px;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    color: #000;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: none;
  }
  .la-cta-btn:hover {
    text-decoration: underline;
  }
  .la-cta-btn .la-arrow {
    transition: transform 0.2s ease;
  }
  .la-cta-btn:hover .la-arrow {
    transform: translateX(5px);
  }

  .la-stat-arrow {
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }
  .la-stat-item:hover .la-stat-arrow {
    transform: translate(3px, -3px);
  }

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
  }
  .la-footer-link:hover {
    text-decoration: underline;
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

const ArrowUpRight = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="#767676" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="17" x2="17" y2="7" />
    <polyline points="7 7 17 7 17 17" />
  </svg>
);

/* ─────────────────────────────────────────────
   LOGO — drop logo.png (or logo.svg) into
   frontend/public/ to replace the wordmark
───────────────────────────────────────────── */

const NavLogo = () => (
  <>
    <img
      src="/logo.png"
      alt="Lineage Agent"
      style={{ height: '16px', objectFit: 'contain' }}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
        if (sib) sib.style.display = 'block';
      }}
    />
    <span style={{ display: 'none', fontSize: '20px', fontWeight: 600, letterSpacing: '-0.48px' }}>
      Lineage
    </span>
  </>
);

const FooterLogo = () => (
  <>
    <img
      src="/logo.png"
      alt="Lineage Agent"
      style={{ height: '59px', objectFit: 'contain' }}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
        if (sib) sib.style.display = 'block';
      }}
    />
    <span style={{ display: 'none', fontSize: 'clamp(32px, 5vw, 59px)', fontWeight: 600, letterSpacing: '-3px', lineHeight: 1 }}>
      Lineage
    </span>
  </>
);

/* ─────────────────────────────────────────────
   MARQUEE
───────────────────────────────────────────── */

const Marquee = () => {
  const items = [...marqueeItems, ...marqueeItems];
  return (
    <div
      className="la-marquee-wrap"
      style={{ overflow: 'hidden', borderBottom: '1px solid #000', borderTop: '1px solid #000', padding: '12px 0' }}
    >
      <div className="la-marquee-track">
        {items.map((item, i) => (
          <span
            key={i}
            style={{
              fontSize: '15px',
              fontWeight: 500,
              letterSpacing: '-0.48px',
              textTransform: 'uppercase',
              paddingRight: '73px',
              whiteSpace: 'nowrap',
              color: i % 2 === 0 ? '#000' : '#767676',
            }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

export function LandingScreen() {
  return (
    <div
      style={{
        fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
        background: '#ffffff',
        color: '#000000',
        minHeight: '100vh',
        overflowX: 'hidden',
      }}
    >
      <style>{css}</style>

      {/* ── Navigation ── */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '53px',
          background: '#ffffff',
          borderBottom: '1px solid #000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 15px',
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <NavLogo />
        </div>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <a href="#features" className="la-nav-link">Features</a>
          <a href="#about"    className="la-nav-link">About</a>
          <a href="#contact"  className="la-nav-link">Contact</a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{
          paddingTop: 'calc(53px + 80px)',
          paddingBottom: '150px',
          paddingLeft: '15px',
          paddingRight: '15px',
          borderBottom: '1px solid #000000',
        }}
      >
        <h1
          style={{
            fontSize: 'clamp(44px, 5vw, 64px)',
            fontWeight: 400,
            letterSpacing: '-3.2px',
            lineHeight: 1.05,
            margin: 0,
            maxWidth: '915px',
          }}
        >
          Lineage Agent specializes in tracking the on-chain lineage of your Solana tokens
        </h1>

        <a href="#features" className="la-cta-btn">
          Discover Features
          <ArrowRight className="la-arrow" />
        </a>
      </section>

      {/* ── Marquee ── */}
      <Marquee />

      {/* ── Features ── */}
      <section id="features" style={{ padding: '0 15px', borderBottom: '1px solid #000000' }}>
        {features.map((feature, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '30px 0',
              borderBottom: i < features.length - 1 ? '1px solid #000000' : 'none',
              gap: '32px',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '16px', color: '#767676', letterSpacing: '-0.48px', margin: '0 0 10px 0', fontWeight: 400 }}>
                {feature.category}
              </p>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 37px)', fontWeight: 400, letterSpacing: '-2px', margin: '0 0 15px 0', lineHeight: 1.1 }}>
                {feature.title}
              </h2>
              <p style={{ fontSize: '20px', color: '#767676', letterSpacing: '-1px', margin: 0, maxWidth: '600px', lineHeight: 1.4 }}>
                {feature.description}
              </p>
            </div>
            <a href="#contact" className="la-see-btn">
              See Feature
              <ArrowRight className="la-arrow" />
            </a>
          </div>
        ))}
      </section>

      {/* ── Stats ── */}
      <section
        style={{
          padding: '50px 15px',
          borderBottom: '1px solid #000000',
          display: 'flex',
          gap: '30px',
          flexWrap: 'wrap',
        }}
      >
        {stats.map((stat, i) => (
          <div key={i} className="la-stat-item" style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: '1 1 200px', cursor: 'default' }}>
            <div>
              <p style={{ fontSize: 'clamp(24px, 3vw, 37px)', fontWeight: 600, letterSpacing: '-2px', margin: '0 0 4px 0', lineHeight: 1 }}>
                {stat.value}
              </p>
              <p style={{ fontSize: '16px', color: '#767676', letterSpacing: '-0.48px', margin: 0, lineHeight: 1.4 }}>
                {stat.label}
              </p>
            </div>
            <ArrowUpRight className="la-stat-arrow" />
          </div>
        ))}
      </section>

      {/* ── About ── */}
      <section id="about" style={{ padding: '80px 15px', borderBottom: '1px solid #000000' }}>
        <h2
          style={{ fontSize: 'clamp(24px, 3vw, 37px)', fontWeight: 400, letterSpacing: '-2px', margin: 0, maxWidth: '700px', lineHeight: 1.2 }}
        >
          Lineage Agent builds on-chain intelligence that protects your Solana portfolio
        </h2>
      </section>

      {/* ── Footer ── */}
      <footer id="contact" style={{ padding: '50px 15px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '50px',
            marginBottom: '50px',
          }}
        >
          <h3 style={{ fontSize: 'clamp(24px, 3vw, 37px)', fontWeight: 400, letterSpacing: '-2px', margin: 0, lineHeight: 1.2 }}>
            Connect with us to explore your token's lineage potential
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '15px', color: '#767676', margin: 0, letterSpacing: '-0.48px' }}>Solana Ecosystem</p>
            <p style={{ fontSize: '15px', color: '#767676', margin: 0, letterSpacing: '-0.48px' }}>hello@lineageagent.com</p>
            <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
              {['Twitter', 'Telegram', 'GitHub'].map((link) => (
                <a key={link} href="#" className="la-footer-link">{link}</a>
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #000000', paddingTop: '26px', display: 'flex', flexDirection: 'column', gap: '26px' }}>
          <div>
            <FooterLogo />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '32px' }}>
              <a href="#features" className="la-footer-link">Features</a>
              <a href="#about"    className="la-footer-link">About</a>
              <a href="#contact"  className="la-footer-link">Contact</a>
            </div>
            <span style={{ fontSize: '15px', color: '#767676', letterSpacing: '-0.48px' }}>© 2026 Lineage Agent</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
