import { Link } from 'react-router-dom';

/* ─────────────────────────────────────────────
   ICONS (same as LandingScreen)
───────────────────────────────────────────── */

const ArrowRight = ({ className = '' }: { className?: string }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const Logo = () => (
  <>
    <img
      src="/logo.png"
      alt="Lineage Agent"
      style={{ height: '16px', objectFit: 'contain' }}
      onError={(e) => {
        e.currentTarget.style.display = 'none';
        const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
        if (sib) sib.style.display = 'inline';
      }}
    />
    <span style={{ display: 'none', fontWeight: 600, letterSpacing: '-0.48px', fontSize: '20px', lineHeight: 1 }}>
      Lineage
    </span>
  </>
);

/* ─────────────────────────────────────────────
   CSS
───────────────────────────────────────────── */

const css = `
  .pp-nav-link {
    font-size: 20px; color: #000; text-decoration: none;
    letter-spacing: -1px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  }
  .pp-nav-link:hover { text-decoration: underline; }

  .pp-footer-nav-link {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 16px; color: #000; text-decoration: none;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  }
  .pp-footer-nav-link:hover { text-decoration: underline; }
  .pp-footer-nav-link .pp-arrow { transition: transform 0.2s ease; }
  .pp-footer-nav-link:hover .pp-arrow { transform: translateX(3px); }

  .pp-footer-link {
    font-size: 16px; color: #000; text-decoration: none;
    letter-spacing: -0.48px;
    font-family: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  }
  .pp-footer-link:hover { text-decoration: underline; }
`;

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

export function PrivacyPolicy() {
  const baseText: React.CSSProperties = {
    fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    fontSize: '16px',
    letterSpacing: '-0.48px',
    lineHeight: 1.6,
    color: '#000',
    margin: '0 0 16px 0',
  };

  const headingStyle: React.CSSProperties = {
    fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    fontWeight: 600,
    fontSize: '20px',
    letterSpacing: '-0.8px',
    lineHeight: 1,
    margin: '40px 0 12px 0',
    color: '#000',
  };

  return (
    <div style={{
      fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
      background: '#ffffff',
      color: '#000000',
      minHeight: '100vh',
    }}>
      <style>{css}</style>

      {/* Navigation */}
      <header>
        <nav aria-label="Main navigation" style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          height: '53px', background: '#fff',
          borderBottom: '1px solid #000',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 15px', zIndex: 9999,
        }}>
          <Link to="/" aria-label="Lineage Agent — home">
            <Logo />
          </Link>
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
            <Link to="/#features" className="pp-nav-link">Work</Link>
            <Link to="/#about"    className="pp-nav-link">About</Link>
            <Link to="/#contact"  className="pp-nav-link">Contact</Link>
          </div>
        </nav>
      </header>

      {/* Content */}
      <main style={{
        paddingTop: 'calc(53px + 60px)',
        paddingBottom: '100px',
        paddingLeft: '15px',
        paddingRight: '15px',
        maxWidth: '760px',
      }}>
        <h1 style={{
          fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
          fontSize: 'clamp(32px, 4vw, 48px)',
          fontWeight: 400,
          letterSpacing: '-2px',
          lineHeight: 1,
          margin: '0 0 12px 0',
        }}>
          Privacy Policy
        </h1>
        <p style={{ ...baseText, color: '#6B6B6B', margin: '0 0 48px 0' }}>
          Last updated: March 16, 2026
        </p>

        <p style={baseText}>
          Lineage Agent ("we", "us", "our") operates the website lineagefun.xyz. This page
          informs you of our policies regarding the collection, use and disclosure of personal
          data when you use our service.
        </p>

        <h2 style={headingStyle}>Data We Collect</h2>
        <p style={baseText}>
          We do not operate a traditional user account system. The only data stored on your
          device is an API key saved in your browser's <code>localStorage</code> under the key{' '}
          <code>lineage_api_key</code>. This key is used solely to authenticate requests to the
          Lineage Agent API and remains on your device. You can remove it at any time by
          clearing your browser's local storage.
        </p>
        <p style={baseText}>
          We also store your cookie consent preference under the key{' '}
          <code>lineage_cookie_consent</code> in <code>localStorage</code>.
        </p>

        <h2 style={headingStyle}>Third-Party Services</h2>
        <p style={baseText}>
          <strong>Google Fonts</strong> — Our website loads the Instrument Sans typeface from
          Google Fonts (fonts.googleapis.com). When your browser requests this font, Google may
          collect your IP address and usage data in accordance with{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"
            style={{ color: '#000', textDecoration: 'underline' }}>
            Google's Privacy Policy
          </a>.
        </p>
        <p style={baseText}>
          <strong>Lineage Agent API</strong> — All token analysis requests are sent to our
          backend API hosted at <code>lineage-agent.fly.dev</code>. This service processes
          Solana blockchain data (public on-chain information) and does not store personally
          identifiable information beyond your API key.
        </p>

        <h2 style={headingStyle}>Cookies</h2>
        <p style={baseText}>
          We do not set first-party cookies. Google Fonts may set cookies as part of their
          content delivery. You can control cookies through your browser settings.
        </p>

        <h2 style={headingStyle}>Your Rights (GDPR)</h2>
        <p style={baseText}>
          If you are located in the European Economic Area, you have the following rights:
        </p>
        <ul style={{ ...baseText, paddingLeft: '24px' }}>
          <li style={{ marginBottom: '8px' }}>
            <strong>Access</strong> — You can inspect your stored API key at any time via your
            browser's developer tools under Application → Local Storage.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Deletion</strong> — Clear your browser's local storage for this site to
            remove all stored data immediately.
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Objection</strong> — You may decline the use of Google Fonts via the cookie
            consent banner. Note that the font will then load from your browser's system fallback.
          </li>
        </ul>

        <h2 style={headingStyle}>Data Retention</h2>
        <p style={baseText}>
          Your API key is stored in localStorage on your device until you remove it. We do not
          maintain server-side user data records beyond what is strictly necessary to process
          real-time API requests.
        </p>

        <h2 style={headingStyle}>Contact</h2>
        <p style={baseText}>
          For any privacy-related questions, please contact us at:{' '}
          <a href="mailto:hello@lineageagent.com" style={{ color: '#000', textDecoration: 'underline' }}>
            hello@lineageagent.com
          </a>
        </p>
      </main>

      {/* Footer */}
      <footer role="contentinfo" style={{ padding: '30px 15px 50px 15px', background: '#fff', borderTop: '1px solid #000' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '62px',
          marginBottom: '50px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#6B6B6B', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>OFFICE</p>
            <p style={{ fontSize: '16px', color: '#000', letterSpacing: '-0.48px', margin: 0, lineHeight: 1.4 }}>
              Solana Ecosystem<br />Global
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#6B6B6B', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>CONTACT</p>
            <a href="mailto:hello@lineageagent.com" className="pp-footer-link" style={{ textDecoration: 'underline' }}>
              hello@lineageagent.com
            </a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '16px', color: '#6B6B6B', letterSpacing: '-0.48px', fontWeight: 600, margin: 0 }}>SOCIAL</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Twitter',  href: 'https://twitter.com/lineageagent' },
                { label: 'Telegram', href: 'https://t.me/lineageagent' },
                { label: 'GitHub',   href: 'https://github.com/lineageagent' },
              ].map(({ label, href }) => (
                <a key={label} href={href} className="pp-footer-link" target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '50px' }}>
          <Link to="/#features" className="pp-footer-nav-link">
            Work <ArrowRight className="pp-arrow" />
          </Link>
          <Link to="/#about" className="pp-footer-nav-link">
            About <ArrowRight className="pp-arrow" />
          </Link>
          <Link to="/#contact" className="pp-footer-nav-link">
            Contact <ArrowRight className="pp-arrow" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
