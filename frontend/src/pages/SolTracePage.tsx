import { useParams, Link } from 'react-router-dom';
import { useSolTrace } from '../lib/query';

const ff = { font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif', gray: '#6B6B6B' };

export default function SolTracePage() {
  const { mint } = useParams<{ mint: string }>();
  const { data, isLoading, error } = useSolTrace(mint ?? '');

  if (isLoading) return <div style={{ maxWidth: 700 }}><div className="ff-skeleton" style={{ height: 40, width: '50%', marginBottom: 16 }} /><div className="ff-skeleton" style={{ height: 300 }} /></div>;
  if (error) return <p style={{ fontFamily: ff.font }}>Error: {(error as Error).message}</p>;
  if (!data) return null;

  return (
    <div style={{ maxWidth: 700, fontFamily: ff.font }}>
      <h1 className="ff-page-title" style={{ marginBottom: 8 }}>SOL Trace</h1>
      <div className="ff-address" style={{ marginBottom: 32 }}>{mint}</div>

      {/* Summary */}
      <div className="ff-section">
        <div className="ff-stat-grid">
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>SOL Extracted</div><div className="ff-stat-number">{data.total_extracted_sol?.toFixed(1) ?? '—'}</div></div>
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>USD Value</div><div className="ff-stat-number">{data.total_extracted_usd != null ? `$${data.total_extracted_usd.toLocaleString()}` : '—'}</div></div>
          <div><div className="ff-label" style={{ fontSize: 13, marginBottom: 4 }}>Hops</div><div className="ff-stat-number">{data.hop_count ?? data.flows?.length ?? '—'}</div></div>
        </div>
        {data.known_cex_detected && <p style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.48px', color: '#000', marginTop: 16 }}>CEX DETECTED IN FLOW PATH</p>}
      </div>

      {/* Flows Table */}
      {data.flows && data.flows.length > 0 && (
        <div className="ff-section">
          <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Transfers</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: ff.font }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 13, fontWeight: 600, color: ff.gray }}>From</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 13, fontWeight: 600, color: ff.gray }}>To</th>
                  <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 13, fontWeight: 600, color: ff.gray }}>SOL</th>
                  <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 13, fontWeight: 600, color: ff.gray }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {data.flows.slice(0, 30).map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td className="ff-address" style={{ padding: '8px 0' }}>{(f.from_wallet || f.from_address || '').slice(0, 8)}…</td>
                    <td className="ff-address" style={{ padding: '8px 0' }}>{(f.to_wallet || f.to_address || '').slice(0, 8)}…</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', fontSize: 16, letterSpacing: '-0.48px' }}>{(f.amount_sol ?? f.sol_amount ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '8px 0', fontSize: 13, color: ff.gray }}>{f.entity_type ?? f.flow_type ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cross-chain exits */}
      {data.cross_chain_exits && data.cross_chain_exits.length > 0 && (
        <div className="ff-section">
          <h2 className="ff-label" style={{ marginBottom: 16, textTransform: 'uppercase' }}>Cross-Chain Exits</h2>
          {data.cross_chain_exits.map((e, i) => (
            <div key={i} className="ff-row">
              <span style={{ fontSize: 16, letterSpacing: '-0.48px', color: '#000' }}>{e.bridge_name} → {e.destination_chain}</span>
              <span style={{ fontSize: 16, letterSpacing: '-0.48px', color: ff.gray }}>{e.amount_sol.toFixed(2)} SOL</span>
            </div>
          ))}
        </div>
      )}

      <div className="ff-section">
        <Link to={`/lineage/${mint}`} className="ff-link">
          Back to token analysis <svg className="ff-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </Link>
      </div>
    </div>
  );
}
