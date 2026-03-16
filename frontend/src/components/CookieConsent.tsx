import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'lineage_cookie_consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  };

  const btnBase: React.CSSProperties = {
    height: '36px',
    padding: '0 16px',
    border: '1px solid #000',
    cursor: 'pointer',
    fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    fontSize: '14px',
    letterSpacing: '-0.3px',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-describedby="cookie-desc"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#fff',
        borderTop: '1px solid #000',
        padding: '16px 15px',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
        zIndex: 99999,
        fontFamily: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <p
        id="cookie-desc"
        style={{ flex: 1, fontSize: '14px', color: '#6B6B6B', margin: 0, minWidth: '200px', letterSpacing: '-0.3px', lineHeight: 1.4 }}
      >
        We use cookies and third-party services (Google Fonts). See our{' '}
        <Link to="/privacy" style={{ color: '#000', textDecoration: 'underline' }}>
          Privacy Policy
        </Link>
        .
      </p>
      <button onClick={decline} style={{ ...btnBase, background: '#fff', color: '#000' }}>
        Decline
      </button>
      <button onClick={accept} style={{ ...btnBase, background: '#000', color: '#fff' }}>
        Accept
      </button>
    </div>
  );
}
