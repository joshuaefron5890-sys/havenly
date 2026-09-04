import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { goBack } from '../lib/navigation';
import { useIsDesktop } from '../lib/responsive';
import { colors } from '../theme/colors';

const DEFAULT_TOTAL_STEPS = 11;

export function WizardHeader({
  step,
  totalSteps = DEFAULT_TOTAL_STEPS,
  title,
  accent,
  backTo,
  onBack,
  editMode,
  hideTitle,
}: {
  step: number;
  // Defaults to the family onboarding wizard's own step count — pass this
  // explicitly for any other wizard (e.g. the 3-step sitter signup).
  totalSteps?: number;
  title: string;
  accent: string;
  // Explicit previous-step route. Falls back to goBack() when omitted, but
  // that's unreliable after resuming onboarding mid-wizard (which lands on
  // a step via router.replace, so there's no real "back" in history to pop
  // to) — every step past the first should pass this.
  backTo?: string;
  // Takes priority over backTo — for a screen that cycles through several
  // sub-steps itself (e.g. one per child), so "back" should step within the
  // screen instead of always leaving it.
  onBack?: () => void;
  // Reached from Profile's "Edit" links rather than the wizard itself —
  // the step progress bar/count is meaningless there, so hide it.
  editMode?: boolean;
  // Lets a caller drop the "About X." title too, for an edit-mode screen
  // where that framing is redundant (e.g. Profile already made clear
  // which sibling is being edited before navigating here). Defaults to
  // shown, so every other caller is unaffected.
  hideTitle?: boolean;
}) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      router.replace(backTo as any);
    } else {
      goBack();
    }
  };

  // No step progress bar/count on desktop — app/onboarding/_layout.tsx's
  // full-bleed photo card treatment has no room for it, and it wasn't
  // asked for there.
  const isDesktop = useIsDesktop();
  const showProgress = !editMode && !isDesktop;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable style={styles.back} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        {showProgress ? (
          <>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${(step / totalSteps) * 100}%` }]} />
            </View>
            <Text style={styles.stepCount}>
              {step}/{totalSteps}
            </Text>
          </>
        ) : null}
      </View>

      {showProgress ? <Text style={styles.eyebrow}>STEP {step} OF {totalSteps}</Text> : null}
      {hideTitle ? null : (
        <Text style={styles.title}>
          {title} <Text style={styles.accent}>{accent}</Text>
        </Text>
      )}
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
    letterSpacing: 1.5,
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
