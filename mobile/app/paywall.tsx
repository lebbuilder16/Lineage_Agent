import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { X, Check, Lock } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GlassCard } from '../src/components/ui/GlassCard';
import { HapticButton } from '../src/components/ui/HapticButton';
import { useToast } from '../src/components/ui/Toast';
import { tokens } from '../src/theme/tokens';
import { useSubscriptionStore } from '../src/store/subscription';
import { useAuthStore } from '../src/store/auth';
import { useUsdcBalance } from '../src/hooks/useUsdcBalance';
import { verifyUsdcSubscription } from '../src/lib/api';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isReady as isRCReady,
} from '../src/lib/revenuecat';
import { useEmbeddedSolanaWallet } from '@privy-io/expo';
import {
  Connection, PublicKey, Transaction, TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import type { PurchasesPackage } from 'react-native-purchases';

const isAndroid = Platform.OS === 'android';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;
const TREASURY_WALLET = new PublicKey(
  process.env.EXPO_PUBLIC_USDC_TREASURY ?? 'JBj3qU8sVzoVNaU6v4LBXKRaD226AMb4buszJuEFrbm',
);
const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

// ── Plan definitions ────────────────────────────────────────────────────────

interface PlanDef {
  key: string;
  name: string;
  color: string;
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyUsdc: number;
  yearlyUsdc: number;
  popular?: boolean;
  features: { label: string; included: boolean }[];
}

const PLANS: PlanDef[] = [
  {
    key: 'pro',
    name: 'Pro',
    color: '#CFE6E4',
    monthlyPrice: 9.99,
    yearlyPrice: 89.99,
    monthlyUsdc: 9.99,
    yearlyUsdc: 89.99,
    features: [
      { label: '50 scans/day', included: true },
      { label: 'AI Verdict (Haiku)', included: true },
      { label: 'AI Chat (30/day)', included: true },
      { label: '25 Watchlist', included: true },
      { label: 'Daily Briefing', included: true },
      { label: 'All Forensic Modules', included: true },
      { label: 'Compare + Export', included: true },
      { label: 'Telegram Alerts', included: true },
      { label: 'Agent Investigation', included: false },
      { label: 'Batch Scan', included: false },
      { label: 'API Access', included: false },
    ],
  },
  {
    key: 'elite',
    name: 'Elite',
    color: '#FFD666',
    monthlyPrice: 34.99,
    yearlyPrice: 279.99,
    monthlyUsdc: 34.99,
    yearlyUsdc: 279.99,
    popular: true,
    features: [
      { label: '100 scans/day', included: true },
      { label: 'AI Verdict (Haiku)', included: true },
      { label: 'AI Chat (60/day)', included: true },
      { label: '100 Watchlist', included: true },
      { label: '3 Briefings/day', included: true },
      { label: 'All Forensic Modules', included: true },
      { label: 'Compare + Export', included: true },
      { label: 'Telegram + Discord Alerts', included: true },
      { label: 'Agent Investigation (12/day)', included: true },
      { label: 'Batch Scan (25)', included: true },
      { label: 'API Access', included: true },
    ],
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const [yearly, setYearly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rcPackages, setRcPackages] = useState<PurchasesPackage[]>([]);
  const { showToast, toast } = useToast();
  const setPlan = useSubscriptionStore((s) => s.setPlan);
  const apiKey = useAuthStore((s) => s.apiKey);
  const user = useAuthStore((s) => s.user);
  const walletAddress = user?.wallet_address;
  const { balance: usdcBalance } = useUsdcBalance(walletAddress);
  const embeddedWallet = useEmbeddedSolanaWallet();

  // Fetch RevenueCat offerings on mount
  useEffect(() => {
    if (!isRCReady()) return;
    getOfferings().then((offerings) => {
      const current = offerings?.current;
      if (current?.availablePackages) {
        setRcPackages(current.availablePackages);
      }
    }).catch(() => {});
  }, []);

  const handleUsdcPurchase = async (planKey: string) => {
    const plan = PLANS.find((p) => p.key === planKey);
    if (!plan || !apiKey || !walletAddress) return;

    const amount = yearly ? plan.yearlyUsdc : plan.monthlyUsdc;
    if (usdcBalance == null || usdcBalance < amount) {
      showToast(`Insufficient USDC — need $${amount.toFixed(2)}, have $${(usdcBalance ?? 0).toFixed(2)}`);
      return;
    }

    const provider = embeddedWallet?.getProvider?.();
    if (!provider) {
      showToast('Wallet not ready — try again');
      return;
    }

    Alert.alert(
      `Subscribe to ${plan.name}`,
      `Pay ${amount.toFixed(2)} USDC from your wallet?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay',
          onPress: async () => {
            setLoading(true);
            try {
              const conn = new Connection(RPC_URL, 'confirmed');
              const payer = new PublicKey(walletAddress);
              const payerAta = await getAssociatedTokenAddress(USDC_MINT, payer);
              const treasuryAta = await getAssociatedTokenAddress(USDC_MINT, TREASURY_WALLET);

              const ixs: TransactionInstruction[] = [];
              // Create treasury ATA if it doesn't exist
              const treasuryAccount = await conn.getAccountInfo(treasuryAta);
              if (!treasuryAccount) {
                ixs.push(
                  createAssociatedTokenAccountInstruction(payer, treasuryAta, TREASURY_WALLET, USDC_MINT),
                );
              }
              // Transfer USDC
              const lamportAmount = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
              ixs.push(
                createTransferCheckedInstruction(payerAta, USDC_MINT, treasuryAta, payer, lamportAmount, USDC_DECIMALS),
              );

              const tx = new Transaction().add(...ixs);
              tx.feePayer = payer;
              tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

              const { signature } = await provider.request({
                method: 'signAndSendTransaction',
                params: { transaction: tx },
              });

              showToast('Verifying payment...');
              // Wait for confirmation
              await conn.confirmTransaction(signature, 'confirmed');

              // Verify on backend
              const result = await verifyUsdcSubscription(apiKey, planKey, signature);
              if (result.upgraded) {
                setPlan(result.plan as any);
                showToast(`Welcome to ${result.plan.charAt(0).toUpperCase() + result.plan.slice(1)}!`);
                router.back();
              }
            } catch (err: any) {
              const msg = err?.message ?? 'Payment failed';
              if (!msg.includes('User rejected')) {
                showToast(msg);
              }
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handlePurchase = async (planKey: string) => {
    // Try to find matching RC package
    const pkg = rcPackages.find((p) =>
      p.identifier.toLowerCase().includes(planKey) &&
      p.identifier.toLowerCase().includes(yearly ? 'year' : 'month')
    );

    if (!pkg) {
      showToast('Purchase not available yet — configure RevenueCat products');
      return;
    }

    setLoading(true);
    const result = await purchasePackage(pkg);
    setLoading(false);

    if (result.success) {
      setPlan(result.plan as any);
      showToast(`Welcome to ${result.plan.charAt(0).toUpperCase() + result.plan.slice(1)}!`);
      router.back();
    } else if (!result.cancelled) {
      showToast(result.error ?? 'Purchase failed');
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    const result = await restorePurchases();
    setLoading(false);

    if (result.success) {
      setPlan(result.plan as any);
      if (result.plan === 'free') {
        showToast('No active subscription found');
      } else {
        showToast(`Restored ${result.plan.charAt(0).toUpperCase() + result.plan.slice(1)} plan`);
        router.back();
      }
    } else {
      showToast(result.error ?? 'Restore failed');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={24} color={tokens.white100} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Billing Toggle ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInDown.duration(300).springify()} style={styles.toggleRow}>
          <View style={styles.togglePill}>
            <TouchableOpacity
              onPress={() => setYearly(false)}
              style={[styles.toggleSegment, !yearly && styles.toggleActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, !yearly && styles.toggleTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setYearly(true)}
              style={[styles.toggleSegment, yearly && styles.toggleActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.toggleText, yearly && styles.toggleTextActive]}>Yearly</Text>
              <View style={styles.saveBadge}>
                <Text style={styles.saveBadgeText}>Save 25%+</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Plan Cards ───────────────────────────────────────────────── */}
        {PLANS.map((plan, idx) => (
          <Animated.View
            key={plan.key}
            entering={FadeInDown.duration(350).delay(idx * 80).springify()}
          >
            <GlassCard style={[styles.planCard, { borderColor: plan.color, borderWidth: 1.5 }]}>
              {/* Popular badge */}
              {plan.popular && (
                <View style={[styles.popularBadge, { backgroundColor: plan.color }]}>
                  <Text style={styles.popularBadgeText}>Most Popular</Text>
                </View>
              )}

              {/* Plan name + price */}
              <Text style={[styles.planName, { color: plan.color }]}>{plan.name}</Text>
              <Text style={styles.planPrice}>
                ${yearly
                  ? plan.yearlyPrice.toFixed(2)
                  : plan.monthlyPrice.toFixed(2)}
                <Text style={styles.planPeriod}>
                  {yearly ? '/yr' : '/mo'}
                </Text>
              </Text>
              {yearly && (
                <Text style={styles.planMonthly}>
                  ${(plan.yearlyPrice / 12).toFixed(2)}/mo billed yearly
                </Text>
              )}

              {/* Feature checklist */}
              <View style={styles.featureList}>
                {plan.features.map((feat) => (
                  <View key={feat.label} style={styles.featureRow}>
                    {feat.included ? (
                      <Check size={14} color={tokens.success} />
                    ) : (
                      <Lock size={14} color={tokens.textTertiary} />
                    )}
                    <Text
                      style={[
                        styles.featureText,
                        !feat.included && styles.featureTextLocked,
                      ]}
                    >
                      {feat.label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* CTA: Subscribe */}
              <HapticButton variant="primary" fullWidth onPress={() => handlePurchase(plan.key)} disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color={tokens.white100} />
                ) : (
                  <Text style={styles.ctaText}>Subscribe</Text>
                )}
              </HapticButton>

              {/* CTA: Pay with USDC */}
              <View style={styles.usdcRow}>
                <HapticButton
                  variant="ghost"
                  fullWidth
                  onPress={() => handleUsdcPurchase(plan.key)}
                  disabled={loading}
                >
                  <Text style={styles.usdcBtnText}>Pay with USDC</Text>
                  <Text style={styles.usdcPrice}>
                    ${yearly
                      ? plan.yearlyUsdc.toFixed(2)
                      : plan.monthlyUsdc.toFixed(2)}
                    {yearly ? '/yr' : '/mo'}
                  </Text>
                  {usdcBalance != null && usdcBalance > 0 && (
                    <Text style={styles.usdcBalanceHint}>
                      Balance: ${usdcBalance.toFixed(2)}
                    </Text>
                  )}
                </HapticButton>
              </View>
            </GlassCard>
          </Animated.View>
        ))}

        {/* ── Scan Credit Packs ─────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(350).delay(200).springify()}
        >
          <GlassCard style={styles.creditCard}>
            <Text style={styles.creditTitle}>Pay Per Scan</Text>
            <Text style={styles.creditSubtitle}>
              Out of free scans? Buy credits with LINEAGE token.
            </Text>
            <View style={styles.creditPacks}>
              {[
                { label: '1 Scan', price: '$0.30', key: 'single' },
                { label: '5 Scans', price: '$1.29', sub: '$0.26/scan', key: 'five_pack' },
                { label: '15 Scans', price: '$3.49', sub: '$0.23/scan', key: 'fifteen_pack' },
              ].map((pack) => (
                <TouchableOpacity
                  key={pack.key}
                  style={styles.creditPack}
                  onPress={() => showToast('LINEAGE token payments coming soon')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.creditPackLabel}>{pack.label}</Text>
                  <Text style={styles.creditPackPrice}>{pack.price}</Text>
                  {pack.sub && (
                    <Text style={styles.creditPackSub}>{pack.sub}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </Animated.View>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <Animated.View
          entering={FadeInDown.duration(350).delay(280).springify()}
          style={styles.footer}
        >
          <TouchableOpacity onPress={handleRestore} disabled={loading}>
            <Text style={styles.footerLink}>Restore Purchases</Text>
          </TouchableOpacity>
          <View style={styles.footerLegal}>
            <TouchableOpacity onPress={() => router.push('/legal/terms' as any)}>
              <Text style={styles.footerLegalText}>Terms of Service</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}>{'\u00B7'}</Text>
            <TouchableOpacity onPress={() => router.push('/legal/privacy' as any)}>
              <Text style={styles.footerLegalText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      {toast}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.bgMain,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.sectionHeader,
    color: tokens.white100,
  },

  scrollContent: {
    paddingHorizontal: tokens.spacing.screenPadding,
    gap: 14,
  },

  // Billing toggle
  toggleRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  togglePill: {
    flexDirection: 'row',
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 3,
  },
  toggleSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: tokens.radius.pill,
    gap: 6,
  },
  toggleActive: {
    backgroundColor: tokens.bgGlass12,
  },
  toggleText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
  },
  toggleTextActive: {
    color: tokens.white100,
  },
  saveBadge: {
    backgroundColor: tokens.success,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  saveBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.bgMain,
  },

  // Plan card
  planCard: {
    gap: 12,
  },
  popularBadge: {
    alignSelf: 'flex-start',
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 2,
  },
  popularBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 10,
    color: tokens.white100,
  },
  planName: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
  },
  planPrice: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.hero,
    color: tokens.white100,
  },
  planPeriod: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white60,
  },
  planMonthly: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    marginTop: -6,
  },

  // Feature list
  featureList: {
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white80,
  },
  featureTextLocked: {
    color: tokens.textTertiary,
  },

  // CTA
  ctaText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },

  // USDC
  usdcRow: {
    marginTop: -4,
  },
  usdcBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.small,
    color: tokens.white80,
  },
  usdcPrice: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  usdcBalanceHint: {
    fontFamily: 'Lexend-Regular',
    fontSize: 10,
    color: tokens.success,
  },
  discountBadge: {
    backgroundColor: tokens.success,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  discountBadgeText: {
    fontFamily: 'Lexend-Bold',
    fontSize: 9,
    color: tokens.bgMain,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  footerLink: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.secondary,
  },
  footerLegal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLegalText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
  footerDot: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },

  // Credit packs
  creditCard: {
    gap: 12,
    borderColor: tokens.borderSubtle,
    borderWidth: 1,
  },
  creditTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
    color: tokens.white100,
  },
  creditSubtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.textTertiary,
    marginTop: -4,
  },
  creditPacks: {
    flexDirection: 'row',
    gap: 8,
  },
  creditPack: {
    flex: 1,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  creditPackLabel: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  creditPackPrice: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.body,
    color: tokens.success,
  },
  creditPackSub: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.textTertiary,
  },
});
