import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../../lib/firebase';
import { requestGoogleCalendarAuthCode } from '../../lib/googleIdentity';
import {
  AVAILABILITY_PERIODS,
  AvailabilityPeriod,
  DayAvailability,
  dateKey,
  findSitterAvailabilityConflicts,
  freeUpcomingPeriods,
  SitterAvailabilityConflict,
  upcomingDays,
} from '../../lib/sitterAvailability';
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

function formatDayLabel(date: Date, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatConflict(conflict: SitterAvailabilityConflict): string {
  const dateLabel = conflict.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${dateLabel} · ${conflict.periodLabel}`;
}

// Adds `additions` into `base` without ever overwriting a day the sitter
// has already made a decision about — used both by the calendar "Prefill"
// action (only fill in periods they haven't touched) and, more narrowly,
// nowhere else, but kept general since both call sites want the same
// "never clobber an explicit choice" guarantee.
function mergeAdditive(base: DayAvailability, additions: DayAvailability): DayAvailability {
  const next: DayAvailability = { ...base };
  for (const [key, periods] of Object.entries(additions)) {
    const existing = next[key] ?? [];
    const merged = [...existing];
    for (const p of periods) {
      if (!merged.includes(p)) merged.push(p);
    }
    next[key] = merged;
  }
  return next;
}

export default function SitterAvailability() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SitterProfile | null>(null);
  const [selected, setSelected] = useState<DayAvailability>({});
  const [overrides, setOverrides] = useState<Record<string, true>>({});
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SitterAvailabilityConflict[] | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);

  const days = useMemo(() => upcomingDays(DAYS_AHEAD), []);

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
    if (profile?.googleCalendarConnected) {
      checkForConflicts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.googleCalendarConnected]);

  const togglePeriod = (key: string, period: AvailabilityPeriod) => {
    setSelected((prev) => {
      const existing = prev[key] ?? [];
      const next = existing.includes(period) ? existing.filter((p) => p !== period) : [...existing, period];
      const copy = { ...prev };
      if (next.length) copy[key] = next;
      else delete copy[key];
      return copy;
    });
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
      setConflicts(findSitterAvailabilityConflicts(selected, busy, DAYS_AHEAD));
    } catch (err: any) {
      setConflictsError(err?.message ?? err?.code ?? 'Couldn’t check your calendar right now.');
    } finally {
      setCheckingConflicts(false);
    }
  };

  // Pulls real free/busy from the connected calendar and pre-checks any
  // period that's entirely free and not already decided one way or the
  // other — a quick starting point the sitter can then hand-adjust, rather
  // than ticking all ~63 boxes themselves. Never unchecks or overwrites a
  // period they've already touched (mergeAdditive), and never suggests one
  // the calendar shows busy — those surface as conflicts instead, only for
  // periods the sitter has actually marked.
  const handlePrefill = async () => {
    setPrefillError(null);
    setPrefilling(true);
    try {
      const now = new Date();
      const rangeEnd = new Date(now.getTime() + (DAYS_AHEAD + 1) * 24 * 60 * 60 * 1000);
      const busy = await fetchSitterGoogleFreeBusy(now.toISOString(), rangeEnd.toISOString());
      const free = freeUpcomingPeriods(busy, DAYS_AHEAD);
      setSelected((prev) => mergeAdditive(prev, free));
      setConflicts(null);
    } catch (err: any) {
      setPrefillError(err?.message ?? err?.code ?? 'Couldn’t read your calendar right now.');
    } finally {
      setPrefilling(false);
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

  // "Reject" a conflict — the calendar's right, remove the period entirely
  // rather than just dismissing the warning.
  const removeConflictPeriod = (conflict: SitterAvailabilityConflict) => {
    togglePeriod(conflict.dateKey, conflict.period);
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
          Mark morning, afternoon, or evening for each day you're free over the next few weeks — this is what
          families see when they're looking for a match.
        </Text>

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
            Connect it and we'll pre-fill your open periods below, then flag anywhere your calendar conflicts with
            what you mark. We only ever see Free/Busy, never event details.
          </Text>
          {googleError ? <Text style={styles.error}>{googleError}</Text> : null}

          {profile?.googleCalendarConnected ? (
            <>
              <Pressable style={styles.prefillButton} onPress={handlePrefill} disabled={prefilling}>
                {prefilling ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={16} color={colors.accent} />
                    <Text style={styles.prefillButtonText}>Prefill open periods from calendar</Text>
                  </>
                )}
              </Pressable>
              {prefillError ? <Text style={styles.error}>{prefillError}</Text> : null}

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
            </>
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
                  <Text style={styles.conflictHint}>Your calendar shows you busy during this period.</Text>
                </View>
                <View style={styles.conflictActions}>
                  <Pressable style={styles.rejectButton} onPress={() => removeConflictPeriod(conflict)}>
                    <Text style={styles.rejectButtonText}>Remove</Text>
                  </Pressable>
                  <Pressable style={styles.confirmButton} onPress={() => confirmOverride(conflict.key)}>
                    <Text style={styles.confirmButtonText}>Confirm anyway</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>NEXT {DAYS_AHEAD} DAYS</Text>
        <View style={styles.dayList}>
          {days.map((day, index) => {
            const key = dateKey(day);
            const periodsForDay = selected[key] ?? [];
            return (
              <View key={key} style={styles.dayRow}>
                <Text style={styles.dayLabel}>{formatDayLabel(day, index)}</Text>
                <View style={styles.periodChips}>
                  {AVAILABILITY_PERIODS.map((period) => {
                    const isSelected = periodsForDay.includes(period.key);
                    return (
                      <Pressable
                        key={period.key}
                        style={[styles.periodChip, isSelected && styles.periodChipSelected]}
                        onPress={() => togglePeriod(key, period.key)}
                      >
                        <Text style={[styles.periodChipText, isSelected && styles.periodChipTextSelected]}>{period.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>

        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <Pressable style={[styles.saveButton, savingAvailability && styles.saveButtonDisabled]} onPress={saveAvailability} disabled={savingAvailability}>
          {savingAvailability ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save availability</Text>
          )}
        </Pressable>
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
    marginTop: 20,
  },
  error: {
    fontSize: 13,
    color: colors.error,
    marginTop: 10,
  },
  dayList: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    width: 92,
  },
  periodChips: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  periodChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  periodChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  periodChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  periodChipTextSelected: {
    color: colors.surface,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
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
  prefillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingVertical: 12,
    marginTop: 14,
  },
  prefillButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
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
  conflictActions: {
    gap: 6,
  },
  rejectButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rejectButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
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
