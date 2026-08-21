import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FieldInput } from '../components/FieldInput';
import { FAMILY_RELATIONSHIPS, FamilyRelationship, sendFamilyInvite } from '../lib/familyMembers';
import { colors } from '../theme/colors';

function friendlyError(err: any): string {
  if (err?.code === 'functions/invalid-argument') {
    return err?.message ?? 'Check the fields above and try again.';
  }
  return 'Something went wrong sending that invite — please try again.';
}

export default function InviteFamilyMember() {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<FamilyRelationship | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Add their name to continue.');
      return;
    }
    if (!relationship) {
      setError('Choose their relationship to your family.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Add a valid email to send the invite to.');
      return;
    }
    setSubmitting(true);
    try {
      await sendFamilyInvite(name.trim(), relationship, email.trim());
      setSent(true);
    } catch (err: any) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <Ionicons name="mail" size={40} color={colors.accent} style={styles.sentIcon} />
        <Text style={styles.sentTitle}>Invite sent!</Text>
        <Text style={styles.sentSubtitle}>
          {name} will get an email with a link to join your family on Haven.ly — once they accept, they'll see
          everything you see.
        </Text>
        <Pressable style={styles.cta} onPress={() => router.back()}>
          <Text style={styles.ctaText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Invite a family member</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Invite a co-parent, relative, or close friend to log in and see everything your family sees — matches,
          messages, playdates, and your child's profile.
        </Text>

        <FieldInput label="Their name" placeholder="Jamie" value={name} onChangeText={setName} />

        <Text style={styles.label}>RELATIONSHIP</Text>
        {FAMILY_RELATIONSHIPS.map((option) => (
          <Pressable key={option} style={styles.radioRow} onPress={() => setRelationship(option)}>
            <View style={[styles.radio, relationship === option && styles.radioSelected]} />
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        ))}

        <FieldInput
          label="Their email"
          placeholder="jamie@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={styles.hint}>
          This is just where we send the invite — they can sign up with any email (or Gmail) they'd like.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleSend} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.ctaText}>Send invite</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
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
    paddingTop: 12,
  },
  intro: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 4,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -12,
    marginBottom: 8,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 8,
  },
  footer: {
    padding: 20,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    // The "sent" confirmation screen renders this inside `centered`, whose
    // alignItems: 'center' makes a Pressable shrink-wrap its content by
    // default instead of filling the row — collapsing this into a circle
    // around "Done" (borderRadius: 999 on an unconstrained near-square).
    // alignSelf: 'stretch' forces full width regardless of which container
    // it's rendered in, matching how it already looked from `footer` (no
    // alignItems override there, so children stretch by default anyway).
    alignSelf: 'stretch',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  sentIcon: {
    marginBottom: 16,
  },
  sentTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  sentSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
});
