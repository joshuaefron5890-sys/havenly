import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

const TOTAL_STEPS = 10;

export function WizardHeader({
  step,
  title,
  accent,
  backTo,
  onBack,
}: {
  step: number;
  title: string;
  accent: string;
  // Explicit previous-step route. Falls back to router.back() when omitted,
  // but that's unreliable after resuming onboarding mid-wizard (which lands
  // on a step via router.replace, so there's no real "back" in history to
  // pop to) — every step past the first should pass this.
  backTo?: string;
  // Takes priority over backTo — for a screen that cycles through several
  // sub-steps itself (e.g. one per child), so "back" should step within the
  // screen instead of always leaving it.
  onBack?: () => void;
}) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      router.replace(backTo as any);
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable style={styles.back} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
        </View>
        <Text style={styles.stepCount}>
          {step}/{TOTAL_STEPS}
        </Text>
      </View>

      <Text style={styles.eyebrow}>STEP {step} OF {TOTAL_STEPS}</Text>
      <Text style={styles.title}>
        {title} <Text style={styles.accent}>{accent}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
  },
  fill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  stepCount: {
    fontSize: 13,
    color: colors.textMuted,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  accent: {
    fontStyle: 'italic',
    color: colors.accent,
  },
});
