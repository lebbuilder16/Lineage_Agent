import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { tokens } from '../../src/theme/tokens';
import { HapticButton } from '../../src/components/ui/HapticButton';

const LAST_UPDATED = 'March 27, 2026';

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <HapticButton variant="ghost" size="sm" onPress={() => router.back()}>
          <ChevronLeft size={22} color={tokens.white80} />
        </HapticButton>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom + 40, 60) }]} showsVerticalScrollIndicator={false}>
        <Text style={s.updated}>Last updated: {LAST_UPDATED}</Text>

        <Text style={s.h2}>1. Information We Collect</Text>
        <Text style={s.body}>
          Lineage Agent collects minimal data to provide its service:{'\n\n'}
          <Text style={s.bold}>Account Information:</Text> Email address (via Privy authentication), username, display name, and profile photo.{'\n\n'}
          <Text style={s.bold}>Wallet Information:</Text> Your Solana wallet address (public key only). Private keys are managed securely by Privy and are never stored on our servers in plaintext.{'\n\n'}
          <Text style={s.bold}>Usage Data:</Text> Token scan history, watchlist, investigation records, and alert preferences. This data is stored to provide personalized analysis.{'\n\n'}
          <Text style={s.bold}>Device Information:</Text> Push notification tokens (FCM/APNs) for delivering alerts. We do not collect device IDs, advertising identifiers, or location data.
        </Text>

        <Text style={s.h2}>2. How We Use Your Information</Text>
        <Text style={s.body}>
          We use your information solely to:{'\n'}
          {'\u2022'} Provide on-chain token risk analysis{'\n'}
          {'\u2022'} Deliver real-time alerts and daily briefings{'\n'}
          {'\u2022'} Maintain your watchlist and investigation history{'\n'}
          {'\u2022'} Authenticate your account securely via Privy{'\n'}
          {'\u2022'} Send push notifications you have opted into
        </Text>

        <Text style={s.h2}>3. Data Storage & Security</Text>
        <Text style={s.body}>
          Sensitive data (API keys, authentication tokens) is stored using encrypted secure storage (Expo SecureStore). Your Solana wallet private keys are managed by Privy, a SOC 2 Type II certified provider, and are never exposed to our application code.{'\n\n'}
          Server-side data is stored on Fly.io infrastructure with encrypted connections (TLS).
        </Text>

        <Text style={s.h2}>4. Third-Party Services</Text>
        <Text style={s.body}>
          We use the following third-party services:{'\n'}
          {'\u2022'} <Text style={s.bold}>Privy</Text> — Authentication and embedded wallet management (SOC 2 Type II){'\n'}
          {'\u2022'} <Text style={s.bold}>Firebase Cloud Messaging</Text> — Push notifications{'\n'}
          {'\u2022'} <Text style={s.bold}>Expo</Text> — App updates and build infrastructure{'\n\n'}
          We do not use any analytics, advertising, or tracking SDKs. We do not share your data with third parties for marketing purposes.
        </Text>

        <Text style={s.h2}>5. Data Retention & Deletion</Text>
        <Text style={s.body}>
          You can delete your account at any time from the Account screen. This permanently removes all your data from our servers, including your profile, watchlist, investigation history, and alert preferences.{'\n\n'}
          Signing out clears all locally cached data from your device.
        </Text>

        <Text style={s.h2}>6. Legal Basis for Processing (GDPR)</Text>
        <Text style={s.body}>
          For users in the European Economic Area (EEA), United Kingdom, and Switzerland, we process your personal data under the following legal bases (Article 6 GDPR):{'\n\n'}
          {'\u2022'} <Text style={s.bold}>Contract (Art. 6(1)(b))</Text> — Processing necessary to provide the service you signed up for (authentication, watchlist, scan history).{'\n'}
          {'\u2022'} <Text style={s.bold}>Legitimate interest (Art. 6(1)(f))</Text> — Security, fraud prevention, and maintaining service integrity.{'\n'}
          {'\u2022'} <Text style={s.bold}>Consent (Art. 6(1)(a))</Text> — Push notifications and optional features, which you can withdraw at any time in your device settings or the Account screen.
        </Text>

        <Text style={s.h2}>7. Your Rights (GDPR / UK GDPR)</Text>
        <Text style={s.body}>
          If you are located in the EEA, UK, or Switzerland, you have the following rights under the GDPR:{'\n\n'}
          {'\u2022'} <Text style={s.bold}>Right of access</Text> — Request a copy of the personal data we hold about you.{'\n'}
          {'\u2022'} <Text style={s.bold}>Right to rectification</Text> — Correct inaccurate or incomplete data.{'\n'}
          {'\u2022'} <Text style={s.bold}>Right to erasure</Text> — Delete your account and all associated data (available in-app on the Account screen, or by email request).{'\n'}
          {'\u2022'} <Text style={s.bold}>Right to data portability</Text> — Receive your data in a structured, machine-readable format.{'\n'}
          {'\u2022'} <Text style={s.bold}>Right to restrict processing</Text> — Limit how we use your data while a dispute is resolved.{'\n'}
          {'\u2022'} <Text style={s.bold}>Right to object</Text> — Object to processing based on legitimate interests.{'\n'}
          {'\u2022'} <Text style={s.bold}>Right to withdraw consent</Text> — Withdraw any consent you previously gave (e.g., push notifications) without affecting the lawfulness of prior processing.{'\n'}
          {'\u2022'} <Text style={s.bold}>Right to lodge a complaint</Text> — File a complaint with your local supervisory authority if you believe our processing violates the GDPR.{'\n\n'}
          To exercise any of these rights, contact us at privacy@lineage-agent.fly.dev. We will respond within 30 days.
        </Text>

        <Text style={s.h2}>8. Data Retention Periods</Text>
        <Text style={s.body}>
          We retain your data only for as long as necessary to provide the service:{'\n\n'}
          {'\u2022'} <Text style={s.bold}>Account data</Text> (email, wallet address, profile): retained while your account is active.{'\n'}
          {'\u2022'} <Text style={s.bold}>Scan history & watchlist</Text>: retained while your account is active.{'\n'}
          {'\u2022'} <Text style={s.bold}>Push notification tokens</Text>: retained while notifications are enabled.{'\n'}
          {'\u2022'} <Text style={s.bold}>Server logs</Text>: retained for up to 30 days for security and abuse monitoring.{'\n\n'}
          When you delete your account, all personal data is erased from our production systems within 7 days. Backups containing residual data are rotated out within 30 days.
        </Text>

        <Text style={s.h2}>9. International Data Transfers</Text>
        <Text style={s.body}>
          Our servers are hosted on Fly.io infrastructure, which may process data in regions outside the EEA (including the United States). Where such transfers occur, we rely on the European Commission's Standard Contractual Clauses (SCCs) and equivalent safeguards to ensure your data receives an adequate level of protection.{'\n\n'}
          Privy (authentication) processes data in accordance with its own SOC 2 Type II controls and privacy policy.
        </Text>

        <Text style={s.h2}>10. Children's Privacy</Text>
        <Text style={s.body}>
          Lineage Agent is not intended for users under 17 years of age. We do not knowingly collect data from minors. If you believe a minor has provided us with personal data, contact us and we will delete it.
        </Text>

        <Text style={s.h2}>11. Changes to This Policy</Text>
        <Text style={s.body}>
          We may update this Privacy Policy from time to time. We will notify you of material changes via the app or email. Continued use of the service after changes take effect constitutes acceptance of the updated policy.
        </Text>

        <Text style={s.h2}>12. Contact</Text>
        <Text style={s.body}>
          <Text style={s.bold}>Data controller:</Text> Lineage Agent{'\n'}
          <Text style={s.bold}>Privacy inquiries:</Text> privacy@lineage-agent.fly.dev{'\n'}
          <Text style={s.bold}>Account & data deletion requests:</Text> privacy@lineage-agent.fly.dev{'\n\n'}
          For users in the EEA, you also have the right to lodge a complaint with your national data protection authority.
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
