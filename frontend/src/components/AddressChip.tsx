import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface AddressChipProps {
  address: string;
  chars?: number;
}

export function AddressChip({ address, chars = 4 }: AddressChipProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      title={address}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 'var(--text-small)',
        fontFamily: 'monospace',
        cursor: 'pointer',
      }}
    >
      {address.slice(0, chars)}...{address.slice(-chars)}
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
