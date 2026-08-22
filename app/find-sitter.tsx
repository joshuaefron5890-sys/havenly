import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../components/EmptyState';
import { Photo } from '../components/Photo';
import { fetchRecommendedSitters, RecommendedSitter } from '../lib/sitters';
import { colors } from '../theme/colors';

export default function FindSitter() {
  const [sitters, setSitters] = useState<RecommendedSitter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchRecommendedSitters()
        .then((result) => {
          if (!cancelled) setSitters(result);
        })
        .catch((err: any) => {
          if (!cancelled) setError(err?.message ?? err?.code ?? 'unknown error');
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Find a sitter</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Vetted sitters near you, sorted by how much of their experience matches your kids’.
        </Text>

        {error ? <EmptyState text={`Couldn’t load sitters (${error}).`} /> : null}
        {sitters === null && !error ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
        {sitters?.length === 0 ? (
          <EmptyState text="No vetted sitters in your area yet — check back soon." />
        ) : null}

        {sitters?.map((sitter) => (
          <View key={sitter.uid} style={styles.card}>
            <View style={styles.cardHeader}>
              <Photo
                source={sitter.photoUrl ? { uri: sitter.photoUrl } : undefined}
                style={styles.avatar}
                variant="person"
                iconSize={24}
              />
              <View style={styles.cardHeaderText}>
                <Text style={styles.name}>{sitter.name}</Text>
                {sitter.city ? (
                  <Text style={styles.location}>
                    {sitter.city}, {sitter.state}
                  </Text>
                ) : null}
              </View>
              {sitter.matchScore > 0 ? (
                <View style={styles.matchPill}>
                  <Text style={styles.matchPillText}>{sitter.matchScore} in common</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              {sitter.yearsExperience ? <Field label="Experience" value={`${sitter.yearsExperience} yrs`} /> : null}
              {sitter.hourlyRate ? <Field label="Rate" value={sitter.hourlyRate} /> : null}
            </View>

            {sitter.bio ? <Text style={styles.bio}>{sitter.bio}</Text> : null}

            {sitter.specialties.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>EXPERIENCE WITH</Text>
                <View style={styles.tagRow}>
                  {sitter.specialties.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {sitter.certifications.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>CREDENTIALS</Text>
                <View style={styles.tagRow}>
                  {sitter.certifications.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.contactRow}>
              {sitter.phone ? (
                <View style={styles.contactItem}>
                  <Ionicons name="call-outline" size={14} color={colors.accent} />
                  <Text style={styles.contactText}>{sitter.phone}</Text>
                </View>
              ) : null}
              {sitter.email ? (
                <View style={styles.contactItem}>
                  <Ionicons name="mail-outline" size={14} color={colors.accent} />
                  <Text style={styles.contactText}>{sitter.email}</Text>
                </View>
              ) : null}
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
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  cardHeaderText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  location: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  matchPill: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  matchPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
  },
  field: {},
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  bio: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    marginTop: 12,
  },
  section: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
});
