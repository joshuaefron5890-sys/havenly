import { Ionicons } from '@expo/vector-icons';
import { ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';
import { Photo } from './Photo';

export function ListRow({
  title,
  subtitle,
  badge,
  image,
  icon,
  onPress,
  favorited,
  onToggleFavorite,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  image?: ImageSourcePropType;
  // Shown instead of a blank placeholder box when there's no real image to
  // display (e.g. MedlinePlus articles, which have no thumbnail of their own).
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  // Renders a heart button when provided. Its own onPress (rather than
  // relying on event bubbling) is what keeps a tap on the heart from also
  // triggering the row's onPress — same idiom SettingsMenu's modal uses to
  // stop a tap on the menu from bubbling up to its backdrop.
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  const Container = onPress ? Pressable : View;
  return (
    <Container style={styles.row} onPress={onPress}>
      {!image && icon ? (
        <View style={[styles.thumbnail, styles.iconThumbnail]}>
          <Ionicons name={icon} size={20} color={colors.surface} />
        </View>
      ) : (
        <Photo source={image} style={styles.thumbnail} />
      )}
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onToggleFavorite ? (
        <Pressable hitSlop={8} onPress={onToggleFavorite} style={styles.heart}>
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={20}
            color={favorited ? colors.accent : colors.textMuted}
          />
        </Pressable>
      ) : null}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    gap: 12,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
  },
  iconThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    // White-on-black rather than the tinted thumbnail's accent color —
    // keeps the article row's fallback icon neutral instead of orange.
    backgroundColor: colors.text,
  },
  heart: {
    padding: 2,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  badge: {
    backgroundColor: colors.positiveMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.positive,
  },
});
