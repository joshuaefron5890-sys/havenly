import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { useAuth } from '../contexts/AuthContext';
import { useMessagesBadge } from '../contexts/MessagesContext';
import { clusterName } from '../lib/clusters';
import { colors } from '../theme/colors';
import { SettingsMenu } from './SettingsMenu';

export function ScreenHeader({ eyebrow, title }: { eyebrow?: string; title?: string }) {
  const { hasUnread } = useMessagesBadge();
  const { clusterId } = useAuth();
  return (
    <View style={styles.row}>
      <View>
        {eyebrow ? (
          <View style={styles.eyebrowRow}>
            <Image source={require('../assets/logo-mark.png')} style={styles.mark} resizeMode="contain" />
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <View style={styles.clusterBadge}>
              <Ionicons name="location-sharp" size={9} color={colors.accent} />
              <Text style={styles.clusterBadgeText}>{clusterName(clusterId)}</Text>
            </View>
          </View>
        ) : null}
        {title ? <Text style={styles.title}>{title}</Text> : null}
      </View>
      <View style={styles.icons}>
        <Pressable onPress={() => router.push('/messages')} hitSlop={8} style={styles.messageIcon}>
          <Ionicons name="chatbubble-outline" size={22} color={colors.text} />
          {hasUnread ? <View style={styles.badge} /> : null}
        </Pressable>
        <SettingsMenu />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mark: {
    width: 16,
    height: 16,
  },
  eyebrow: {
    fontSize: 13,
    color: colors.textMuted,
  },
  clusterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 2,
  },
  clusterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  messageIcon: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
