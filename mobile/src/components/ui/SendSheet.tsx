import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableWithoutFeedback, TextInput, Pressable, Alert, Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ArrowUpRight, Clipboard as ClipIcon, X, ExternalLink } from 'lucide-react-native';
import {
  Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { tokens } from '../../theme/tokens';
import { HapticButton } from './HapticButton';

const RPC_URL = process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

interface Props {
  visible: boolean;
  onClose: () => void;
  walletAddress: string;
  balance: number | null;
  signAndSend: (tx: Transaction) => Promise<string>;
  onSuccess?: () => void;
}

type Step = 'form' | 'confirming' | 'sending' | 'success' | 'error';

export function SendSheet({ visible, onClose, walletAddress, balance, signAndSend, onSuccess }: Props) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [txSig, setTxSig] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => {
    setRecipient('');
    setAmount('');
    setStep('form');
    setTxSig('');
    setErrorMsg('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) setRecipient(text.trim());
  };

  const handleMax = () => {
    if (balance != null && balance > 0.005) {
      setAmount((balance - 0.005).toFixed(6)); // reserve ~0.005 SOL for fees
    }
  };

  const validate = (): string | null => {
    if (!recipient) return 'Enter a recipient address';
    try { new PublicKey(recipient); } catch { return 'Invalid Solana address'; }
    const sol = parseFloat(amount);
    if (!sol || sol <= 0) return 'Enter an amount';
    if (balance != null && sol > balance - 0.001) return 'Insufficient balance';
    return null;
  };

  const handleConfirm = () => {
    const err = validate();
    if (err) { Alert.alert('Error', err); return; }
    setStep('confirming');
  };

  const handleSend = useCallback(async () => {
    setStep('sending');
    try {
      const conn = new Connection(RPC_URL, 'confirmed');
      const fromPubkey = new PublicKey(walletAddress);
      const toPubkey = new PublicKey(recipient);
      const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);

      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey, toPubkey, lamports }),
      );
      tx.feePayer = fromPubkey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

      const sig = await signAndSend(tx);
      setTxSig(sig);
      setStep('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess?.();
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Transaction failed');
      setStep('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [walletAddress, recipient, amount, signAndSend, onSuccess]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>Send SOL</Text>
          <Pressable onPress={handleClose} hitSlop={8}><X size={20} color={tokens.white60} /></Pressable>
        </View>

        {step === 'form' && (
          <>
            <Text style={styles.fieldLabel}>Recipient</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={recipient}
                onChangeText={setRecipient}
                placeholder="Solana address"
                placeholderTextColor={tokens.white20}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={handlePaste} hitSlop={8}>
                <ClipIcon size={16} color={tokens.secondary} />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Amount (SOL)</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={tokens.white20}
                keyboardType="decimal-pad"
              />
              <Pressable onPress={handleMax}>
                <Text style={styles.maxBtn}>MAX</Text>
              </Pressable>
            </View>
            {balance != null && (
              <Text style={styles.balanceHint}>Balance: {balance.toFixed(4)} SOL</Text>
            )}
            <HapticButton variant="primary" size="lg" fullWidth onPress={handleConfirm} style={{ marginTop: 12 }}>
              <ArrowUpRight size={18} color={tokens.white100} />
              <Text style={styles.sendBtnText}>Review Transaction</Text>
            </HapticButton>
          </>
        )}

        {step === 'confirming' && (
          <View style={styles.confirmCard}>
            <View style={styles.txWarning}>
              <Text style={styles.txWarningText}>Crypto transactions are irreversible. Double-check the recipient address.</Text>
            </View>
            <Text style={styles.confirmLabel}>Sending</Text>
            <Text style={styles.confirmAmount}>{parseFloat(amount).toFixed(6)} SOL</Text>
            <Text style={styles.confirmLabel}>To</Text>
            <Text style={styles.confirmAddr} numberOfLines={2}>{recipient}</Text>
            <View style={styles.confirmActions}>
              <HapticButton variant="ghost" size="lg" onPress={() => setStep('form')}>
                <Text style={styles.cancelText}>Back</Text>
              </HapticButton>
              <HapticButton variant="primary" size="lg" onPress={handleSend} style={{ flex: 1 }}>
                <Text style={styles.sendBtnText}>Confirm & Send</Text>
              </HapticButton>
            </View>
          </View>
        )}

        {step === 'sending' && (
          <View style={styles.centerBox}>
            <Text style={styles.statusText}>Sending transaction...</Text>
          </View>
        )}

        {step === 'success' && (
          <View style={styles.centerBox}>
            <Text style={[styles.statusText, { color: tokens.success }]}>Transaction Sent</Text>
            <Pressable
              onPress={() => Linking.openURL(`https://solscan.io/tx/${txSig}`)}
              style={styles.txLink}
            >
              <Text style={styles.txLinkText}>{txSig.slice(0, 20)}...</Text>
              <ExternalLink size={14} color={tokens.secondary} />
            </Pressable>
            <HapticButton variant="ghost" size="lg" fullWidth onPress={handleClose} style={{ marginTop: 12 }}>
              <Text style={styles.cancelText}>Done</Text>
            </HapticButton>
          </View>
        )}

        {step === 'error' && (
          <View style={styles.centerBox}>
            <Text style={[styles.statusText, { color: tokens.error }]}>Transaction Failed</Text>
            <Text style={styles.errorDetail}>{errorMsg}</Text>
            <HapticButton variant="ghost" size="lg" fullWidth onPress={() => setStep('form')} style={{ marginTop: 12 }}>
              <Text style={styles.cancelText}>Try Again</Text>
            </HapticButton>
          </View>
        )}
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
  title: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100 },
  fieldLabel: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.textTertiary, marginBottom: 6, marginTop: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  input: { flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.body, color: tokens.white100, padding: 0 },
  maxBtn: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.small, color: tokens.secondary },
  balanceHint: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.textTertiary, marginTop: 4 },
  sendBtnText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white100 },
  confirmCard: { backgroundColor: tokens.bgGlass8, borderRadius: tokens.radius.md, padding: 16, gap: 6 },
  txWarning: { backgroundColor: `${tokens.warning}10`, borderRadius: tokens.radius.sm, borderWidth: 1, borderColor: `${tokens.warning}20`, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  txWarningText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.tiny, color: tokens.warning, textAlign: 'center', lineHeight: 16 },
  confirmLabel: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary },
  confirmAmount: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.heading, color: tokens.white100 },
  confirmAddr: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white60 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white60 },
  centerBox: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  statusText: { fontFamily: 'Lexend-Bold', fontSize: tokens.font.sectionHeader, color: tokens.white100 },
  txLink: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txLinkText: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.secondary },
  errorDetail: { fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.textTertiary, textAlign: 'center' },
});
