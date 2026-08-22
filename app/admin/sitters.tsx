import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { Photo } from '../../components/Photo';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { fetchPendingSitters, PendingSitter, setSitterVettingStatus } from '../../lib/sitters';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { colors } from '../../theme/colors';

export default function AdminSitters() {
  const { user, clusterId, loading: authLoading } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const [sitters, setSitters] = useState<PendingSitter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchPendingSitters()
      .then(setSitters)
      .catch((err: any) => setError(err?.message ?? err?.code ?? 'unknown error'));
  }, [isAdmin]);

  useFocusEffect(load);

  const decide = async (uid: string, status: 'clear' | 'flagged') => {
    setBusyUid(uid);
    try {
      await setSitterVettingStatus(uid, status);
      setSitters((prev) => prev?.filter((s) => s.uid !== uid) ?? null);
    } catch (err: any) {
      showAlert('Couldn’t update that sitter', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setBusyUid(null);
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
        <Pressable style={styles.backAlone} onPress={() => router.back()}>
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
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Vet sitters</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? <EmptyState text={`Couldn’t load sitters (${error}).`} /> : null}
        {sitters === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
        {sitters?.length === 0 ? <EmptyState text="No sitters waiting on review." /> : null}

        {sitters?.map((sitter) => (
          <View key={sitter.uid} style={styles.card}>
            <View style={styles.cardHeader}>
              <Photo source={sitter.photoUrl ? { uri: sitter.photoUrl } : undefined} style={styles.avatar} variant="person" iconSize={22} />
              <View style={styles.cardHeaderText}>
                <Text style={styles.name}>{sitter.name}</Text>
                <Text style={styles.location}>{sitter.city ? `${sitter.city}, ${sitter.state}` : sitter.email}</Text>
              </View>
              <View style={[styles.statusPill, sitter.backgroundCheckStatus === 'flagged' && styles.statusPillFlagged]}>
                <Text style={[styles.statusPillText, sitter.backgroundCheckStatus === 'flagged' && styles.statusPillTextFlagged]}>
                  {sitter.backgroundCheckStatus === 'flagged' ? 'Flagged' : 'Pending'}
                </Text>
              </View>
            </View>

            <Field label="Email" value={sitter.email} />
            <Field label="Phone" value={sitter.phone} />
            <Field label="Years of experience" value={sitter.yearsExperience} />
            {sitter.specialties.length ? <Field label="Experience with" value={sitter.specialties.join(', ')} /> : null}
            {sitter.certifications.length ? <Field label="Credentials" value={sitter.certifications.join(', ')} /> : null}
            {sitter.bio ? <Field label="About" value={sitter.bio} /> : null}

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionButton, styles.flagButton]}
                onPress={() => decide(sitter.uid, 'flagged')}
                disabled={busyUid === sitter.uid}
              >
                <Text style={styles.flagButtonText}>Flag</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => decide(sitter.uid, 'clear')}
                disabled={busyUid === sitter.uid}
              >
                <Text style={styles.approveButtonText}>Approve</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
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
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  cardHeaderText: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  location: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusPill: {
    backgroundColor: colors.warningMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillFlagged: {
    backgroundColor: colors.errorMuted,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
  },
  statusPillTextFlagged: {
    color: colors.error,
  },
  field: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 13,
    color: colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  flagButton: {
    backgroundColor: colors.errorMuted,
  },
  flagButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.error,
  },
  approveButton: {
    backgroundColor: colors.accent,
  },
  approveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
});
