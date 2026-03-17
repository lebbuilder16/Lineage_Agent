import { useParams, Link } from 'react-router-dom';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

export default function OperatorPage() {
  const { fingerprint } = useParams<{ fingerprint: string }>();

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 8 }}>Operator Dossier</h1>
      <div className="ff-address" style={{ marginBottom: 32 }}>{fingerprint}</div>

      <div className="ff-section">
        <p className="ff-body">Operator intelligence data will be displayed here when available via the API.</p>
        <Link to="/dashboard" className="ff-link" style={{ marginTop: 16, display: 'inline-flex' }}>
          Back to Dashboard <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </Link>
      </div>
    </div>
  );
}
