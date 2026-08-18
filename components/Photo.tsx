import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

export function Photo({
  source,
  style,
  variant,
  iconSize = 24,
}: {
  source?: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  // 'person' swaps the bare color-block fallback for a gender-neutral
  // avatar silhouette — used anywhere a specific family or child's own
  // photo is shown (playdates, family profiles), so a family without a
  // photo on file still reads as "a person", not a blank/broken box. Left
  // unset for non-person content (podcast art, article thumbnails, etc.),
  // which keeps the plain tinted placeholder.
  variant?: 'person';
  iconSize?: number;
}) {
  if (source) {
    return <Image source={source} style={style} resizeMode="cover" />;
  }
  if (variant === 'person') {
    return (
      <View style={[style as StyleProp<ViewStyle>, styles.personPlaceholder]}>
        <Ionicons name="person" size={iconSize} color={colors.textMuted} />
      </View>
    );
  }
  return <View style={[style as StyleProp<ViewStyle>, styles.placeholder]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.accentMuted,
  },
  personPlaceholder: {
    // Neutral grey (same tokens as borders/muted text elsewhere) rather
    // than the app's orange accent or any pink/blue-coded tint — reads as
    // "no photo yet" without implying anything about who the family is.
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
