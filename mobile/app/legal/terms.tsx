import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { tokens } from '../../src/theme/tokens';
import { HapticButton } from '../../src/components/ui/HapticButton';

const LAST_UPDATED = 'March 27, 2026';

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <HapticButton variant="ghost" size="sm" onPress={() => router.back()}>
          <ChevronLeft size={22} color={tokens.white80} />
        </HapticButton>
        <Text style={s.headerTitle}>Terms of Service</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 40, 60) }]} showsVerticalScrollIndicator={false}>
        <Text style={s.updated}>Last updated: {LAST_UPDATED}</Text>

        <Text style={s.h2}>1. Acceptance of Terms</Text>
        <Text style={s.body}>
          By using Lineage Agent, you agree to these Terms of Service. If you do not agree, please do not use the application.
        </Text>

        <Text style={s.h2}>2. Not Financial Advice</Text>
        <Text style={s.body}>
          <Text style={s.bold}>Lineage Agent provides on-chain intelligence for informational purposes only.</Text> Token risk scores, rug pull analysis, deployer forensics, and all other data presented in this application do not constitute financial advice, investment recommendations, or trading signals.{'\n\n'}
          You are solely responsible for your own investment decisions. We make no guarantees about the accuracy, completeness, or reliability of any analysis. Past performance of risk detection does not guarantee future results.{'\n\n'}
          Always do your own research (DYOR) before making any financial decisions.
        </Text>

        <Text style={s.h2}>3. Wallet & Transaction Risks</Text>
        <Text style={s.body}>
          <Text style={s.bold}>Cryptocurrency transactions are irreversible.</Text> When using the Send feature, you are solely responsible for verifying recipient addresses. We cannot recover funds sent to incorrect addresses.{'\n\n'}
          Your wallet private keys are managed by Privy's secure infrastructure. We do not have access to your private keys and cannot execute transactions on your behalf without your explicit authorization.
        </Text>

        <Text style={s.h2}>4. Service Limitations</Text>
        <Text style={s.body}>
          {'\u2022'} Risk analysis is based on on-chain data and heuristics, not guaranteed detection{'\n'}
          {'\u2022'} The service may experience downtime for maintenance{'\n'}
          {'\u2022'} Alert delivery depends on network connectivity and device settings{'\n'}
          {'\u2022'} Analysis results may be delayed during periods of high blockchain activity
        </Text>

        <Text style={s.h2}>5. Limitation of Liability</Text>
        <Text style={s.body}>
          To the maximum extent permitted by law, Lineage Agent and its creators shall not be liable for any losses, damages, or claims arising from:{'\n'}
          {'\u2022'} Reliance on risk analysis results{'\n'}
          {'\u2022'} Failed or incorrect token analysis{'\n'}
          {'\u2022'} Missed alerts or delayed notifications{'\n'}
          {'\u2022'} Unauthorized access to your account{'\n'}
          {'\u2022'} Cryptocurrency transaction errors
        </Text>

        <Text style={s.h2}>6. Account Termination</Text>
        <Text style={s.body}>
          You may delete your account at any time from the Account screen. We reserve the right to suspend or terminate accounts that violate these terms or engage in abusive behavior.
        </Text>

        <Text style={s.h2}>7. Changes to Terms</Text>
        <Text style={s.body}>
          We may update these terms from time to time. Continued use of the application after changes constitutes acceptance of the updated terms.
        </Text>

        <Text style={s.h2}>8. Contact</Text>
        <Text style={s.body}>
          For questions about these terms, contact us at legal@lineage-agent.fly.dev
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing.screenPadding, paddingBottom: 12 },
  headerTitle: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100 },
  content: { paddingHorizontal: tokens.spacing.screenPadding, gap: 12 },
  updated: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginBottom: 8 },
  h2: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.subheading, color: tokens.white100, marginTop: 8 },
  body: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white60, lineHeight: 22 },
  bold: { fontFamily: 'Lexend-SemiBold', color: tokens.white80 },
});
