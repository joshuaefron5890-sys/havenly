import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showConfirm } from '../../lib/alert';
import { auth } from '../../lib/firebase';
import { requestGoogleCalendarAuthCode } from '../../lib/googleIdentity';
import {
  AVAILABILITY_PERIODS,
  AvailabilityPeriod,
  DayAvailability,
  dateKey,
  findSitterAvailabilityConflicts,
  freeUpcomingPeriods,
  periodConflictKey,
  SitterAvailabilityConflict,
  upcomingDays,
} from '../../lib/sitterAvailability';
import {
  connectSitterGoogleCalendarBackend,
  disconnectSitterGoogleCalendarBackend,
  fetchMySitterProfile,
  fetchSitterGoogleFreeBusy,
  saveMySitterProfile,
  SitterProfile,
} from '../../lib/sitters';
import { colors } from '../../theme/colors';
import { images } from '../../theme/images';

// Starting window, and how many more days to add each time the sitter
// scrolls near the bottom — capped at MAX_DAYS_AHEAD (~6 months) so the
// list can't grow unbounded and so a Google freeBusy query never has to
// cover an absurd range.
const PAGE_SIZE = 21;
const MAX_DAYS_AHEAD = 180;

function formatDayLabel(date: Date, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatConflict(conflict: SitterAvailabilityConflict): string {
  const dateLabel = conflict.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${dateLabel} · ${conflict.periodLabel}`;
}

// Adds `additions` into `base`, skipping any (date, period) the sitter has
// ever hand-toggled (`manualOverrides`, keyed by periodConflictKey) — a
// manual choice always wins over what the calendar says, whether that
// choice was to turn a period on (harmless to skip, it's already there) or
// off (the whole point: without this, re-running the automatic sync would
// silently re-check anything the calendar shows as free, even a period the
// sitter deliberately unmarked). Safe to re-run every time more days load
// or the calendar is rechecked.
function mergeAdditive(base: DayAvailability, additions: DayAvailability, manualOverrides: Record<string, true>): DayAvailability {
  const next: DayAvailability = { ...base };
  for (const [key, periods] of Object.entries(additions)) {
    const existing = next[key] ?? [];
    const merged = [...existing];
    for (const p of periods) {
      if (!merged.includes(p) && !manualOverrides[periodConflictKey(key, p)]) merged.push(p);
    }
    if (merged.length) next[key] = merged;
  }
  return next;
}

export default function SitterAvailability() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SitterProfile | null>(null);
  const [selected, setSelected] = useState<DayAvailability>({});
  const [overrides, setOverrides] = useState<Record<string, true>>({});
  const [manualOverrides, setManualOverrides] = useState<Record<string, true>>({});
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SitterAvailabilityConflict[] | null>(null);

  const [daysAheadCount, setDaysAheadCount] = useState(PAGE_SIZE);
  const days = useMemo(() => upcomingDays(daysAheadCount), [daysAheadCount]);
  const loadMoreDays = () => {
    setDaysAheadCount((prev) => (prev >= MAX_DAYS_AHEAD ? prev : Math.min(prev + PAGE_SIZE, MAX_DAYS_AHEAD)));
  };

  useEffect(() => {
    let cancelled = false;
    fetchMySitterProfile().then((result) => {
      if (cancelled || !result) return;
      setProfile(result);
      setSelected(result.availability);
      setOverrides(result.availabilityConflictOverrides);
      setManualOverrides(result.availabilityManualOverrides);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePeriod = (key: string, period: AvailabilityPeriod) => {
    setSelected((prev) => {
      const existing = prev[key] ?? [];
      const next = existing.includes(period) ? existing.filter((p) => p !== period) : [...existing, period];
      const copy = { ...prev };
      if (next.length) copy[key] = next;
      else delete copy[key];
      return copy;
    });
    // Every hand-toggle — on or off — is remembered indefinitely so the
    // automatic calendar sync never silently reverses it later (see
    // mergeAdditive above).
    setManualOverrides((prev) => ({ ...prev, [periodConflictKey(key, period)]: true }));
    setConflicts(null);
  };

  const saveAvailability = async () => {
    setSaveError(null);
    setSavingAvailability(true);
    try {
      await saveMySitterProfile({ availability: selected, availabilityManualOverrides: manualOverrides }, false);
      setProfile((prev) => (prev ? { ...prev, availability: selected, availabilityManualOverrides: manualOverrides } : prev));
    } catch (err: any) {
      setSaveError(err?.message ?? err?.code ?? 'Couldn’t save your availability. Please try again.');
    } finally {
      setSavingAvailability(false);
    }
  };

  // This screen only ever requests the read-only calendar.freebusy scope —
  // the broader calendar.events write scope (needed to add a confirmed
  // playdate to the sitter's own calendar) is opted into separately from
  // the Playdates screen, right where that capability is actually used, so
  // reconnecting here can never silently downgrade an already-granted
  // write scope back to read-only: this always preserves whatever
  // googleCalendarSyncEnabled is currently set to rather than offering to
  // change it.
  const handleConnectGoogle = async () => {
    setGoogleError(null);
    if (!auth?.currentUser) {
      setGoogleError('Your sign-in session has expired — log out and back in, then try again.');
      return;
    }
    setConnectingGoogle(true);
    try {
      const code = await requestGoogleCalendarAuthCode(profile?.googleCalendarSyncEnabled ?? false);
      await connectSitterGoogleCalendarBackend(code);
      await saveMySitterProfile({ googleCalendarConnected: true }, false);
      setProfile((prev) => (prev ? { ...prev, googleCalendarConnected: true } : prev));
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

  // Fully undoes handleConnectGoogle — clears the stored refresh token
  // server-side (also revoked with Google, see the Cloud Function) so
  // syncCalendar/conflict-checking stop running and the sitter goes back
  // to marking availability by hand. Also turns off the separate
  // Playdates-screen "add confirmed playdates to my calendar" toggle,
  // since that reuses this same connection — leaving it on would just
  // silently fail once the token is gone.
  const handleDisconnectGoogle = async () => {
    const confirmed = await showConfirm(
      'Disconnect Google Calendar?',
      'Your availability picks stay as they are — you’ll just need to mark future days manually and won’t see calendar conflicts. You can reconnect any time.',
      'Disconnect'
    );
    if (!confirmed) return;
    setGoogleError(null);
    setConnectingGoogle(true);
    try {
      await disconnectSitterGoogleCalendarBackend();
      setProfile((prev) => (prev ? { ...prev, googleCalendarConnected: false, googleCalendarSyncEnabled: false } : prev));
      setConflicts(null);
    } catch (err: any) {
      setGoogleError(`Couldn’t disconnect (${err?.message ?? err?.code ?? 'unknown error'}).`);
    } finally {
      setConnectingGoogle(false);
    }
  };

  // Runs automatically once the calendar is connected, and again whenever
  // more days load (infinite scroll) so freshly-added days get the same
  // treatment: pre-checks every free period the sitter hasn't already
  // decided on either way (mergeAdditive never overwrites an explicit
  // choice), and flags any period they HAVE marked where the calendar
  // shows a conflict. One shared freeBusy fetch covers both, rather than
  // two separate round trips.
  const syncCalendar = async () => {
    setSyncError(null);
    setSyncing(true);
    try {
      const now = new Date();
      const rangeEnd = new Date(now.getTime() + (daysAheadCount + 1) * 24 * 60 * 60 * 1000);
      const busy = await fetchSitterGoogleFreeBusy(now.toISOString(), rangeEnd.toISOString());
      setConflicts(findSitterAvailabilityConflicts(selected, busy, daysAheadCount));
      setSelected((prev) => mergeAdditive(prev, freeUpcomingPeriods(busy, daysAheadCount), manualOverrides));
    } catch (err: any) {
      setSyncError(err?.message ?? err?.code ?? 'Couldn’t sync your calendar right now.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (profile?.googleCalendarConnected) {
      syncCalendar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.googleCalendarConnected, daysAheadCount]);

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

      <FlatList
        contentContainerStyle={styles.content}
        data={days}
        keyExtractor={(day) => dateKey(day)}
        onEndReached={loadMoreDays}
        onEndReachedThreshold={0.6}
        renderItem={({ item: day, index }) => {
          const key = dateKey(day);
          const periodsForDay = selected[key] ?? [];
          return (
            <View style={styles.dayRow}>
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
                      {isSelected ? <Ionicons name="checkmark" size={13} color={colors.surface} style={styles.periodChipIcon} /> : null}
                      <Text style={[styles.periodChipText, isSelected && styles.periodChipTextSelected]}>{period.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        }}
        ListHeaderComponent={
          <View>
            <Text style={styles.intro}>
              Mark morning, afternoon, or evening for each day you're free. We use this to match you to families
              nearby who are looking for help on a playdate — the more you mark, the more matches you'll show up in.
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
                    <Pressable style={styles.connectBadge} onPress={handleConnectGoogle}>
                      <Image source={images.googleLogo} style={styles.brandIcon} />
                      <Text style={styles.connect}>{profile?.googleCalendarConnected ? 'Reconnect' : 'Connect'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
              <Text style={styles.calendarHint}>
                Connect it and we'll automatically fill in your open periods below, then flag anywhere your
                calendar conflicts with what you mark. We only ever see Free/Busy, never event details.
              </Text>
              {googleError ? <Text style={styles.error}>{googleError}</Text> : null}

              {profile?.googleCalendarConnected ? (
                <View style={styles.syncStatusRow}>
                  {syncing ? (
                    <>
                      <ActivityIndicator color={colors.textMuted} size="small" />
                      <Text style={styles.syncStatusText}>Syncing with your calendar…</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={14} color={colors.textMuted} />
                      <Text style={styles.syncStatusText}>Auto-syncs on connect and as you scroll</Text>
                    </>
                  )}
                  <Pressable onPress={syncCalendar} disabled={syncing} hitSlop={8} style={styles.syncNowButton}>
                    <Text style={styles.syncNowText}>Sync now</Text>
                  </Pressable>
                  <Pressable onPress={handleDisconnectGoogle} hitSlop={8} style={styles.syncNowButton}>
                    <Text style={styles.disconnect}>Disconnect</Text>
                  </Pressable>
                </View>
              ) : null}
              {syncError ? <Text style={styles.error}>{syncError}</Text> : null}
            </View>

            {profile?.googleCalendarConnected && unconfirmedConflicts.length > 0 ? (
              <View style={styles.conflictsSection}>
                <Text style={styles.label}>CALENDAR CONFLICTS</Text>
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

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.legendSwatchAvailable]}>
                  <Ionicons name="checkmark" size={11} color={colors.surface} />
                </View>
                <Text style={styles.legendText}>Available</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.legendSwatchUnset]} />
                <Text style={styles.legendText}>Not marked</Text>
              </View>
            </View>
            <Text style={styles.label}>AVAILABILITY</Text>
          </View>
        }
        ListFooterComponent={
          daysAheadCount < MAX_DAYS_AHEAD ? (
            <View style={styles.loadMoreRow}>
              <ActivityIndicator color={colors.textMuted} size="small" />
            </View>
          ) : null
        }
      />

      {/* Fixed below the list rather than as its footer — as a
          ListFooterComponent it kept sliding down every time infinite
          scroll appended more days, so it was never reliably reachable. */}
      <View style={styles.footer}>
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <Pressable
          style={[styles.saveButton, savingAvailability && styles.saveButtonDisabled]}
          onPress={saveAvailability}
          disabled={savingAvailability}
        >
          {savingAvailability ? (
            <ActivityIndicator color={colors.surface} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Save availability</Text>
          )}
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
    paddingBottom: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  loadMoreRow: {
    paddingVertical: 16,
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
  },
  periodChipSelected: {
    backgroundColor: colors.positive,
    borderColor: colors.positive,
  },
  periodChipIcon: {
    marginRight: -2,
  },
  periodChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  periodChipTextSelected: {
    color: colors.surface,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendSwatchAvailable: {
    backgroundColor: colors.positive,
  },
  legendSwatchUnset: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  legendText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
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
  disconnect: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  calendarHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 10,
  },
  syncStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  syncStatusText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },
  syncNowButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  syncNowText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  conflictsSection: {
    marginTop: 8,
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
