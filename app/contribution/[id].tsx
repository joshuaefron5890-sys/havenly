import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CONTRIBUTION_SCHEMAS, ContributionType } from '../../lib/contributions';
import { colors } from '../../theme/colors';

// One detail screen for every contributed content type — the fields
// themselves (and their labels/order) come from CONTRIBUTION_SCHEMAS, the
// same source the "Contribute" form used to collect them, so this never
// needs updating when a form's fields change.
export default function ContributionDetail() {
  const { type, fieldsJson, contributedByName } = useLocalSearchParams<{
    id: string;
    type: string;
    fieldsJson?: string;
    contributedByName?: string;
  }>();

  const schema = CONTRIBUTION_SCHEMAS[type as ContributionType];
  const fields: Record<string, string> = fieldsJson ? JSON.parse(fieldsJson) : {};
  const title = fields.title || 'Community contribution';
  const url = fields.url?.trim();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.communityBadge}>
          <Ionicons name="people" size={14} color={colors.surface} />
          <Text style={styles.communityBadgeText}>Community contributed</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.attribution}>Contributed by {contributedByName || 'A Haven.ly family'}</Text>

        <View style={styles.card}>
          {schema?.fields
            .filter((f) => f.key !== 'title' && (fields[f.key] ?? '').trim())
            .map((f) => (
              <View key={f.key} style={styles.row}>
                <Text style={styles.rowLabel}>{f.label.toUpperCase()}</Text>
                <Text style={styles.rowValue}>{fields[f.key]}</Text>
              </View>
            ))}
        </View>
      </ScrollView>

      {url ? (
        <View style={styles.footer}>
          <Pressable style={styles.cta} onPress={() => Linking.openURL(url)}>
            <Text style={styles.ctaText}>Open link</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  communityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    // Same dark pill as the "Community" marker on cards throughout the app —
    // kept one fixed look everywhere it shows up.
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  communityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.surface,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  attribution: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  row: {},
  rowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  rowValue: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
  },
  footer: {
    padding: 20,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
