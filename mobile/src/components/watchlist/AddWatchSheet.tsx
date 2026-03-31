import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { HapticButton } from '../ui/HapticButton';
import { tokens } from '../../theme/tokens';
import { isValidSolanaAddress } from '../../lib/risk';

export interface AddWatchSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (type: 'mint' | 'deployer', value: string) => void | Promise<void>;
  loading?: boolean;
}

export function AddWatchSheet({ visible, onClose, onSubmit, loading = false }: AddWatchSheetProps) {
  const [addType, setAddType] = useState<'mint' | 'deployer'>('mint');
  const [addValue, setAddValue] = useState('');
  const [addError, setAddError] = useState('');

  const handleSubmit = () => {
    const v = addValue.trim();
    if (!v) return;
    if (!isValidSolanaAddress(v)) {
      setAddError('Invalid Solana address (32-44 base58 characters)');
      return;
    }
    setAddError('');
    onSubmit(addType, v);
  };

  const handleClose = () => {
    onClose();
    // Reset state after closing
    setAddValue('');
    setAddError('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.modalBackdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.addSheet}>
        <View style={styles.handle} />
        <Text style={styles.addTitle}>Add to Watchlist</Text>

        {/* Type selector */}
        <View style={styles.typeRow}>
          {(['mint', 'deployer'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setAddType(t)}
              style={[styles.typeBtn, addType === t && styles.typeBtnActive]}
            >
              <Text style={[styles.typeBtnText, addType === t && styles.typeBtnTextActive]}>
                {t === 'mint' ? 'Token Mint' : 'Deployer'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          style={styles.addInput}
          value={addValue}
          onChangeText={(t) => { setAddValue(t); setAddError(''); }}
          placeholder={addType === 'mint' ? 'Token mint address…' : 'Deployer address…'}
          placeholderTextColor={tokens.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          autoFocus
        />
        {addError !== '' && (
          <Text style={styles.addErrorText}>{addError}</Text>
        )}
        <HapticButton
          variant="primary"
          size="md"
          fullWidth
          loading={loading}
          onPress={handleSubmit}
          accessibilityRole="button"
          accessibilityLabel="Confirm add to watchlist"
        >
          Add
        </HapticButton>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgOverlay,
  },
  addSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A1014',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: tokens.spacing.screenPadding,
    paddingBottom: 80,
    gap: 12,
    borderTopWidth: 1,
    borderColor: tokens.borderSubtle,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.white20,
    alignSelf: 'center',
    marginBottom: 8,
  },
  addTitle: {
    fontFamily: 'Lexend-SemiBold',
    fontSize: tokens.font.subheading,
    color: tokens.white100,
    marginBottom: 4,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.bgGlass8,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: `${tokens.secondary}20`,
    borderColor: tokens.secondary,
  },
  typeBtnText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.small,
    color: tokens.white60,
  },
  typeBtnTextActive: {
    color: tokens.secondary,
    fontFamily: 'Lexend-SemiBold',
  },
  addInput: {
    backgroundColor: tokens.bgGlass8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.body,
    color: tokens.white100,
  },
  addErrorText: {
    fontFamily: 'Lexend-Regular',
    fontSize: tokens.font.tiny,
    color: tokens.accent,
    marginTop: -4,
    paddingHorizontal: 16,
  },
});
