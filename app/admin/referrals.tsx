import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { goBack } from '../../lib/navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { fetchPendingReferralPayouts, markReferralPayoutPaid, PendingReferralPayout } from '../../lib/referrals';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { colors } from '../../theme/colors';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function payoutMethodLabel(payout: PendingReferralPayout): string {
  if (!payout.payoutMethod || !payout.payoutHandle) return 'No payout info on file';
  const method = payout.payoutMethod === 'venmo' ? 'Venmo' : 'PayPal';
  return `${method}: ${payout.payoutHandle}`;
}

export default function AdminReferrals() {
  const { user, clusterId, loading: authLoading } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const [payouts, setPayouts] = useState<PendingReferralPayout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchPendingReferralPayouts()
      .then(setPayouts)
      .catch((err: any) => setError(err?.message ?? err?.code ?? 'unknown error'));
  }, [isAdmin]);

  useFocusEffect(load);

  const markPaid = async (id: string) => {
    setBusyId(id);
    try {
      await markReferralPayoutPaid(id);
      setPayouts((prev) => prev?.filter((p) => p.id !== id) ?? null);
    } catch (err: any) {
      showAlert('Couldn’t mark that payout paid', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Pressable style={styles.backAlone} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.centered}>
          <EmptyState text="This page is only for cluster admins." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Referral payouts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          $15 owed to each side of a referral once the referred sitter is approved. Pay out via Venmo or PayPal,
          then mark it here.
        </Text>

        {error ? <EmptyState text={`Couldn’t load payouts (${error}).`} /> : null}
        {payouts === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
        {payouts?.length === 0 ? <EmptyState text="No payouts owed right now." /> : null}

        {payouts?.map((payout) => (
          <View key={payout.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderText}>
                <Text style={styles.name}>{payout.payeeName}</Text>
                <Text style={styles.role}>{payout.role === 'referrer' ? 'Referred a sitter' : 'Signed up via referral'}</Text>
              </View>
              <Text style={styles.amount}>${payout.amount}</Text>
            </View>

            <Text style={styles.method}>{payoutMethodLabel(payout)}</Text>
            <Text style={styles.due}>Owed since {formatDate(payout.createdAt)} · due by {formatDate(payout.dueBy)}</Text>

            <Pressable
              style={[styles.payButton, busyId === payout.id && styles.payButtonDisabled]}
              onPress={() => markPaid(payout.id)}
              disabled={busyId !== null}
            >
              <Text style={styles.payButtonText}>{busyId === payout.id ? 'Marking…' : 'Mark as paid'}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backAlone: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
  },
  intro: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  spinner: {
    marginVertical: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardHeaderText: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  role: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  amount: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
  },
  method: {
    fontSize: 13,
    color: colors.text,
    marginBottom: 4,
  },
  due: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 12,
  },
  payButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
});
