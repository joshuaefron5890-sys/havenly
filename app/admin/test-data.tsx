import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { goBack } from '../../lib/navigation';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { deleteTestData, generateTestData, getTestDataStatus, TestDataStatus } from '../../lib/testData';
import { colors } from '../../theme/colors';

export default function AdminTestData() {
  const { user, clusterId, loading: authLoading } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const [status, setStatus] = useState<TestDataStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'generate' | 'delete' | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    getTestDataStatus()
      .then(setStatus)
      .catch((err: any) => setError(err?.message ?? err?.code ?? 'unknown error'));
  }, [isAdmin]);

  useFocusEffect(load);

  const handleGenerate = async () => {
    setBusy('generate');
    try {
      setStatus(await generateTestData());
    } catch (err: any) {
      showAlert('Couldn’t generate test data', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy('delete');
    try {
      setStatus(await deleteTestData());
    } catch (err: any) {
      showAlert('Couldn’t delete test data', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setBusy(null);
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

  const hasData = Boolean(status && (status.familyCount > 0 || status.sitterCount > 0));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Test data</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Fake families and sitters, tagged as test data, for trying out Discover, matching, and sitter vetting
          without real signups. They're only ever visible to a cluster admin (you) — regular families never see
          them, so there's no separate switch to leave on by accident.
        </Text>

        {error ? <EmptyState text={`Couldn’t load test data status (${error}).`} /> : null}
        {status === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}

        {status ? (
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Ionicons name="people-outline" size={18} color={colors.accent} />
              <Text style={styles.statusText}>
                {status.familyCount} test {status.familyCount === 1 ? 'family' : 'families'}
              </Text>
            </View>
            <View style={styles.statusRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.accent} />
              <Text style={styles.statusText}>
                {status.sitterCount} test {status.sitterCount === 1 ? 'sitter' : 'sitters'}
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable style={[styles.button, styles.generateButton]} onPress={handleGenerate} disabled={busy !== null}>
          {busy === 'generate' ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.generateButtonText}>{hasData ? 'Regenerate test data' : 'Generate test data'}</Text>
          )}
        </Pressable>
        <Text style={styles.hint}>
          Creates 30 families and 15 sitters with varied interests, neurodivergence, and playdate preferences so
          matching actually has something to work with. Running this again reshuffles the same set rather than
          piling up duplicates.
        </Text>

        {hasData ? (
          <>
            <Pressable style={[styles.button, styles.deleteButton]} onPress={handleDelete} disabled={busy !== null}>
              {busy === 'delete' ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Text style={styles.deleteButtonText}>Delete all test data</Text>
              )}
            </Pressable>
          </>
        ) : null}
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
  statusCard: {
    flexDirection: 'row',
    gap: 20,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  button: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  generateButton: {
    backgroundColor: colors.accent,
  },
  generateButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginBottom: 24,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: 15,
    fontWeight: '700',
  },
});
