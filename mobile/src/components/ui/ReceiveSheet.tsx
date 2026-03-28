import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableWithoutFeedback, Share, Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Share2, X } from 'lucide-react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import { tokens } from '../../theme/tokens';
import { HapticButton } from './HapticButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  address: string;
}

export function ReceiveSheet({ visible, onClose, address }: Props) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleShare = () => {
    Share.share({ message: address });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.handle} />

        <View style={styles.titleRow}>
          <Text style={styles.title}>Receive SOL</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={20} color={tokens.white60} />
          </Pressable>
        </View>

        <View style={styles.qrWrap}>
          <View style={styles.qrBg}>
            <QRCodeStyled
              data={address}
              size={200}
              padding={16}
              color="#000"
            />
          </View>
        </View>

        <Text style={styles.addrLabel}>Your Solana Address</Text>
        <Pressable style={styles.addrRow} onPress={handleCopy}>
          <Text style={styles.addr} numberOfLines={2}>{address}</Text>
          <Copy size={16} color={tokens.secondary} />
        </Pressable>

        <View style={styles.actions}>
          <HapticButton variant="ghost" size="lg" fullWidth onPress={handleCopy}>
            <Copy size={16} color={tokens.white80} />
            <Text style={styles.btnText}>Copy Address</Text>
          </HapticButton>
          <HapticButton variant="ghost" size="lg" fullWidth onPress={handleShare}>
            <Share2 size={16} color={tokens.white80} />
            <Text style={styles.btnText}>Share</Text>
          </HapticButton>
        </View>
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
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: tokens.borderSubtle,
    borderBottomWidth: 0,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: tokens.white20, alignSelf: 'center', marginTop: 10, marginBottom: 16,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontFamily: 'SpaceGrotesk-Bold', fontSize: tokens.font.sectionHeader, letterSpacing: -0.5, color: tokens.white100 },
  qrWrap: { alignSelf: 'center', marginBottom: 20 },
  qrBg: { backgroundColor: '#fff', borderRadius: 16, padding: 4, overflow: 'hidden' },
  addrLabel: { fontFamily: 'Lexend-Medium', fontSize: tokens.font.small, color: tokens.textTertiary, marginBottom: 6 },
  addrRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: tokens.bgGlass, borderRadius: tokens.radius.sm,
    borderWidth: 1, borderColor: tokens.borderSubtle,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  addr: { flex: 1, fontFamily: 'Lexend-Regular', fontSize: tokens.font.small, color: tokens.white80 },
  actions: { gap: 8 },
  btnText: { fontFamily: 'Lexend-SemiBold', fontSize: tokens.font.body, color: tokens.white80 },
});
