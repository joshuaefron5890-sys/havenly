import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';

// Order matters — mirrors the actual route order in app/onboarding/, one
// entry per step file. WizardHeader's own TOTAL_STEPS (10) is the same
// count; keep both in sync if a step is ever added or removed.
export const ONBOARDING_STEPS: { path: string; label: string }[] = [
  { path: 'account', label: 'Account' },
  { path: 'family', label: 'Family' },
  { path: 'child', label: 'Child' },
  { path: 'siblings', label: 'Siblings' },
  { path: 'play-style', label: 'Play style' },
  { path: 'interests', label: 'Interests' },
  { path: 'goals', label: 'Goals' },
  { path: 'about-you', label: 'About you' },
  { path: 'availability', label: 'Availability' },
  { path: 'calendar', label: 'Calendar' },
];

// Desktop-only companion to WizardHeader's mobile progress bar — shows the
// whole 10-step journey at once instead of just "3/10", since desktop has
// the width to spare. Not interactive (steps aren't clickable): skipping
// ahead would bypass each step's own validation, and the wizard has no
// concept of "jump to step 6" today.
export function WizardStepsRail({ currentPath }: { currentPath: string }) {
  const lastSegment = currentPath.split('/').filter(Boolean).pop();
  const currentIndex = ONBOARDING_STEPS.findIndex((s) => s.path === lastSegment);

  return (
    <View style={styles.rail}>
      <View style={styles.brandRow}>
        <Image source={require('../assets/logo-mark.png')} style={styles.brandMark} resizeMode="contain" />
        <Text style={styles.wordmark}>
          Opened <Text style={styles.wordmarkAccent}>Circle</Text>
        </Text>
      </View>
      {ONBOARDING_STEPS.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isDone = currentIndex >= 0 && i < currentIndex;
        return (
          <View key={step.path} style={styles.stepRow}>
            <View style={[styles.stepNum, isCurrent && styles.stepNumCurrent, isDone && styles.stepNumDone]}>
              {isDone ? (
                <Ionicons name="checkmark" size={11} color={colors.surface} />
              ) : (
                <Text style={[styles.stepNumText, isCurrent && styles.stepNumTextCurrent]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]}>{step.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 240,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 22,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    marginBottom: 22,
  },
  brandMark: {
    width: 20,
    height: 20,
  },
  wordmark: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  wordmarkAccent: {
    color: colors.accent,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumCurrent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  stepNumDone: {
    backgroundColor: colors.positive,
    borderColor: colors.positive,
  },
  stepNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepNumTextCurrent: {
    color: colors.surface,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  stepLabelCurrent: {
    color: colors.text,
  },
});
