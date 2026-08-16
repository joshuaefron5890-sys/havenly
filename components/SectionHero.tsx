import { StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';
import { Photo } from './Photo';

// A full-width photo banner at the top of each bottom-nav sub-page — what
// this section is, with a real image instead of a small icon tile, in the
// same "big photo + scrim + overlaid headline" style as the Resources
// screen's featured-article card. `imageUrl` is a specific hand-picked
// photo (curated by the user, not a random/keyless placeholder) so each
// section's banner actually matches what it's about.
export function SectionHero({
  imageUrl,
  title,
  description,
}: {
  imageUrl: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.hero}>
      <Photo source={{ uri: imageUrl }} style={styles.image} />
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
