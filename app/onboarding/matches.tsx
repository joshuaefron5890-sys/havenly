import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Photo } from '../../components/Photo';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

const SUGGESTED_FAMILIES = [
  { name: 'The Nakamura Family', subtitle: 'Ages 2 & 5 · 0.4 mi away', tags: ['Playground', 'Nature Walks'], image: images.familyNakamura },
  { name: 'The Osei Family', subtitle: 'Ages 3 & 3 · 0.9 mi away', tags: ['Arts & Crafts', 'Music'], image: images.familyOsei },
  { name: 'The Reyes Family', subtitle: 'Age 4 · 1.2 mi away', tags: ['Playground', 'Swimming'], image: images.familyReyes },
];

export default function Matches() {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Photo source={images.matchesHero} style={styles.heroImage} />
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>3 families found nearby!</Text>
          </View>
        </View>

        <Text style={styles.headline}>You're all set,</Text>
        <Text style={styles.headlineAccent}>welcome to Opened Circle!</Text>
        <Text style={styles.subtext}>Here are families near you ready to connect.</Text>

        {SUGGESTED_FAMILIES.map((family) => (
          <View key={family.name} style={styles.card}>
            <Photo source={family.image} style={styles.avatar} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{family.name}</Text>
              <Text style={styles.cardSubtitle}>{family.subtitle}</Text>
              <View style={styles.tags}>
                {family.tags.map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Pressable style={styles.sayHi}>
              <Text style={styles.sayHiText}>Say hi!</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.cta} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.ctaText}>Explore the App</Text>
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
    height: 160,
    borderRadius: 20,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 16,
    overflow: 'hidden',
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroBadge: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  headline: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  headlineAccent: {
    fontSize: 26,
    fontWeight: '700',
    fontStyle: 'italic',
    color: colors.accent,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentMuted,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: 6,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  sayHi: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sayHiText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '700',
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
