import { Ionicons } from '@expo/vector-icons';
import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';
import { Photo } from './Photo';
import { BlogIcon } from './BlogIcon';
import { ReferralIcon } from './ReferralIcon';

export function ListRow({
  title,
  subtitle,
  badge,
  community,
  contributedBy,
  contributorPhoto,
  image,
  icon,
  personPlaceholder,
  onPress,
  favorited,
  onToggleFavorite,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  // The standardized "added by a family, not curated" marker — same dark
  // icon+label pill as SquareCard and the contribution detail screen use,
  // combined with the contributor's name into one row. Takes priority over
  // `subtitle` when set (contributions don't have a separate subtitle).
  community?: boolean;
  contributedBy?: string;
  // The contributor's own family photo, shown in place of the generic
  // person icon next to their name — null/undefined (no photo on file, or
  // not resolved yet) falls back to that icon instead of leaving a gap.
  contributorPhoto?: string | null;
  image?: ImageSourcePropType;
  // Shown instead of a blank placeholder box when there's no real image to
  // display (e.g. MedlinePlus articles, which have no thumbnail of their own).
  // 'community-logo' fills the whole thumbnail with the Opened Circle mark
  // itself (the Community announcements row) — distinct from the
  // `community` boolean below, which instead overlays a small corner
  // badge of the same mark onto some OTHER icon/image (a contribution's
  // own icon or photo), since a full-thumbnail logo makes that corner
  // badge redundant.
  icon?: keyof typeof Ionicons.glyphMap | 'referral' | 'blog' | 'community-logo';
  // A missing `image` gets a gender-neutral avatar silhouette instead of a
  // bare color block — for rows that show a specific family's photo (the
  // Messages inbox), where "no photo yet" should still read as "a person".
  // Ignored when `icon` is set, since that fallback already has its own look.
  personPlaceholder?: boolean;
  onPress?: () => void;
  // Renders a heart button when provided. Its own onPress (rather than
  // relying on event bubbling) is what keeps a tap on the heart from also
  // triggering the row's onPress — same idiom SettingsMenu's modal uses to
  // stop a tap on the menu from bubbling up to its backdrop.
  favorited?: boolean;
  onToggleFavorite?: () => void;
  // A Super Admin-only "remove this from every feed" action (see
  // lib/moderation.ts) — only ever passed by a screen that's already
  // checked isSuperAdminEmail, same idiom as onToggleFavorite: its own
  // onPress keeps a tap here from also triggering the row's onPress.
  onDelete?: () => void;
}) {
  const Container = onPress ? Pressable : View;
  return (
    <Container style={styles.row} onPress={onPress}>
      <View style={styles.thumbnailWrap}>
        {!image && icon ? (
          icon === 'community-logo' ? (
            <View style={[styles.thumbnail, styles.iconThumbnail, styles.communityLogoThumbnail]}>
              <Image source={require('../assets/logo-mark.png')} style={styles.communityLogoImage} resizeMode="contain" />
            </View>
          ) : (
            <View style={[styles.thumbnail, styles.iconThumbnail, community && styles.communityIconThumbnail]}>
              {icon === 'referral' ? (
                <ReferralIcon size={20} color={colors.surface} />
              ) : icon === 'blog' ? (
                <BlogIcon size={20} color={colors.surface} />
              ) : (
                <Ionicons name={icon} size={20} color={colors.surface} />
              )}
            </View>
          )
        ) : (
          <Photo
            source={image}
            style={styles.thumbnail}
            variant={personPlaceholder ? 'person' : undefined}
            iconSize={20}
          />
        )}
        {community && icon !== 'community-logo' ? (
          <View style={styles.communityBadge}>
            <Image source={require('../assets/logo-mark.png')} style={styles.communityBadgeMark} resizeMode="contain" />
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          // A specific detail about the item itself (e.g. a referral's
          // specialty) is more useful at a glance than who contributed it —
          // takes priority over the community contributor row when both
          // are available.
          <Text style={styles.subtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : community && contributedBy ? (
          <View style={styles.contributorRow}>
            {contributorPhoto ? (
              <Image source={{ uri: contributorPhoto }} style={styles.contributorAvatar} />
            ) : (
              <Ionicons name="person-circle-outline" size={12} color={colors.textMuted} />
            )}
            <Text style={styles.contributorText} numberOfLines={1}>
              {contributedBy}
            </Text>
          </View>
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
      {onDelete ? (
        <Pressable hitSlop={8} onPress={onDelete} style={styles.deleteButton}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
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
  thumbnailWrap: {
    position: 'relative',
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
  communityIconThumbnail: {
    // Community-contributed items get a blue thumbnail instead of black,
    // matching SquareCard's same treatment.
    backgroundColor: colors.community,
  },
  communityLogoThumbnail: {
    // White rather than the blue communityIconThumbnail treatment — the
    // mark itself already carries plenty of color, so a white backing
    // reads cleaner than tinting behind it. Row background is also white
    // (colors.surface), so a border keeps the thumbnail from disappearing.
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  communityLogoImage: {
    width: '100%',
    height: '100%',
  },
  heart: {
    padding: 2,
  },
  deleteButton: {
    padding: 2,
  },
  body: {
    flex: 1,
  },
  communityBadge: {
    // The haven mark itself, small and white-backed, overlapping the
    // thumbnail's corner — same treatment as SquareCard, standing in for
    // the old "Contributed" pill so both components read identically.
    position: 'absolute',
    top: -4,
    left: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  communityBadgeMark: {
    width: 11,
    height: 11,
  },
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  contributorAvatar: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accentMuted,
  },
  contributorText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
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
