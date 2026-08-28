import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Chip } from '../../components/Chip';
import { AvailabilityConflict, findAvailabilityConflicts, WEEKDAY_LABELS, WEEKEND_LABELS } from '../../lib/availabilityWindows';
import { auth } from '../../lib/firebase';
import { requestGoogleCalendarAuthCode } from '../../lib/googleIdentity';
import {
  connectSitterGoogleCalendarBackend,
  fetchMySitterProfile,
  fetchSitterGoogleFreeBusy,
  saveMySitterProfile,
  SitterProfile,
} from '../../lib/sitters';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

const DAYS_AHEAD = 21;

function formatConflict(conflict: AvailabilityConflict): string {
  const dateLabel = conflict.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${dateLabel} · ${conflict.window.label}`;
}

export default function SitterAvailability() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SitterProfile | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, true>>({});
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<AvailabilityConflict[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMySitterProfile().then((result) => {
      if (cancelled || !result) return;
      setProfile(result);
      setSelected(result.availability);
      setOverrides(result.availabilityConflictOverrides);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Runs once availability is known to be connected — either from the
  // loaded profile, or right after a fresh Connect below.
  useEffect(() => {
    if (profile?.googleCalendarConnected && selected.length > 0) {
      checkForConflicts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.googleCalendarConnected]);

  const toggle = (option: string) => {
    setSelected((prev) => (prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]));
    setConflicts(null);
  };

  const saveAvailability = async () => {
    setSaveError(null);
    setSavingAvailability(true);
    try {
      await saveMySitterProfile({ availability: selected }, false);
      setProfile((prev) => (prev ? { ...prev, availability: selected } : prev));
    } catch (err: any) {
      setSaveError(err?.message ?? err?.code ?? 'Couldn’t save your availability. Please try again.');
    } finally {
      setSavingAvailability(false);
    }
  };

  // wantsSync passed explicitly (not read from state) for the same reason
  // as app/onboarding/calendar.tsx's identical handler: the sync toggle's
  // onValueChange calls this before its own state update has committed, so
  // relying on the closure's current value would use the stale one.
  const handleConnectGoogle = async (wantsSync: boolean) => {
    setGoogleError(null);
    if (!auth?.currentUser) {
      setGoogleError('Your sign-in session has expired — log out and back in, then try again.');
      return;
    }
    setConnectingGoogle(true);
    try {
      // wantsSync controls calendar.freebusy (read-only, no warning) vs.
      // calendar.events (read/write — needed so a confirmed playdate can
      // be added to the sitter's own calendar, but triggers Google's
      // "unverified app" warning). Off by default, same reasoning as the
      // family flow's own toggle.
      const code = await requestGoogleCalendarAuthCode(wantsSync);
      await connectSitterGoogleCalendarBackend(code);
      await saveMySitterProfile({ googleCalendarConnected: true, googleCalendarSyncEnabled: wantsSync }, false);
      setProfile((prev) => (prev ? { ...prev, googleCalendarConnected: true, googleCalendarSyncEnabled: wantsSync } : prev));
    } catch (err: any) {
      if (err?.message?.includes('closed')) {
        setGoogleError('Google reported the popup closed early — this can be a false alarm, please try again.');
      } else {
        setGoogleError(`Couldn’t connect Google Calendar (${err?.message ?? err?.code ?? 'unknown error'}).`);
      }
    } finally {
      setConnectingGoogle(false);
    }
  };

  // Turning sync off needs no new Google permission — it just stops the
  // backend from attempting writes — so it saves immediately. Turning it
  // on needs the broader scope, which only a real consent grant can
  // provide, so it runs the full Connect flow forced to write access; the
  // toggle only actually reflects the change once that succeeds (handled
  // inside handleConnectGoogle above).
  const handleToggleSync = (value: boolean) => {
    if (!value) {
      saveMySitterProfile({ googleCalendarSyncEnabled: false }, false).catch(() => {});
      setProfile((prev) => (prev ? { ...prev, googleCalendarSyncEnabled: false } : prev));
      return;
    }
    handleConnectGoogle(true);
  };

  const checkForConflicts = async () => {
    setConflictsError(null);
    setCheckingConflicts(true);
    try {
      const now = new Date();
      const rangeEnd = new Date(now.getTime() + (DAYS_AHEAD + 1) * 24 * 60 * 60 * 1000);
      const busy = await fetchSitterGoogleFreeBusy(now.toISOString(), rangeEnd.toISOString());
      setConflicts(findAvailabilityConflicts(selected, busy, DAYS_AHEAD));
    } catch (err: any) {
      setConflictsError(err?.message ?? err?.code ?? 'Couldn’t check your calendar right now.');
    } finally {
      setCheckingConflicts(false);
    }
  };

  const confirmOverride = async (key: string) => {
    const next = { ...overrides, [key]: true as const };
    setOverrides(next);
    try {
      await saveMySitterProfile({ availabilityConflictOverrides: next }, false);
    } catch {
      setOverrides(overrides);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const unconfirmedConflicts = conflicts?.filter((c) => !overrides[c.key]) ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My availability</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Mark when you're generally free — this is what families see when they're looking for a match.
        </Text>

        <Text style={styles.label}>WEEKDAYS</Text>
        <View style={styles.chips}>
          {WEEKDAY_LABELS.map((option) => (
            <Chip key={option} label={option} selected={selected.includes(option)} onPress={() => toggle(option)} />
          ))}
        </View>

        <Text style={styles.label}>WEEKENDS</Text>
        <View style={styles.chips}>
          {WEEKEND_LABELS.map((option) => (
            <Chip key={option} label={option} selected={selected.includes(option)} onPress={() => toggle(option)} />
          ))}
        </View>

        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <Pressable style={[styles.saveButton, savingAvailability && styles.saveButtonDisabled]} onPress={saveAvailability} disabled={savingAvailability}>
          {savingAvailability ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save availability</Text>
          )}
        </Pressable>

        <View style={styles.calendarCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.calendarName}>Google Calendar</Text>
            {connectingGoogle ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <View style={styles.calendarActions}>
                {profile?.googleCalendarConnected && (
                  <View style={styles.connectedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.positive} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                )}
                <Pressable style={styles.connectBadge} onPress={() => handleConnectGoogle(profile?.googleCalendarSyncEnabled ?? false)}>
                  <Image source={images.googleLogo} style={styles.brandIcon} />
                  <Text style={styles.connect}>{profile?.googleCalendarConnected ? 'Reconnect' : 'Connect'}</Text>
                </Pressable>
              </View>
            )}
          </View>
          <Text style={styles.calendarHint}>
            Optional — connect it so we can flag when your calendar conflicts with what you marked above. We only
            ever see Free/Busy, never event details.
          </Text>
          {googleError ? <Text style={styles.error}>{googleError}</Text> : null}

          {profile?.googleCalendarConnected ? (
            <View style={styles.syncRow}>
              <View style={styles.syncTextWrap}>
                <Text style={styles.syncLabel}>Add confirmed playdates to this calendar</Text>
                <Text style={styles.syncHint}>
                  {profile.googleCalendarSyncEnabled
                    ? 'On — a confirmed playdate gets added automatically.'
                    : 'Off — needs an extra Google permission; you may see an "unverified app" warning on connect, choose Advanced → Go to Haven.ly (unsafe) to continue.'}
                </Text>
              </View>
              <Switch value={profile.googleCalendarSyncEnabled} onValueChange={handleToggleSync} disabled={connectingGoogle} />
            </View>
          ) : null}
        </View>

        {profile?.googleCalendarConnected ? (
          <View style={styles.conflictsSection}>
            <View style={styles.conflictsHeader}>
              <Text style={styles.label}>CALENDAR CONFLICTS</Text>
              <Pressable onPress={checkForConflicts} disabled={checkingConflicts} hitSlop={8}>
                {checkingConflicts ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Text style={styles.recheckText}>Recheck</Text>
                )}
              </Pressable>
            </View>
            {conflictsError ? <Text style={styles.error}>{conflictsError}</Text> : null}
            {conflicts !== null && unconfirmedConflicts.length === 0 ? (
              <Text style={styles.noConflicts}>No conflicts — your calendar is clear for everything you marked.</Text>
            ) : null}
            {unconfirmedConflicts.map((conflict) => (
              <View key={conflict.key} style={styles.conflictRow}>
                <View style={styles.conflictTextWrap}>
                  <Text style={styles.conflictLabel}>{formatConflict(conflict)}</Text>
                  <Text style={styles.conflictHint}>Your calendar shows you busy during this window.</Text>
                </View>
                <Pressable style={styles.confirmButton} onPress={() => confirmOverride(conflict.key)}>
                  <Text style={styles.confirmButtonText}>Confirm anyway</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
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
    paddingBottom: 40,
  },
  intro: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  calendarCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  calendarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandIcon: {
    width: 16,
    height: 16,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.positive,
  },
  connect: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  calendarHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 10,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  syncTextWrap: {
    flex: 1,
  },
  syncLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  syncHint: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
  conflictsSection: {
    marginTop: 8,
  },
  conflictsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recheckText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  noConflicts: {
    fontSize: 13,
    color: colors.positive,
  },
  conflictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.warningMuted,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  conflictTextWrap: {
    flex: 1,
  },
  conflictLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  conflictHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  confirmButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confirmButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.warning,
  },
});
