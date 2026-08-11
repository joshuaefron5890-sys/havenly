import { router } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WizardHeader } from '../../components/WizardHeader';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { auth, db } from '../../lib/firebase';
import { colors } from '../../theme/colors';

const CALENDARS = ['Google Calendar', 'Apple Calendar', 'Outlook Calendar'];

export default function Calendar() {
  const { profile } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    setError(null);
    const uid = auth?.currentUser?.uid;
    if (!uid || !db) {
      setError('You need to be signed in to save your profile.');
      return;
    }

    setSubmitting(true);
    try {
      await setDoc(
        doc(db, 'users', uid),
        { ...profile, onboardingComplete: true, createdAt: serverTimestamp() },
        { merge: true }
      );
      router.replace('/onboarding/matches');
    } catch {
      setError('Couldn’t save your profile — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <WizardHeader step={9} title="Connect your" accent="calendar." backTo="/onboarding/availability" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Let us do the scheduling work.</Text>
          <Text style={styles.noteBody}>
            We match your free time with other families'. Other parents only ever see "free" or "busy" — never
            what's actually on your calendar.
          </Text>
        </View>

        {CALENDARS.map((name) => (
          <View key={name} style={styles.calendarRow}>
            <Text style={styles.calendarName}>{name}</Text>
            <Text style={styles.connect}>Connect →</Text>
          </View>
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={finish} disabled={submitting}>
          {submitting ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.ctaText}>Find My Matches</Text>}
        </Pressable>
        <Pressable onPress={finish} disabled={submitting}>
          <Text style={styles.skip}>Skip for now</Text>
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
  content: {
    padding: 20,
    paddingTop: 0,
  },
  note: {
    backgroundColor: colors.accentMuted,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  noteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  noteBody: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  calendarName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  connect: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 10,
  },
  footer: {
    padding: 20,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  skip: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 14,
  },
});
