import { useNavigate } from 'react-router-dom';
import { RiskBadge } from './RiskBadge';
import type { TokenSearchResult } from '../types/api';

interface TokenCardProps {
  token: TokenSearchResult;
  rank?: number;
}

export function TokenCard({ token, rank }: TokenCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/token/${token.mint}`)}
      className="bg-card-glass animate-touch"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 'var(--radius-small)',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        background: 'var(--bg-card)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {rank != null && (
        <span style={{ fontSize: 'var(--text-section-header)', fontWeight: 700, color: 'var(--color-secondary)', minWidth: 28, textAlign: 'center' }}>
          {rank}
        </span>
      )}
      {token.image_uri && (
        <img
          src={token.image_uri}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, color: '#fff', fontSize: 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {token.name || token.mint.slice(0, 8)}
          </span>
          {token.symbol && (
            <span style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.4)' }}>{token.symbol}</span>
          )}
        </div>
        {token.market_cap_usd != null && (
          <span style={{ fontSize: 'var(--text-small)', color: 'rgba(255,255,255,0.4)' }}>
            MC ${token.market_cap_usd >= 1e6 ? `${(token.market_cap_usd / 1e6).toFixed(1)}M` : `${(token.market_cap_usd / 1e3).toFixed(0)}K`}
          </span>
        )}
      </div>
      <RiskBadge level={token.risk_level} />
    </button>
  );
}
