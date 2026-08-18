import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';
import { images } from '../theme/images';
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
  badgeVariant = 'accent',
  community,
  contributedBy,
  matchScore,
  softFallback,
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
  // 'positive' (green) for a settled/good-news status like "Confirmed";
  // 'warning' (yellow) for an algorithmic suggestion like "Suggested";
  // 'accent' (orange, the default) for everything else, e.g. "Proposed"
  // still waiting on a response.
  badgeVariant?: 'accent' | 'positive' | 'warning';
  // The standardized "this was added by a family, not curated" marker —
  // the haven logo mark plus a "Community Added" label in a white pill,
  // over a shared fallback photo when the contribution has none of its
  // own. Kept visually distinct from `badge` (which uses the accent color
  // for playdate-status pills like "Proposed") on purpose.
  community?: boolean;
  contributedBy?: string;
  // A small circle in the thumbnail's bottom-right corner — kept separate
  // from `badge` (top, spans the width) so a card can carry both a status
  // label like "Suggested" and its match percentage at once.
  matchScore?: number;
  // Softens the icon fallback (light gray instead of near-black, muted
  // instead of white) for content that's simply missing a photo — as
  // opposed to the same fallback's default dark look, kept for cases where
  // the icon itself is the point (e.g. a generic product/podcast type).
  // Same light-gray-plus-muted-icon treatment Photo's `variant="person"`
  // uses, for visual consistency across every "nothing to show here" case.
  softFallback?: boolean;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.thumbnailWrap}>
        {pairImages ? (
          <View style={[styles.thumbnail, styles.pairThumbnail]}>
            <Photo source={pairImages[0]} style={[styles.pairAvatar, styles.pairAvatarBack]} variant="person" iconSize={20} />
            <Photo source={pairImages[1]} style={[styles.pairAvatar, styles.pairAvatarFront]} variant="person" iconSize={20} />
          </View>
        ) : !image && community ? (
          // A community contribution with no photo of its own gets a
          // shared "this is from the community" image instead of a flat
          // icon-on-color box — the per-item icon (calendar, bag, mic...)
          // still shows, as a small overlay, so the card still reads as
          // "this is an event" (etc.) at a glance despite the generic photo.
          <View style={styles.thumbnail}>
            <Photo source={images.communityContribution} style={styles.thumbnail} />
            {icon ? (
              <View style={styles.communityTypeIcon}>
                <Ionicons name={icon} size={32} color={colors.surface} />
              </View>
            ) : null}
          </View>
        ) : !image && icon ? (
          <View style={[styles.thumbnail, softFallback ? styles.softIconThumbnail : styles.iconThumbnail]}>
            <Ionicons name={icon} size={22} color={softFallback ? colors.textMuted : colors.surface} />
          </View>
        ) : (
          <Photo source={image} style={styles.thumbnail} />
        )}
        {community ? (
          <View style={styles.communityBadge}>
            <Image source={require('../assets/logo-mark.png')} style={styles.communityBadgeMark} resizeMode="contain" />
            <Text style={styles.communityBadgeText} numberOfLines={1}>
              Community Added
            </Text>
          </View>
        ) : badge ? (
          <View
            style={[
              styles.badge,
              badgeVariant === 'positive' && styles.badgePositive,
              badgeVariant === 'warning' && styles.badgeWarning,
            ]}
          >
            <Text style={[styles.badgeText, badgeVariant === 'warning' && styles.badgeTextDark]} numberOfLines={1}>
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
        {matchScore != null ? (
          <View style={styles.matchScoreBadge}>
            <Text style={styles.matchScoreText} numberOfLines={1}>
              {matchScore}%
            </Text>
          </View>
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
  communityTypeIcon: {
    // Centered over the shared community photo so the card still reads as
    // "this is an event" (etc.) at a glance — same dark translucent chip
    // treatment as the favorite heart, just centered instead of cornered.
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(43,36,32,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    // White-on-black rather than the tinted thumbnail's accent color —
    // matches ListRow's fallback icon treatment.
    backgroundColor: colors.text,
  },
  softIconThumbnail: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.border,
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
  matchScoreBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    minWidth: 24,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchScoreText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.surface,
  },
  badgePositive: {
    backgroundColor: colors.positive,
  },
  badgeWarning: {
    // A bright, unambiguous yellow rather than colors.warning (a dark
    // amber tuned for white text elsewhere in the app, see
    // app/onboarding/calendar.tsx) — kept local to this badge rather than
    // changing that shared token, paired with dark text below since white
    // text on true yellow reads poorly.
    backgroundColor: '#F5C518',
  },
  communityBadge: {
    // The haven mark plus a short label, in a white pill sized to its own
    // content (not stretched to the card width) — reads as an official
    // app-level stamp rather than a generic label, and (unlike a
    // contributor-photo avatar) never needs a fallback state for families
    // without a photo on file.
    position: 'absolute',
    top: 4,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  communityBadgeMark: {
    width: 9,
    height: 9,
  },
  communityBadgeText: {
    fontSize: 6,
    fontWeight: '700',
    color: colors.text,
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
  badgeTextDark: {
    color: colors.text,
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
