import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { colors } from '../../theme/colors';

// Event data comes from a public events feed (TACA, or one of the regional
// centers/family-support orgs in functions/index.js's TRIBE_EVENT_SOURCES)
// and is already fully fetched client-side on the dashboard, so it's
// handed over via route params instead of being re-fetched here — there's
// no "look up an event by id" endpoint, and nothing here is sensitive.
export default function EventDetail() {
  const { title, source, eventDate, venue, address, imageUrl, link, categories, distanceMiles, virtual } =
    useLocalSearchParams<{
      id: string;
      title?: string;
      source?: string;
      eventDate?: string;
      venue?: string;
      address?: string;
      imageUrl?: string;
      link: string;
      categories?: string;
      distanceMiles?: string;
      virtual?: string;
    }>();

  const dateLabel = eventDate
    ? new Date(eventDate).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const categoryList = categories ? categories.split(',').filter(Boolean) : [];
  const isVirtual = virtual === 'true';
  const distanceLabel = isVirtual
    ? 'Virtual event'
    : distanceMiles
      ? `${Math.round(Number(distanceMiles))} miles away`
      : '';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Photo source={imageUrl ? { uri: imageUrl } : undefined} style={styles.heroImage} variant="image" iconSize={40} />
          <Pressable style={styles.back} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.title}>{title || 'Event'}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>DATE & TIME</Text>
          <Text style={styles.infoValue}>{dateLabel || 'Date not listed'}</Text>
        </View>

        {(venue || address || isVirtual) && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>LOCATION</Text>
            {venue ? <Text style={styles.infoValue}>{venue}</Text> : null}
            {address ? <Text style={styles.infoSubvalue}>{address}</Text> : null}
            {distanceLabel ? <Text style={styles.distanceLabel}>{distanceLabel}</Text> : null}
          </View>
        )}

        {categoryList.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>TYPE</Text>
            <View style={styles.tags}>
              {categoryList.map((category) => (
                <View key={category} style={styles.tag}>
                  <Text style={styles.tagText}>{category}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {source ? <Text style={styles.attribution}>From {source}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.cta, !link && styles.ctaDisabled]}
          disabled={!link}
          onPress={() => link && Linking.openURL(link)}
        >
          <Text style={styles.ctaText}>View event details</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  hero: {
    height: 180,
    borderRadius: 20,
    marginBottom: 16,
    padding: 16,
    overflow: 'hidden',
    backgroundColor: colors.accentMuted,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  infoSubvalue: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  distanceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    marginTop: 8,
  },
  tags: {
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
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    textTransform: 'capitalize',
  },
  attribution: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
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
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
