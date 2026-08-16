import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';
import { Photo } from './Photo';

// A full-width photo banner at the top of each bottom-nav sub-page — what
// this section is, with a real image instead of a small icon tile, in the
// same "big photo + scrim + overlaid headline" style as the Resources
// screen's featured-article card. `photoSeed` is a stable key into a
// keyless stock-photo CDN (picsum.photos/seed/<key> always returns the
// same image for the same key, no API token or curated asset needed).
export function SectionHero({
  photoSeed,
  title,
  description,
}: {
  photoSeed: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.hero}>
      <Photo source={{ uri: `https://picsum.photos/seed/${photoSeed}/800/450` }} style={styles.image} />
      <View style={styles.scrim} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 160,
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Darkens the bottom of the photo so white text stays legible regardless
  // of how bright the underlying photo is — same idiom as the family
  // profile hero.
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  textWrap: {
    padding: 16,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.surface,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: colors.surface,
    opacity: 0.9,
    lineHeight: 18,
  },
});
