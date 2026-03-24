import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { GlassCard } from '../ui/GlassCard';
import { useAuthStore } from '../../store/auth';
import { tokens } from '../../theme/tokens';

const SWEEP_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://lineage-agent.fly.dev').replace(/\/$/, '');

export function SweepAlertsBanner({ mint }: { mint: string }) {
  const apiKey = useAuthStore((s) => s.apiKey);
  const [flags, setFlags] = useState<{ severity: string; title: string; createdAt: number }[]>([]);

  useEffect(() => {
    if (!apiKey || !mint) return;
    fetch(`${SWEEP_BASE}/agent/flags?mint=${mint}&limit=5`, {
      headers: { 'X-API-Key': apiKey },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.flags?.length) setFlags(d.flags); })
      .catch(() => {});
  }, [apiKey, mint]);

  if (flags.length === 0) return null;

  const critCount = flags.filter((f) => f.severity === 'critical').length;
  const ago = (() => {
    const diff = Date.now() - (flags[0]?.createdAt ?? 0) * 1000;
    const hrs = Math.floor(diff / 3600000);
    return hrs < 1 ? 'recently' : `${hrs}h ago`;
  })();
  const bannerColor = critCount > 0 ? tokens.risk.critical : tokens.warning;

  return (
    <GlassCard style={{ borderColor: `${bannerColor}30`, borderWidth: 1, backgroundColor: `${bannerColor}06` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: `${bannerColor}18`, alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={14} color={bannerColor} strokeWidth={2.5} />
        </View>
        <Text style={{ fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: bannerColor, flex: 1 }}>
          Agent detected {flags.length} flag{flags.length > 1 ? 's' : ''} ({ago})
        </Text>
      </View>
      {flags.slice(0, 3).map((f, i) => (
        <Text key={i} style={{ fontFamily: 'Lexend-Regular', fontSize: tokens.font.badge, color: tokens.white60, lineHeight: 18, paddingLeft: 32 }}>
          • {f.title}
        </Text>
      ))}
      {flags.length > 3 && (
        <Text style={{ fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 4, paddingLeft: 32 }}>
          +{flags.length - 3} more
        </Text>
      )}
    </GlassCard>
  );
}
