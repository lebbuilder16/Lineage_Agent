const COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  critical: { bg: 'rgba(255, 0, 51, 0.15)', text: '#FF0033', icon: '⬤' },
  high: { bg: 'rgba(255, 51, 102, 0.15)', text: '#FF3366', icon: '▲' },
  medium: { bg: 'rgba(255, 153, 51, 0.15)', text: '#FF9933', icon: '◆' },
  low: { bg: 'rgba(0, 255, 136, 0.15)', text: '#00FF88', icon: '●' },
};

interface RiskBadgeProps {
  level?: string | null;
  className?: string;
}

export function RiskBadge({ level, className = '' }: RiskBadgeProps) {
  const key = (level ?? 'low').toLowerCase();
  const c = COLORS[key] ?? COLORS.low;

  return (
    <span
      className={className}
      role="status"
      aria-label={`Risk level: ${key}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-tiny)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: c.bg,
        color: c.text,
      }}
    >
      <span aria-hidden="true">{c.icon}</span>
      {key}
    </span>
  );
}
