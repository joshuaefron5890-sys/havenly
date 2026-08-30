import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { goBack } from '../../lib/navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { Photo } from '../../components/Photo';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { BackgroundCheckStatus, docExtensionLabel, fetchPendingSitters, isImageDocUrl, PendingSitter, setSitterVettingStatus } from '../../lib/sitters';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { colors } from '../../theme/colors';

const TABS: { status: BackgroundCheckStatus; label: string }[] = [
  { status: 'pending', label: 'Pending' },
  { status: 'clear', label: 'Approved' },
  { status: 'flagged', label: 'Rejected' },
];

// What an admin can do to a sitter from each tab — moving them to either of
// the other two states. Pending can go either way; Approved/Rejected only
// offer the flip to the other of those two (undoing back to "never
// reviewed" isn't a real workflow an admin needs).
function actionsForStatus(status: BackgroundCheckStatus): { status: BackgroundCheckStatus; label: string }[] {
  if (status === 'pending') {
    return [
      { status: 'flagged', label: 'Reject' },
      { status: 'clear', label: 'Approve' },
    ];
  }
  if (status === 'clear') {
    return [{ status: 'flagged', label: 'Reject' }];
  }
  return [{ status: 'clear', label: 'Approve' }];
}

export default function AdminSitters() {
  const { user, clusterId, loading: authLoading } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const [sitters, setSitters] = useState<PendingSitter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BackgroundCheckStatus>('pending');

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchPendingSitters()
      .then(setSitters)
      .catch((err: any) => setError(err?.message ?? err?.code ?? 'unknown error'));
  }, [isAdmin]);

  useFocusEffect(load);

  const decide = async (uid: string, status: BackgroundCheckStatus) => {
    setBusyUid(uid);
    try {
      await setSitterVettingStatus(uid, status);
      setSitters((prev) => prev?.map((s) => (s.uid === uid ? { ...s, backgroundCheckStatus: status } : s)) ?? null);
    } catch (err: any) {
      showAlert('Couldn’t update that sitter', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setBusyUid(null);
    }
  };

  const tabSitters = sitters?.filter((s) => s.backgroundCheckStatus === activeTab) ?? null;
  const tabCounts = TABS.map((tab) => sitters?.filter((s) => s.backgroundCheckStatus === tab.status).length ?? 0);

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
        <Text style={styles.headerTitle}>Vet sitters</Text>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab, i) => (
          <Pressable
            key={tab.status}
            style={[styles.tab, activeTab === tab.status && styles.tabActive]}
            onPress={() => setActiveTab(tab.status)}
          >
            <Text style={[styles.tabText, activeTab === tab.status && styles.tabTextActive]}>
              {tab.label}
              {sitters ? ` (${tabCounts[i]})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? <EmptyState text={`Couldn’t load sitters (${error}).`} /> : null}
        {sitters === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
        {tabSitters?.length === 0 ? (
          <EmptyState
            text={
              activeTab === 'pending'
                ? 'No sitters waiting on review.'
                : activeTab === 'clear'
                ? 'No approved sitters yet.'
                : 'No rejected sitters.'
            }
          />
        ) : null}

        {tabSitters?.map((sitter) => (
          <View key={sitter.uid} style={styles.card}>
            <View style={styles.cardHeader}>
              <Photo source={sitter.photoUrl ? { uri: sitter.photoUrl } : undefined} style={styles.avatar} variant="person" iconSize={22} />
              <View style={styles.cardHeaderText}>
                <Text style={styles.name}>{sitter.name}</Text>
                <Text style={styles.location}>{sitter.city ? `${sitter.city}, ${sitter.state}` : sitter.email}</Text>
              </View>
            </View>

            <Field label="Email" value={sitter.email} />
            <Field label="Phone" value={sitter.phone} />
            <Field label="Years of experience" value={sitter.yearsExperience} />
            {sitter.specialties.length ? <Field label="Experience with" value={sitter.specialties.join(', ')} /> : null}
            {sitter.certifications.length ? <Field label="Credentials" value={sitter.certifications.join(', ')} /> : null}
            {sitter.bio ? <Field label="About" value={sitter.bio} /> : null}
            {sitter.certificationDocUrls.length ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>CERTIFICATION DOCUMENTS</Text>
                <View style={styles.docRow}>
                  {sitter.certificationDocUrls.map((url) => (
                    <Pressable key={url} onPress={() => Linking.openURL(url)}>
                      {isImageDocUrl(url) ? (
                        <Image source={{ uri: url }} style={styles.docThumb} />
                      ) : (
                        <View style={[styles.docThumb, styles.docFileThumb]}>
                          <Ionicons name="document-text-outline" size={18} color={colors.textMuted} />
                          <Text style={styles.docFileLabel}>{docExtensionLabel(url)}</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              {actionsForStatus(sitter.backgroundCheckStatus).map((action) => (
                <Pressable
                  key={action.status}
                  style={[styles.actionButton, action.status === 'flagged' ? styles.flagButton : styles.approveButton]}
                  onPress={() => decide(sitter.uid, action.status)}
                  disabled={busyUid === sitter.uid}
                >
                  <Text style={action.status === 'flagged' ? styles.flagButtonText : styles.approveButtonText}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.surface,
  },
  content: {
    padding: 20,
    paddingTop: 0,
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
  docRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  docThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  docFileThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  docFileLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
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
