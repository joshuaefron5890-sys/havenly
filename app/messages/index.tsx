import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { goBack } from '../../lib/navigation';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { useAuth } from '../../contexts/AuthContext';
import { CommunityMessage, subscribeToCommunityMessages } from '../../lib/communityMessages';
import { familyDisplayName, familyPhoto, fetchFamiliesByUids, SuggestedFamily } from '../../lib/families';
import { Conversation, otherParticipant, subscribeToConversations } from '../../lib/messages';
import { colors } from '../../theme/colors';

export default function MessagesInbox() {
  const { user, familyUid } = useAuth();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [families, setFamilies] = useState<Map<string, SuggestedFamily>>(new Map());
  const [communityMessages, setCommunityMessages] = useState<CommunityMessage[]>([]);

  useEffect(() => {
    if (!user) return;
    return subscribeToCommunityMessages(setCommunityMessages);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToConversations(setConversations);
    return unsubscribe;
  }, [user]);

  // The conversation doc only holds uids — resolve the other side's
  // name/photo the same safe way Discover does, through the Cloud
  // Function that hand-picks which fields of another user's doc are
  // public (see functions/index.js's toPublicFamily comment).
  useEffect(() => {
    if (!user || !familyUid || !conversations) return;
    const otherUids = conversations
      .map((c) => otherParticipant(c, familyUid))
      .filter((uid): uid is string => typeof uid === 'string')
      .filter((uid) => !families.has(uid));
    if (!otherUids.length) return;
    let cancelled = false;
    fetchFamiliesByUids(otherUids).then((result) => {
      if (cancelled) return;
      setFamilies((prev) => {
        const next = new Map(prev);
        for (const family of result) next.set(family.uid, family);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, familyUid, conversations]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ListRow
          title="Community"
          subtitle={communityMessages.at(-1)?.text || 'Announcements from Opened Circle'}
          icon="community-logo"
          onPress={() => router.push('/messages/community')}
        />
        {conversations === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : conversations.length === 0 ? (
          <EmptyState text="No conversations yet — message a family from their profile to start one." />
        ) : (
          conversations.map((conversation) => {
            const otherUid = familyUid ? otherParticipant(conversation, familyUid) : undefined;
            const family = otherUid ? families.get(otherUid) : undefined;
            const photoUrl = family ? familyPhoto(family) : null;
            return (
              <ListRow
                key={conversation.id}
                title={family ? familyDisplayName(family) : 'Family'}
                subtitle={conversation.lastMessage || 'Say hello'}
                image={photoUrl ? { uri: photoUrl } : undefined}
                personPlaceholder
                onPress={() => router.push(`/messages/${conversation.id}`)}
              />
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
    paddingTop: 8,
  },
});
