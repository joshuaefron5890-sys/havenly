import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { FieldInput } from '../../components/FieldInput';
import { WizardHeader } from '../../components/WizardHeader';
import { ZipCodeField } from '../../components/ZipCodeField';
import { emptySitterProfile, fetchMySitterProfile, saveMySitterProfile, SitterChargeModel, SitterProfile } from '../../lib/sitters';
import { colors } from '../../theme/colors';

function friendlyError(err: any, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const CHARGE_MODEL_OPTIONS: { value: SitterChargeModel; label: string }[] = [
  { value: 'per-child', label: 'Hourly, per child' },
  { value: 'flat', label: 'Flat rate per hour' },
];

// Step 3 of 3 — about you, hourly rate, and ZIP code. The final step:
// completing it flips signupComplete to true and sends them into the app.
export default function SitterSignupAbout() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SitterProfile>(emptySitterProfile);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMySitterProfile().then((result) => {
      if (cancelled) return;
      if (result) setProfile(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (fields: Partial<SitterProfile>) => setProfile((prev) => ({ ...prev, ...fields }));

  const handleSubmit = async () => {
    setError(null);
    if (!profile.bio.trim()) {
      setError('Tell families a bit about yourself to continue.');
      return;
    }
    if (!profile.chargeModel) {
      setError('Choose how you want to charge to continue.');
      return;
    }
    if (!profile.hourlyRate.trim()) {
      setError('Add your rate to continue.');
      return;
    }
    if (!profile.zipCode || !profile.city) {
      setError('Add your zip code to continue — it’s how families near you can find you.');
      return;
    }

    setSubmitting(true);
    try {
      await saveMySitterProfile(
        {
          bio: profile.bio.trim(),
          chargeModel: profile.chargeModel,
          hourlyRate: profile.hourlyRate.trim(),
          zipCode: profile.zipCode,
          city: profile.city,
          state: profile.state,
          signupStep: null,
          signupComplete: true,
        },
        false
      );
      router.replace('/(sitter)');
    } catch (err: any) {
      setError(friendlyError(err, 'Something went wrong submitting your profile. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <WizardHeader step={3} totalSteps={3} title="About" accent="you." backTo="/provider-signup/experience" />
      <ScrollView contentContainerStyle={styles.content}>
        <FieldInput
          label="About you"
          placeholder="Your experience, what you love about sitting…"
          multiline
          value={profile.bio}
          onChangeText={(bio) => patch({ bio })}
        />
        <Text style={styles.label}>HOW DO YOU WANT TO CHARGE?</Text>
        {CHARGE_MODEL_OPTIONS.map((option) => {
          const isSelected = profile.chargeModel === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.option, isSelected && styles.optionSelected]}
              onPress={() => patch({ chargeModel: option.value })}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
        {profile.chargeModel ? (
          <FieldInput
            label="Rate"
            placeholder={profile.chargeModel === 'per-child' ? '$8/hr per child' : '$20/hr'}
            value={profile.hourlyRate}
            onChangeText={(hourlyRate) => patch({ hourlyRate })}
          />
        ) : null}
        <ZipCodeField
          zip={profile.zipCode}
          city={profile.city}
          state={profile.state}
          onChange={(next) => patch({ zipCode: next.zip, city: next.city, state: next.state })}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.cta, submitting && styles.ctaDisabled]} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.ctaText}>{submitting ? 'Submitting…' : 'Submit for review'}</Text>
        </Pressable>
      </View>
    </View>
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
  },
  content: {
    padding: 20,
    paddingTop: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 4,
  },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  optionTextSelected: {
    color: colors.accent,
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
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
