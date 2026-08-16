import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContributeModal } from '../../components/ContributeModal';
import { Photo } from '../../components/Photo';
import { useAuth } from '../../contexts/AuthContext';
import { CONTRIBUTION_SCHEMAS, ContributionType, updateContribution } from '../../lib/contributions';
import { familyDisplayName, familyPhoto, fetchFamiliesByUids, SuggestedFamily } from '../../lib/families';
import { colors } from '../../theme/colors';

// One detail screen for every contributed content type — the fields
// themselves (and their labels/order) come from CONTRIBUTION_SCHEMAS, the
// same source the "Contribute" form used to collect them, so this never
// needs updating when a form's fields change.
export default function ContributionDetail() {
  const { id, type, fieldsJson, contributedByName, contributedByUid } = useLocalSearchParams<{
    id: string;
    type: string;
    fieldsJson?: string;
    contributedByName?: string;
    contributedByUid?: string;
  }>();
  const { user } = useAuth();

  const schema = CONTRIBUTION_SCHEMAS[type as ContributionType];

  // Local, editable copies of what the route params passed in — updated in
  // place after a successful edit so the screen reflects the change right
  // away, without needing a refetch or a trip back to the list.
  const [liveFields, setLiveFields] = useState<Record<string, string>>(() =>
    fieldsJson ? JSON.parse(fieldsJson) : {}
  );
  const [liveContributedByName, setLiveContributedByName] = useState(contributedByName || 'A Haven.ly family');
  const [editVisible, setEditVisible] = useState(false);

  const [family, setFamily] = useState<SuggestedFamily | null>(null);

  // Best-effort — a contributor's full family profile is a nice-to-have
  // here, not required to show the contribution itself, so a failed fetch
  // just falls back to the plain contributedByName string.
  useEffect(() => {
    if (!contributedByUid) return;
    let cancelled = false;
    fetchFamiliesByUids([contributedByUid])
      .then((result) => {
        if (!cancelled && result[0]) setFamily(result[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contributedByUid]);

  const title = liveFields.title || 'Community contribution';
  const url = liveFields.url?.trim();
  const photoUrl = family ? familyPhoto(family) : null;
  const imageField = schema?.fields.find((f) => f.type === 'image');
  const contributedImageUrl = imageField ? liveFields[imageField.key]?.trim() : undefined;
  const isOwner = Boolean(user && contributedByUid && user.uid === contributedByUid);

  const handleEditSubmit = async (name: string, values: Record<string, string>) => {
    if (!id) return;
    await updateContribution(id, values, name);
    setLiveFields(values);
    setLiveContributedByName(name);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        {isOwner ? (
          <Pressable style={styles.editButton} onPress={() => setEditVisible(true)}>
            <Ionicons name="pencil" size={16} color={colors.text} />
            <Text style={styles.editButtonText}>Edit</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.communityBadge}>
          <Ionicons name="people" size={14} color={colors.community} />
          <Text style={styles.communityBadgeText}>Community contributed</Text>
        </View>

        <Text style={styles.title}>{title}</Text>

        <Pressable
          style={styles.contributorRow}
          onPress={() => !isOwner && contributedByUid && router.push(`/family/${contributedByUid}`)}
          disabled={isOwner || !contributedByUid}
        >
          <Photo source={photoUrl ? { uri: photoUrl } : undefined} style={styles.contributorPhoto} />
          <View style={styles.contributorInfo}>
            <Text style={styles.contributorName} numberOfLines={1}>
              {isOwner ? 'You' : family ? familyDisplayName(family) : liveContributedByName}
            </Text>
            <Text style={styles.contributorSub}>Contributed this {schema?.noun ?? 'pick'}</Text>
          </View>
          {/* A match score compares you to another family — meaningless (and
              was showing a clamped-but-real-looking number) when you're
              looking at your own contribution. */}
          {family && !isOwner ? (
            <View style={styles.matchBadge}>
              <Text style={styles.matchScore}>{family.matchScore}</Text>
              <Text style={styles.matchLabel}>match</Text>
            </View>
          ) : null}
        </Pressable>

        {contributedImageUrl ? <Image source={{ uri: contributedImageUrl }} style={styles.contributedImage} /> : null}

        <View style={styles.card}>
          {schema?.fields
            .filter((f) => f.type !== 'image' && f.key !== 'title' && (liveFields[f.key] ?? '').trim())
            .map((f) => (
              <View key={f.key} style={styles.row}>
                <Text style={styles.rowLabel}>{f.label.toUpperCase()}</Text>
                <Text style={styles.rowValue}>{liveFields[f.key]}</Text>
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

      {schema ? (
        <ContributeModal
          visible={editVisible}
          title={`Edit ${schema.noun}`}
          fields={schema.fields}
          defaultName={liveContributedByName}
          initialValues={liveFields}
          submitLabel="Save changes"
          onClose={() => setEditVisible(false)}
          onSubmit={handleEditSubmit}
        />
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
    justifyContent: 'space-between',
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.border,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
  },
  communityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    // Same soft blue pill as the "Community" marker on cards throughout the
    // app — kept one fixed look everywhere it shows up.
    backgroundColor: colors.communityMuted,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  communityBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.community,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  // Mirrors app/family/[id].tsx's own photo + name + match-score treatment
  // (scaled down for an inline row instead of a hero banner) — tapping
  // through opens that exact same profile screen.
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  contributorPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentMuted,
  },
  contributorInfo: {
    flex: 1,
  },
  contributorName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  contributorSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  matchBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchScore: {
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  matchLabel: {
    fontSize: 7,
    color: colors.textMuted,
  },
  contributedImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
    marginBottom: 16,
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
