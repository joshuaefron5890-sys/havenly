import { Ionicons } from '@expo/vector-icons';
import { ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';
import { Photo } from './Photo';

// A square, image-forward card for dashboard grids — deliberately shows
// less than a ListRow (title + one line of subtitle) since it links through
// to a detail screen with the rest.
export function SquareCard({
  title,
  subtitle,
  image,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  image?: ImageSourcePropType;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {!image && icon ? (
        <View style={[styles.thumbnail, styles.iconThumbnail]}>
          <Ionicons name={icon} size={28} color={colors.accent} />
        </View>
      ) : (
        <Photo source={image} style={styles.thumbnail} />
      )}
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export const CARD_GRID_COLUMNS = 3;

const styles = StyleSheet.create({
  card: {
    flexBasis: '30%',
    flexGrow: 1,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
    marginBottom: 6,
  },
  iconThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
