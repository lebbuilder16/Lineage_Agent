import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { GlassCard } from './GlassCard';
import { RiskBadge } from './RiskBadge';
import { tokens } from '../../theme/tokens';
import type { TokenSearchResult } from '../../types/api';

interface TokenRowProps {
  token: TokenSearchResult;
  onPress?: () => void;
  showMcap?: boolean;
  showPrice?: boolean;
  style?: ViewStyle;
  rightElement?: React.ReactNode;
}

export function TokenRow({
  token,
  onPress,
  showMcap = true,
  showPrice = false,
  style,
  rightElement,
}: TokenRowProps) {
  const inner = (
    <GlassCard style={[styles.card, style]} noPadding>
      <View style={styles.inner}>
        {token.image_uri ? (
          <Image source={{ uri: token.image_uri }} style={styles.img} />
        ) : (
          <View style={[styles.img, styles.imgFallback]}>
            <Text style={styles.imgFallbackText}>{token.symbol?.[0] ?? '?'}</Text>
          </View>
        )}

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{token.name}</Text>
          <Text style={styles.symbol}>{token.symbol}</Text>
        </View>

        <View style={styles.right}>
          {rightElement ?? (
            <>
              {token.risk_level && <RiskBadge level={token.risk_level} size="sm" />}
              {showMcap && token.market_cap_usd != null && (
                <Text style={styles.mcap}>
                  ${(token.market_cap_usd / 1_000).toFixed(0)}K
                </Text>
              )}
              {showPrice && token.price_usd != null && (
                <Text style={styles.price}>${token.price_usd.toFixed(6)}</Text>
              )}
              {onPress && <ChevronRight size={14} color={tokens.white35} />}
            </>
          )}
        </View>
      </View>
    </GlassCard>
  );

  if (!onPress) return inner;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      {inner}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {},
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.cardPadding,
    gap: 12,
  },
  img: { width: 40, height: 40, borderRadius: tokens.radius.sm },
  imgFallback: {
    backgroundColor: tokens.bgGlass12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgFallbackText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  info: { flex: 1 },
  name: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  symbol: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  mcap: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
  price: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.white60,
  },
});
