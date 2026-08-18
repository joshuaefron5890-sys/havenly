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
  // photo on file still reads as "a person", not a blank/broken box.
  // 'image' is the same soft treatment for non-person content that's just
  // missing a photo (an event with no image on file, say) — a generic
  // "no image" glyph instead of a person silhouette. Left unset for
  // content where a flat tinted block is fine as-is (podcast art,
  // interest icons), which keeps the plain placeholder.
  variant?: 'person' | 'image';
  iconSize?: number;
}) {
  if (source) {
    return <Image source={source} style={style} resizeMode="cover" />;
  }
  if (variant === 'person' || variant === 'image') {
    return (
      <View style={[style as StyleProp<ViewStyle>, styles.softPlaceholder]}>
        <Ionicons name={variant === 'person' ? 'person' : 'image-outline'} size={iconSize} color={colors.textMuted} />
      </View>
    );
  }
  return <View style={[style as StyleProp<ViewStyle>, styles.placeholder]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.accentMuted,
  },
  softPlaceholder: {
    // Neutral grey (same tokens as borders/muted text elsewhere) rather
    // than the app's orange accent or any content-specific tint — reads as
    // "nothing on file yet" without implying anything more.
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
