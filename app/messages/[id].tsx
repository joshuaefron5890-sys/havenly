import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { familyDisplayName, fetchFamiliesByUids, SuggestedFamily } from '../../lib/families';
import { markConversationRead, Message, sendMessage, subscribeToMessages } from '../../lib/messages';
import { colors } from '../../theme/colors';

export default function MessageThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [family, setFamily] = useState<SuggestedFamily | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // The conversation id is a deterministic sorted "uidA_uidB" pair (see
  // lib/messages.ts) — the other participant can be read straight out of
  // it without a separate lookup.
  const otherUid = id && user ? id.split('_').find((uid) => uid !== user.uid) : undefined;

  useEffect(() => {
    if (!id) return;
    const unsubscribe = subscribeToMessages(id, setMessages);
    return unsubscribe;
  }, [id]);

  // Marks read on open, and again whenever the message list changes while
  // this screen is already the one on screen — a message that arrives
  // mid-conversation gets marked read too, not just whatever was there on
  // first mount.
  useEffect(() => {
    if (!id || !messages) return;
    markConversationRead(id);
  }, [id, messages]);

  useEffect(() => {
    if (!otherUid) return;
    let cancelled = false;
    fetchFamiliesByUids([otherUid]).then((result) => {
      if (!cancelled && result[0]) setFamily(result[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  const handleSend = async () => {
    if (!id || !draft.trim() || sending) return;
    setSending(true);
    const text = draft;
    setDraft('');
    try {
      await sendMessage(id, text);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{family ? familyDisplayName(family) : 'Message'}</Text>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages === null ? (
            <ActivityIndicator color={colors.accent} />
          ) : messages.length === 0 ? (
            <Text style={styles.empty}>Say hello — this is the start of your conversation.</Text>
          ) : (
            messages.map((message) => {
              const mine = message.senderUid === user?.uid;
              if (message.type === 'playdate_proposal' && message.proposal) {
                return (
                  <View key={message.id} style={styles.proposalCard}>
                    <View style={styles.proposalHeader}>
                      <Ionicons name="calendar" size={16} color={colors.accent} />
                      <Text style={styles.proposalHeaderText}>
                        {mine ? 'You proposed a playdate' : 'Playdate proposed'}
                      </Text>
                    </View>
                    <Text style={styles.proposalDate}>{message.proposal.dateLabel}</Text>
                    <Text style={styles.proposalVenue}>{message.proposal.venue}</Text>
                    {message.text ? <Text style={styles.proposalNote}>{message.text}</Text> : null}
                  </View>
                );
              }
              return (
                <View key={message.id} style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.text}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
          >
            <Ionicons name="arrow-up" size={18} color={colors.surface} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
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
    gap: 8,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    color: colors.text,
  },
  bubbleTextMine: {
    color: colors.surface,
  },
  proposalCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.accentMuted,
    borderRadius: 16,
    padding: 14,
    gap: 2,
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  proposalHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  proposalDate: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  proposalVenue: {
    fontSize: 13,
    color: colors.textMuted,
  },
  proposalNote: {
    fontSize: 14,
    color: colors.text,
    marginTop: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
