import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ShieldCheck, Mail, Lock, Wallet } from 'lucide-react-native';
import { AuroraBackground } from '../../src/components/ui/AuroraBackground';
import { HapticButton } from '../../src/components/ui/HapticButton';
import { tokens } from '../../src/theme/tokens';
import { useAuthStore } from '../../src/store/auth';
import { authLogin, getMe } from '../../src/lib/api';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const setApiKey = useAuthStore((s) => s.setApiKey);
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  // ── Phantom wallet connect ────────────────────────────────────────────────
  const handlePhantomConnect = async () => {
    setWalletLoading(true);
    try {
      // Try to open Phantom deeplink for connect
      const phantomUrl = 'https://phantom.app/ul/browse/https://lineage-agent.fly.dev/auth/phantom';
      const canOpen = await Linking.canOpenURL(phantomUrl);
      if (canOpen) {
        await Linking.openURL(phantomUrl);
      } else {
        // Phantom not installed — redirect to install page
        Alert.alert(
          'Phantom Wallet',
          'Phantom wallet is not installed. Install it from the app store to connect.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Install', onPress: () => Linking.openURL('https://phantom.app/download') },
          ],
        );
      }
    } catch {
      Alert.alert('Error', 'Could not connect to Phantom wallet.');
    } finally {
      setWalletLoading(false);
    }
  };

  // ── Email/password login (uses API key as proxy) ──────────────────────────
  const handleEmailLogin = async () => {
    const trimmedEmail = email.trim();
    const trimmedPw = password.trim();

    if (!trimmedEmail || !trimmedPw) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      // Use the email as privy_id for the backend auth endpoint
      const result = await authLogin(trimmedEmail);
      if (result.api_key) {
        setApiKey(result.api_key);
        // Fetch user profile
        try {
          const me = await getMe(result.api_key);
          setUser(me);
        } catch { /* user profile fetch is optional */ }
        router.replace('/(tabs)/radar');
      } else {
        Alert.alert('Login failed', 'Invalid credentials. Please try again.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Skip (use without account) ────────────────────────────────────────────
  const handleSkip = () => {
    router.replace('/(tabs)/radar');
  };

  return (
    <View style={styles.container}>
      <AuroraBackground />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(insets.top + 16, 40), paddingBottom: Math.max(insets.bottom + 24, 40) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.header}>
            <View style={styles.headerIcon}>
              <ShieldCheck size={22} color={tokens.secondary} strokeWidth={2} />
            </View>
            <Text style={styles.headerTitle}>Secure Access</Text>
            <Text style={styles.headerSubtitle}>
              Connect your wallet or login to synchronize your intel node.
            </Text>
          </Animated.View>

          {/* Phantom wallet button */}
          <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.walletSection}>
            <HapticButton
              variant="primary"
              size="lg"
              fullWidth
              loading={walletLoading}
              onPress={handlePhantomConnect}
            >
              <Wallet size={18} color={tokens.white100} strokeWidth={2} />
              <Text style={styles.walletBtnText}>Connect Phantom Wallet</Text>
            </HapticButton>
          </Animated.View>

          {/* Divider */}
          <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR STANDARD LOGIN</Text>
            <View style={styles.dividerLine} />
          </Animated.View>

          {/* Email field */}
          <Animated.View entering={FadeInDown.delay(450).duration(500)}>
            <Text style={styles.fieldLabel}>Email Address</Text>
            <View style={styles.inputRow}>
              <Mail size={16} color={tokens.white35} strokeWidth={1.5} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="agent@solana.com"
                placeholderTextColor={tokens.white35}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />
            </View>
          </Animated.View>

          {/* Password field */}
          <Animated.View entering={FadeInDown.delay(550).duration(500)}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.inputRow}>
              <Lock size={16} color={tokens.white35} strokeWidth={1.5} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={tokens.white35}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleEmailLogin}
              />
            </View>
          </Animated.View>

          {/* Sign In button */}
          <Animated.View entering={FadeInDown.delay(650).duration(500)} style={styles.signInSection}>
            <HapticButton
              variant="ghost"
              size="lg"
              fullWidth
              loading={loading}
              onPress={handleEmailLogin}
            >
              <Text style={styles.signInText}>Sign In</Text>
              <Text style={styles.signInArrow}>  →</Text>
            </HapticButton>
          </Animated.View>

          {/* Skip link */}
          <Animated.View entering={FadeInDown.delay(750).duration(500)} style={styles.skipSection}>
            <HapticButton variant="ghost" size="sm" onPress={handleSkip}>
              <Text style={styles.skipText}>Continue without account</Text>
            </HapticButton>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.bgMain },
  kav: { flex: 1 },
  content: {
    paddingHorizontal: tokens.spacing.screenPadding + 8,
    gap: 16,
  },

  // Header
  header: { marginBottom: 8 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: `${tokens.secondary}15`,
    borderWidth: 1,
    borderColor: `${tokens.secondary}30`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.heading,
    color: tokens.white100,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white60,
    lineHeight: 22,
  },

  // Wallet
  walletSection: { marginTop: 8 },
  walletBtnText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: tokens.borderSubtle,
  },
  dividerText: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.tiny,
    color: tokens.white35,
    letterSpacing: 1,
  },

  // Fields
  fieldLabel: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
    padding: 0,
  },

  // Sign In
  signInSection: { marginTop: 8 },
  signInText: {
    fontFamily: 'Lexend-Bold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
  },
  signInArrow: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.subheading,
    color: tokens.white60,
  },

  // Skip
  skipSection: { alignItems: 'center', marginTop: 4 },
  skipText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white35,
  },
});
