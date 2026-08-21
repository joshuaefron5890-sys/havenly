import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { CommunityMessage, postCommunityMessage, subscribeToCommunityMessages } from '../../lib/communityMessages';
import { isSuperAdminEmail } from '../../lib/superAdmin';
import { colors } from '../../theme/colors';

export default function CommunityThread() {
  const { user, clusterId } = useAuth();
  const isSuperAdmin = isSuperAdminEmail(user?.email, clusterId);
  const [messages, setMessages] = useState<CommunityMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    return subscribeToCommunityMessages(setMessages);
  }, []);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    const text = draft;
    setDraft('');
    try {
      await postCommunityMessage(text, user?.displayName || 'Haven.ly');
    } catch (err: any) {
      showAlert('Couldn’t send that announcement', err?.message ?? err?.code ?? 'Please try again.');
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
        <Text style={styles.headerTitle}>Community</Text>
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
            <Text style={styles.empty}>No announcements yet.</Text>
          ) : (
            messages.map((message) => (
              <View key={message.id} style={styles.bubbleRow}>
                <View style={styles.bubble}>
                  <Text style={styles.bubbleAuthor}>{message.postedByName}</Text>
                  <Text style={styles.bubbleText}>{message.text}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {isSuperAdmin ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Write an announcement to everyone"
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
        ) : null}
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
    gap: 10,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  bubbleRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleAuthor: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.community,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bubbleText: {
    fontSize: 15,
    color: colors.text,
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
