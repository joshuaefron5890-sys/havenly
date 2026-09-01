import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { FieldInput } from './FieldInput';
import { showAlert } from '../lib/alert';
import { fetchMyReferralStats, ReferralStats } from '../lib/referrals';
import { saveMySitterProfile } from '../lib/sitters';
import { colors } from '../theme/colors';

const SIGNUP_URL = 'https://openedcircle.com/provider-signup';

function referralMessage(code: string): string {
  return `Join me as a sitter on Opened Circle! Use my code ${code} when you sign up — we'll both get $15 once you're approved. ${SIGNUP_URL}`;
}

export function ReferralModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingPayout, setEditingPayout] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'venmo' | 'paypal'>('venmo');
  const [payoutHandle, setPayoutHandle] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStats(null);
    setError(null);
    setCopied(false);
    fetchMyReferralStats()
      .then((result) => {
        setStats(result);
        setPayoutMethod(result.payoutMethod ?? 'venmo');
        setPayoutHandle(result.payoutHandle ?? '');
        setEditingPayout(!result.payoutMethod || !result.payoutHandle);
      })
      .catch((err: any) => setError(err?.message ?? err?.code ?? 'unknown error'));
  }, [visible]);

  const copyCode = async () => {
    if (!stats?.code) return;
    await Clipboard.setStringAsync(stats.code);
    setCopied(true);
  };

  const savePayoutInfo = async () => {
    if (!payoutHandle.trim()) {
      showAlert('Add your username', `Enter your ${payoutMethod === 'venmo' ? 'Venmo' : 'PayPal'} username first.`);
      return;
    }
    setSavingPayout(true);
    try {
      await saveMySitterProfile({ payoutMethod, payoutHandle: payoutHandle.trim() }, false);
      setStats((prev) => (prev ? { ...prev, payoutMethod, payoutHandle: payoutHandle.trim() } : prev));
      setEditingPayout(false);
    } catch (err: any) {
      showAlert('Couldn’t save that', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setSavingPayout(false);
    }
  };

  const shareViaEmail = () => {
    if (!stats?.code) return;
    const subject = encodeURIComponent('Join me as a sitter on Opened Circle');
    const body = encodeURIComponent(referralMessage(stats.code));
    Linking.openURL(`mailto:?subject=${subject}&body=${body}`).catch(() =>
      showAlert('Couldn’t open email', 'Please try again.')
    );
  };

  const shareViaText = async () => {
    if (!stats?.code) return;
    const message = referralMessage(stats.code);
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
      if (nav?.share) {
        try {
          await nav.share({ text: message });
          return;
        } catch {
          // User cancelled the native share sheet — not an error.
          return;
        }
      }
      await Clipboard.setStringAsync(message);
      showAlert('Message copied', 'Paste it into a text or DM.');
      return;
    }
    Linking.openURL(`sms:&body=${encodeURIComponent(message)}`).catch(() =>
      Clipboard.setStringAsync(message).then(() => showAlert('Message copied', 'Paste it into a text.'))
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Your referral code</Text>
          <Text style={styles.subtitle}>
            Share it with a sitter — you each get $15 once they sign up and clear vetting.
          </Text>

          {error ? (
            <Text style={styles.error}>Couldn’t load your code ({error}).</Text>
          ) : !stats ? (
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          ) : (
            <>
              <View style={styles.codeBox}>
                <Text style={styles.code}>{stats.code ?? '—'}</Text>
                <Pressable style={styles.copyButton} onPress={copyCode} disabled={!stats.code}>
                  <Ionicons name="copy-outline" size={13} color={colors.surface} />
                  <Text style={styles.copyButtonText}>{copied ? 'Copied' : 'Copy'}</Text>
                </Pressable>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statTile}>
                  <Text style={styles.statNum}>{stats.approvedCount}</Text>
                  <Text style={styles.statLabel}>SITTERS JOINED</Text>
                </View>
                <View style={[styles.statTile, styles.statTileMoney]}>
                  <Text style={[styles.statNum, styles.statNumMoney]}>${stats.earnedPaid}</Text>
                  <Text style={styles.statLabel}>YOU’VE EARNED</Text>
                </View>
              </View>
              {stats.owedPending > 0 ? (
                <Text style={styles.pendingNote}>
                  +${stats.owedPending} more on the way (paid out within 7 days of approval).
                </Text>
              ) : null}

              <Text style={styles.sectionLabel}>SEND YOUR CODE</Text>
              <View style={styles.shareRow}>
                <Pressable style={styles.shareButton} onPress={shareViaText}>
                  <Ionicons name="chatbubble-outline" size={15} color={colors.accent} />
                  <Text style={styles.shareButtonText}>Text</Text>
                </Pressable>
                <Pressable style={styles.shareButton} onPress={shareViaEmail}>
                  <Ionicons name="mail-outline" size={15} color={colors.accent} />
                  <Text style={styles.shareButtonText}>Email</Text>
                </Pressable>
              </View>

              <View style={styles.payoutSection}>
                <View style={styles.payoutHeader}>
                  <Text style={styles.sectionLabel}>PAYOUT INFO</Text>
                  {!editingPayout ? (
                    <Pressable onPress={() => setEditingPayout(true)}>
                      <Text style={styles.editLink}>Edit</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.payoutNote}>
                  We're not linking your account — just sharing this with Opened Circle so we can send your $15
                  payments. Paid out within 7 days of approval.
                </Text>
                {editingPayout ? (
                  <>
                    <View style={styles.methodRow}>
                      {(['venmo', 'paypal'] as const).map((method) => (
                        <Pressable
                          key={method}
                          style={[styles.methodChip, payoutMethod === method && styles.methodChipActive]}
                          onPress={() => setPayoutMethod(method)}
                        >
                          <Text style={[styles.methodChipText, payoutMethod === method && styles.methodChipTextActive]}>
                            {method === 'venmo' ? 'Venmo' : 'PayPal'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <FieldInput
                      label={payoutMethod === 'venmo' ? 'Venmo username' : 'PayPal username or email'}
                      placeholder={payoutMethod === 'venmo' ? '@your-name' : 'you@email.com'}
                      value={payoutHandle}
                      onChangeText={setPayoutHandle}
                      autoCapitalize="none"
                    />
                    <Pressable
                      style={[styles.saveButton, savingPayout && styles.saveButtonDisabled]}
                      onPress={savePayoutInfo}
                      disabled={savingPayout}
                    >
                      <Text style={styles.saveButtonText}>{savingPayout ? 'Saving…' : 'Save'}</Text>
                    </Pressable>
                  </>
                ) : (
                  <Text style={styles.payoutSummary}>
                    {stats.payoutMethod === 'venmo' ? 'Venmo' : 'PayPal'} · {stats.payoutHandle}
                  </Text>
                )}
              </View>

              <Text style={styles.finePrint}>
                Credit is added once your friend's background check clears — same standard every sitter goes
                through.
              </Text>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(24,18,16,0.45)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 30,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  spinner: {
    marginVertical: 20,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginVertical: 20,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  code: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: colors.text,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.surface,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statTileMoney: {
    backgroundColor: colors.positiveMuted,
  },
  statNum: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  statNumMoney: {
    color: colors.positive,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.4,
    marginTop: 2,
  },
  pendingNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  shareRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
  },
  shareButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  payoutSection: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  payoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  editLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  payoutNote: {
    fontSize: 11.5,
    color: colors.textMuted,
    lineHeight: 16,
    marginBottom: 12,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  methodChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  methodChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  methodChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  methodChipTextActive: {
    color: colors.surface,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
  payoutSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  finePrint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
