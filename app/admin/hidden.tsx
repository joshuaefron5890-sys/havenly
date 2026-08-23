import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { fetchHiddenContent, HiddenItem, unhideContent } from '../../lib/moderation';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { colors } from '../../theme/colors';

// A hidden item's key is type-prefixed (see lib/moderation.ts) — this
// screen doesn't need to parse it, just show the title, but the prefix
// alone is a useful "what kind of thing was this" label for the admin.
function kindLabel(key: string): string {
  const kind = key.split(':')[0];
  const labels: Record<string, string> = {
    event: 'Event',
    podcast: 'Podcast',
    product: 'Product',
    article: 'Article',
    blog: 'Blog post',
    contribution: 'Community pick',
  };
  return labels[kind] ?? 'Item';
}

export default function AdminHidden() {
  const { user, clusterId, loading: authLoading } = useAuth();
  const isAdmin = isSuperAdminEmail(user?.email, clusterId);
  const [items, setItems] = useState<HiddenItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchHiddenContent()
      .then(setItems)
      .catch((err: any) => setError(err?.message ?? err?.code ?? 'unknown error'));
  }, [isAdmin]);

  useFocusEffect(load);

  const restore = async (key: string) => {
    setBusyKey(key);
    try {
      await unhideContent(key);
      setItems((prev) => prev?.filter((i) => i.key !== key) ?? null);
    } catch (err: any) {
      showAlert('Couldn’t restore that item', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setBusyKey(null);
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
        <Text style={styles.headerTitle}>Hidden items</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Removed from every family's feed, curated or community-contributed alike. Restoring one puts it
          right back.
        </Text>

        {error ? <EmptyState text={`Couldn’t load hidden items (${error}).`} /> : null}
        {items === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
        {items?.length === 0 ? <EmptyState text="Nothing hidden right now." /> : null}

        {items?.map((item) => (
          <View key={item.key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.kind}>{kindLabel(item.key)}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {item.hiddenByEmail ? <Text style={styles.hiddenBy}>Hidden by {item.hiddenByEmail}</Text> : null}
            </View>
            <Pressable
              style={[styles.restoreButton, busyKey === item.key && styles.restoreButtonDisabled]}
              onPress={() => restore(item.key)}
              disabled={busyKey !== null}
            >
              <Text style={styles.restoreButtonText}>{busyKey === item.key ? 'Restoring…' : 'Restore'}</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  rowText: {
    flex: 1,
  },
  kind: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  hiddenBy: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  restoreButton: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  restoreButtonDisabled: {
    opacity: 0.6,
  },
  restoreButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
});
