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

        <Text style={s.h2}>6. Your Rights</Text>
        <Text style={s.body}>
          You have the right to:{'\n'}
          {'\u2022'} Access your personal data{'\n'}
          {'\u2022'} Request deletion of your account and data{'\n'}
          {'\u2022'} Opt out of push notifications at any time{'\n'}
          {'\u2022'} Export your data upon request
        </Text>

        <Text style={s.h2}>7. Children's Privacy</Text>
        <Text style={s.body}>
          Lineage Agent is not intended for users under 17 years of age. We do not knowingly collect data from minors.
        </Text>

        <Text style={s.h2}>8. Contact</Text>
        <Text style={s.body}>
          For privacy questions or data requests, contact us at privacy@lineage-agent.fly.dev
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
