/* ─────────────────────────────────────────────
   DATA — Lineage Agent content adapted to
   the Frame & Form structure
───────────────────────────────────────────── */

const features = [
  {
    title: 'Token Radar',
    category: 'Market Intelligence & Discovery',
    description:
      'Our real-time radar surfaces emerging tokens before they trend, analyzing volume patterns and deployer history across the entire Solana ecosystem. Stay ahead with instant alerts and curated insights.',
  },
  {
    title: 'Lineage Scan',
    category: 'Clone Detection & Family Mapping',
    description:
      'Deep scan any token to uncover its full lineage tree, identifying forks, clones, and imposters. Our detection engine maps derivative chains across the Solana ecosystem with precision.',
  },
  {
    title: 'Death Clock',
    category: 'Rug Probability & Soft Rug Detection',
    description:
      'Advanced risk scoring using deployer DNA, factory detection, and behavioral pattern analysis. We flag threats before they materialize, giving you time to protect your portfolio.',
  },
  {
    title: 'Family Tree',
    category: 'Visual Lineage Visualization',
    description:
      'Interactive graph mapping the complete family tree of any token, exposing hidden relationships and derivative chains at a glance. Understand the full genealogy of your tokens.',
  },
  {
    title: 'Cartel Detection',
    category: 'Coordinated Deployer Networks',
    description:
      'Identify clusters of wallets operating as coordinated bad actors, deploying waves of scam tokens across Solana. Our network analysis reveals the connections others miss.',
  },
  {
    title: 'Sol Trace',
    category: 'On-Chain Transaction Forensics',
    description:
      "Trace any token's complete on-chain footprint from genesis block through current activity. Full transparency and precision in tracking fund flows and transaction histories.",
  },
];

const stats = [
  { value: '50K+', label: 'Tokens analyzed across the Solana ecosystem' },
  { value: '1K+', label: 'Active lineage families tracked in real time' },
  { value: '500+', label: 'Rug attempts identified and flagged' },
];

/* ─────────────────────────────────────────────
   CSS — animations + hover states matching
   Frame & Form (Figma) exactly
───────────────────────────────────────────── */

const css = `
  /* ── Global Reset for Landing ── */
  .la-root {
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    background: #ffffff;
    color: #000000;
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .la-root *, .la-root *::before, .la-root *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* ── Navigation Links ── */
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
    line-height: 1;
  }
  .la-nav-link:hover {
    text-decoration: underline;
  }

  /* ── "See Feature →" Buttons ── */
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
    line-height: 1;
  }
  .la-see-btn:hover {
    text-decoration: underline;
  }
  .la-see-btn .la-arrow {
    transition: transform 0.25s ease;
  }
  .la-see-btn:hover .la-arrow {
    transform: translateX(5px);
  }

  /* ── Hero CTA Button ── */
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
    line-height: 1;
  }
  .la-cta-btn:hover {
    text-decoration: underline;
  }
  .la-cta-btn .la-arrow {
    transition: transform 0.25s ease;
  }
  .la-cta-btn:hover .la-arrow {
    transform: translateX(5px);
  }

  /* ── About CTA Button ── */
  .la-about-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-top: 30px;
    padding: 0;
    font-size: 20px;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    color: #000;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: none;
    line-height: 1;
  }
  .la-about-btn:hover {
    text-decoration: underline;
  }
  .la-about-btn .la-arrow {
    transition: transform 0.25s ease;
  }
  .la-about-btn:hover .la-arrow {
    transform: translateX(5px);
  }

  /* ── Stats Item Hover ── */
  .la-stat-arrow {
    flex-shrink: 0;
    transition: transform 0.25s ease;
  }
  .la-stat-item:hover .la-stat-arrow {
    transform: translate(3px, -3px);
  }

  /* ── Footer Links ── */
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
  .la-footer-link:hover {
    text-decoration: underline;
  }

  /* ── Social Link ── */
  .la-social-link {
    font-size: 15px;
    color: #000;
    text-decoration: none;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
    line-height: 1.6;
  }
  .la-social-link:hover {
    text-decoration: underline;
  }

  /* ── Feature Item Hover ── */
  .la-feature-item {
    transition: background-color 0.2s ease;
  }
  .la-feature-item:hover {
    background-color: #fafafa;
  }

  /* ── Responsive Breakpoints ── */
  @media (max-width: 800px) {
    .la-hero-heading {
      font-size: 44px !important;
      letter-spacing: -2px !important;
    }
    .la-feature-item {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 20px !important;
    }
    .la-stats-section {
      flex-direction: column !important;
      gap: 40px !important;
    }
    .la-footer-grid {
      grid-template-columns: 1fr !important;
      gap: 40px !important;
    }
    .la-footer-columns {
      flex-direction: column !important;
      gap: 30px !important;
    }
    .la-footer-bottom {
      flex-direction: column !important;
      align-items: flex-start !important;
      gap: 20px !important;
    }
    .la-see-btn {
      font-size: 16px;
    }
    .la-nav-link {
      font-size: 16px;
    }
  }

  @media (min-width: 1280px) {
    .la-hero-heading {
      font-size: 75px !important;
      letter-spacing: -5.25px !important;
    }
  }
`;

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */

const ArrowRight = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const ArrowUpRight = ({ className = '' }: { className?: string }) => (
  <svg
    className={className}
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#767676"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
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
    <span
      style={{
        display: 'none',
        fontSize: '20px',
        fontWeight: 600,
        letterSpacing: '-0.48px',
        lineHeight: 1,
      }}
    >
      Lineage Agent
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
    <span
      style={{
        display: 'none',
        fontSize: 'clamp(32px, 5vw, 59px)',
        fontWeight: 600,
        letterSpacing: '-3px',
        lineHeight: 1,
      }}
    >
      Lineage Agent
    </span>
  </>
);

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

export function LandingScreen() {
  return (
    <div className="la-root">
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
          zIndex: 9999,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <NavLogo />
        </div>
        <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
          <a href="#features" className="la-nav-link">
            Features
          </a>
          <a href="#about" className="la-nav-link">
            About
          </a>
          <a href="#contact" className="la-nav-link">
            Contact
          </a>
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
          className="la-hero-heading"
          style={{
            fontSize: 'clamp(44px, 5vw, 64px)',
            fontWeight: 400,
            letterSpacing: '-3.2px',
            lineHeight: 1,
            margin: 0,
            maxWidth: '915px',
            fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Lineage Agent specializes in tracking the on-chain lineage of your
          Solana tokens
        </h1>

        <a href="#features" className="la-cta-btn">
          Discover Features
          <ArrowRight className="la-arrow" />
        </a>
      </section>

      {/* ── Features ── */}
      <section
        id="features"
        style={{ padding: '0 15px', borderBottom: '1px solid #000000' }}
      >
        {features.map((feature, i) => (
          <div
            key={i}
            className="la-feature-item"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '32px 0',
              borderBottom:
                i < features.length - 1 ? '1px solid #000000' : 'none',
              gap: '32px',
            }}
          >
            <div style={{ flex: 1 }}>
              <p
                style={{
                  fontSize: '15px',
                  color: '#767676',
                  letterSpacing: '-0.48px',
                  margin: '0 0 10px 0',
                  fontWeight: 400,
                  fontFamily: '"Figtree", sans-serif',
                }}
              >
                {feature.category}
              </p>
              <h2
                style={{
                  fontSize: 'clamp(24px, 3vw, 37px)',
                  fontWeight: 400,
                  letterSpacing: '-2px',
                  margin: '0 0 15px 0',
                  lineHeight: 1.1,
                  color: '#000000',
                  fontFamily:
                    '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
                }}
              >
                {feature.title}
              </h2>
              <p
                style={{
                  fontSize: '20px',
                  color: '#767676',
                  letterSpacing: '-1px',
                  margin: 0,
                  maxWidth: '633px',
                  lineHeight: 1.4,
                  fontFamily: '"Figtree", sans-serif',
                }}
              >
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
        className="la-stats-section"
        style={{
          padding: '50px 15px',
          borderBottom: '1px solid #000000',
          display: 'flex',
          gap: '30px',
          flexWrap: 'wrap',
        }}
      >
        {stats.map((stat, i) => (
          <div
            key={i}
            className="la-stat-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
              flex: '1 1 200px',
              cursor: 'default',
            }}
          >
            <div>
              <p
                style={{
                  fontSize: 'clamp(24px, 3vw, 37px)',
                  fontWeight: 600,
                  letterSpacing: '-2px',
                  margin: '0 0 4px 0',
                  lineHeight: 1,
                  color: '#000000',
                  fontFamily:
                    '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  fontSize: '16px',
                  color: '#767676',
                  letterSpacing: '-0.48px',
                  margin: 0,
                  lineHeight: 1.4,
                  fontFamily: '"Figtree", sans-serif',
                }}
              >
                {stat.label}
              </p>
            </div>
            <ArrowUpRight className="la-stat-arrow" />
          </div>
        ))}
      </section>

      {/* ── About ── */}
      <section
        id="about"
        style={{
          padding: '80px 15px',
          borderBottom: '1px solid #000000',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(24px, 3vw, 37px)',
            fontWeight: 400,
            letterSpacing: '-2px',
            margin: 0,
            maxWidth: '700px',
            lineHeight: 1.2,
            color: '#000000',
            fontFamily:
              '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Lineage Agent builds on-chain intelligence that protects your Solana
          portfolio
        </h2>
        <a href="#contact" className="la-about-btn">
          About
          <ArrowRight className="la-arrow" />
        </a>
      </section>

      {/* ── Contact CTA ── */}
      <section
        style={{
          padding: '80px 15px',
          borderBottom: '1px solid #000000',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(24px, 3vw, 37px)',
            fontWeight: 400,
            letterSpacing: '-2px',
            margin: 0,
            maxWidth: '700px',
            lineHeight: 1.2,
            color: '#000000',
            fontFamily:
              '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
          }}
        >
          Connect with us to explore your token's lineage potential
        </h2>
      </section>

      {/* ── Footer ── */}
      <footer id="contact" style={{ padding: '50px 15px' }}>
        {/* Footer columns */}
        <div
          className="la-footer-columns"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '50px',
            marginBottom: '60px',
            flexWrap: 'wrap',
          }}
        >
          {/* ECOSYSTEM */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: '#767676',
                margin: 0,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                fontWeight: 500,
                fontFamily: '"Figtree", sans-serif',
              }}
            >
              ECOSYSTEM
            </p>
            <p
              style={{
                fontSize: '15px',
                color: '#000',
                margin: 0,
                letterSpacing: '-0.48px',
                lineHeight: 1.5,
                fontFamily: '"Figtree", sans-serif',
              }}
            >
              Solana Blockchain
              <br />
              On-Chain Intelligence
            </p>
          </div>

          {/* CONTACT */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: '#767676',
                margin: 0,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                fontWeight: 500,
                fontFamily: '"Figtree", sans-serif',
              }}
            >
              CONTACT
            </p>
            <a
              href="mailto:hello@lineageagent.com"
              className="la-social-link"
              style={{ color: '#000' }}
            >
              hello@lineageagent.com
            </a>
          </div>

          {/* SOCIAL */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: '#767676',
                margin: 0,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                fontWeight: 500,
                fontFamily: '"Figtree", sans-serif',
              }}
            >
              SOCIAL
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {[
                { name: 'Twitter', href: '#' },
                { name: 'Telegram', href: '#' },
                { name: 'GitHub', href: '#' },
              ].map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="la-social-link"
                >
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Footer bottom */}
        <div
          style={{
            borderTop: '1px solid #000000',
            paddingTop: '26px',
            display: 'flex',
            flexDirection: 'column',
            gap: '26px',
          }}
        >
          <div>
            <FooterLogo />
          </div>
          <div
            className="la-footer-bottom"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', gap: '32px' }}>
              <a href="#features" className="la-footer-link">
                Features
              </a>
              <a href="#about" className="la-footer-link">
                About
              </a>
              <a href="#contact" className="la-footer-link">
                Contact
              </a>
            </div>
            <span
              style={{
                fontSize: '15px',
                color: '#767676',
                letterSpacing: '-0.48px',
                fontFamily: '"Figtree", sans-serif',
              }}
            >
              © 2026 Lineage Agent
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
