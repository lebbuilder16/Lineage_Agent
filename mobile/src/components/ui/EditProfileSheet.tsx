import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableWithoutFeedback, TextInput, Pressable, Alert,
} from 'react-native';
import { X } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { HapticButton } from './HapticButton';
import { useAuthStore } from '../../store/auth';
import { updateProfile } from '../../lib/api';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export function EditProfileSheet({ visible, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const apiKey = useAuthStore((s) => s.apiKey);
  const setUser = useAuthStore((s) => s.setUser);

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setDisplayName(user?.display_name ?? '');
      setUsername(user?.username ?? '');
    }
  }, [visible, user]);

  const usernameValid = username.length === 0 || USERNAME_RE.test(username);

  const handleSave = async () => {
    if (!apiKey) return;
    if (username && !USERNAME_RE.test(username)) {
      Alert.alert('Invalid username', '3-20 characters, letters/numbers/underscore only.');
      return;
    }
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (displayName.trim()) updates.display_name = displayName.trim();
      if (username.trim()) updates.username = username.trim();
      if (Object.keys(updates).length === 0) { onClose(); return; }

      const updated = await updateProfile(apiKey, updates);
      setUser(updated);
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>Edit Profile</Text>
          <Pressable onPress={onClose} hitSlop={8}><X size={20} color={tokens.white60} /></Pressable>
        </View>

        <Text style={styles.fieldLabel}>Display Name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={tokens.white20}
          maxLength={50}
        />

        <Text style={styles.fieldLabel}>Username</Text>
        <TextInput
          style={[styles.input, !usernameValid && styles.inputError]}
          value={username}
          onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          placeholder="agent_smith"
          placeholderTextColor={tokens.white20}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        {!usernameValid && (
          <Text style={styles.errorHint}>3-20 chars, letters/numbers/underscore</Text>
        )}

        <HapticButton
          variant="primary"
          size="lg"
          fullWidth
          loading={saving}
          onPress={handleSave}
          style={{ marginTop: 16 }}
        >
          <Text style={styles.saveBtnText}>Save Changes</Text>
        </HapticButton>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: tokens.bgOverlay },
  sheet: {
    backgroundColor: tokens.bgApp,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    paddingHorizontal: 20, paddingBottom: 40,
    borderWidth: 1, borderColor: tokens.borderSubtle, borderBottomWidth: 0,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.white20, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: tokens.font.sectionHeader, letterSpacing: -0.5, color: tokens.white100 },
  fieldLabel: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.textTertiary, marginBottom: 6, marginTop: 14 },
  input: {
    fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white100,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inputError: { borderColor: tokens.error },
  errorHint: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.error, marginTop: 4 },
  saveBtnText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
});
