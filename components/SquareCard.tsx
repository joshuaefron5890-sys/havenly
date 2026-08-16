import { Ionicons } from '@expo/vector-icons';
import { ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';
import { Photo } from './Photo';

// A square, image-forward card for dashboard grids — deliberately shows
// less than a ListRow (title + one line of subtitle) since it links through
// to a detail screen with the rest. Fixed pixel width rather than a
// percentage-based flexBasis, and no flexGrow — a trailing incomplete row
// (5 items in a 4-wide grid, say) leaves empty space instead of the last
// couple of cards stretching to fill it.
export function SquareCard({
  title,
  subtitle,
  image,
  icon,
  pairImages,
  onPress,
  favorited,
  onToggleFavorite,
  badge,
  community,
  contributedBy,
}: {
  title: string;
  subtitle?: string;
  image?: ImageSourcePropType;
  icon?: keyof typeof Ionicons.glyphMap;
  // Two overlapping circular avatars instead of a single square image —
  // for a playdate proposal, showing both families involved rather than a
  // generic calendar icon. Takes priority over image/icon when given.
  pairImages?: [ImageSourcePropType | undefined, ImageSourcePropType | undefined];
  onPress: () => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
  // A small pill in the thumbnail's top-left corner (e.g. "Proposed" on a
  // pending playdate proposal) — opposite corner from the favorite heart.
  // Ignored when `community` is set, since that has its own fixed look.
  badge?: string;
  // The standardized "this was added by a family, not curated" marker —
  // same dark icon+label pill everywhere it appears (here, ListRow, and the
  // contribution detail screen) so it always reads the same regardless of
  // section. Kept visually distinct from `badge` (which uses the accent
  // color for playdate-status pills like "Proposed") on purpose.
  community?: boolean;
  contributedBy?: string;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.thumbnailWrap}>
        {pairImages ? (
          <View style={[styles.thumbnail, styles.pairThumbnail]}>
            <Photo source={pairImages[0]} style={[styles.pairAvatar, styles.pairAvatarBack]} />
            <Photo source={pairImages[1]} style={[styles.pairAvatar, styles.pairAvatarFront]} />
          </View>
        ) : !image && icon ? (
          <View style={[styles.thumbnail, styles.iconThumbnail]}>
            <Ionicons name={icon} size={22} color={colors.surface} />
          </View>
        ) : (
          <Photo source={image} style={styles.thumbnail} />
        )}
        {community ? (
          <View style={styles.communityBadge}>
            <Ionicons name="people" size={9} color={colors.surface} />
            <Text style={styles.communityBadgeText} numberOfLines={1}>
              Community
            </Text>
          </View>
        ) : badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        ) : null}
        {onToggleFavorite ? (
          <Pressable hitSlop={8} onPress={onToggleFavorite} style={styles.heart}>
            <Ionicons
              name={favorited ? 'heart' : 'heart-outline'}
              size={14}
              color={favorited ? colors.accent : colors.surface}
            />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {contributedBy ? (
        <View style={styles.contributorRow}>
          <Ionicons name="person-circle-outline" size={11} color={colors.textMuted} />
          <Text style={styles.contributorText} numberOfLines={1}>
            {contributedBy}
          </Text>
        </View>
      ) : subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export const CARD_WIDTH = 76;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
  },
  thumbnailWrap: {
    marginBottom: 6,
  },
  thumbnail: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
  },
  iconThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    // White-on-black rather than the tinted thumbnail's accent color —
    // matches ListRow's fallback icon treatment.
    backgroundColor: colors.text,
  },
  pairThumbnail: {
    overflow: 'visible',
  },
  pairAvatar: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  pairAvatarBack: {
    top: 8,
    left: 4,
  },
  pairAvatarFront: {
    bottom: 8,
    right: 4,
  },
  heart: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(43,36,32,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  communityBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    // Fixed dark color (not the accent) so it never gets confused with a
    // status pill like "Proposed" — this one only ever means one thing.
    backgroundColor: colors.text,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  communityBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.surface,
    textTransform: 'uppercase',
  },
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  contributorText: {
    flex: 1,
    fontSize: 10,
    color: colors.textMuted,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.surface,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
});
