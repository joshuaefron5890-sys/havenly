import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { colors } from '../theme/colors';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Keeps the list from turning into a long scroll on a busy month — see the
// pager at the bottom of the agenda panel below.
const PAGE_SIZE = 3;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// 'YYYY-M-D' in local time — matches how playdateDateKeys/eventDateKeys are
// built from a raw ISO date string
// (new Date(iso).getFullYear()/getMonth()/getDate()), so a day lights up in
// the viewer's own time zone rather than UTC.
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

export type CalendarAgendaItem = {
  key: string;
  title: string;
  subtitle: string;
  dateISO: string;
  // A playdate (a proposal between two families) vs. a standard event
  // (TACA, a support group, etc.) — colors the day's dot and the agenda
  // row's icon differently so the two read apart at a glance.
  type: 'playdate' | 'event';
  onPress: () => void;
};

// A read-only month view, distinct from components/DatePickerModal.tsx's
// calendar (that one's for picking a single date to fill into a form field;
// this one's for browsing what's already on the calendar). Same
// weekday-row/7-column-grid anatomy, since that's already the app's one
// established calendar pattern, with a small dot marking any day that has
// something on it, and (like DatePickerModal) a filled circle for whichever
// day is currently selected.
export function UpcomingEventsCalendar({
  playdateDateKeys,
  eventDateKeys,
  agenda,
  onMonthChange,
}: {
  playdateDateKeys: Set<string>;
  eventDateKeys: Set<string>;
  agenda: CalendarAgendaItem[];
  // Fired on mount and on every prev/next navigation — lets the parent
  // (which owns the agenda list's actual data) filter it down to whatever
  // month is currently in view here, instead of this component's own
  // month state and the parent's agenda drifting independently.
  onMonthChange?: (year: number, month: number) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  // Tapping a day narrows the panel below from "this month's events" down
  // to just that day's — cleared back to the month view either by tapping
  // the same day again or the panel's own "Clear" link.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    onMonthChange?.(viewYear, viewMonth);
  }, [viewYear, viewMonth, onMonthChange]);

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const goToPrevMonth = () => {
    setSelectedDay(null);
    setPage(0);
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    setSelectedDay(null);
    setPage(0);
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const selectDay = (day: number) => {
    setPage(0);
    setSelectedDay((prev) => (prev === day ? null : day));
  };

  const clearSelectedDay = () => {
    setSelectedDay(null);
    setPage(0);
  };

  const dayItems =
    selectedDay === null
      ? null
      : agenda.filter((item) => {
          const d = new Date(item.dateISO);
          return (
            !Number.isNaN(d.getTime()) &&
            d.getFullYear() === viewYear &&
            d.getMonth() === viewMonth &&
            d.getDate() === selectedDay
          );
        });

  const visibleItems = dayItems ?? agenda;
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);
  const pagedItems = visibleItems.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);
  const showPanel = selectedDay !== null || agenda.length > 0;

  // Re-triggered whenever the visible set of rows changes underneath the
  // panel (a day gets picked or cleared, or the page turns) — slides the
  // new rows in from the right rather than just swapping them in place.
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    slide.setValue(18);
    Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: false }).start();
  }, [selectedDay, clampedPage, viewYear, viewMonth, slide]);

  return (
    <View>
      <View style={styles.nav}>
        <Pressable onPress={goToPrevMonth} hitSlop={8}>
          <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTH_LABELS[viewMonth]} {viewYear}
        </Text>
        <Pressable onPress={goToNextMonth} hitSlop={8}>
          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Capped and centered rather than stretched to the card's full
          width — aspectRatio:1 cells otherwise scale up with whatever
          width they're given, making the grid much chunkier than a
          small "which days have something" glance needs. */}
      <View style={styles.gridWrap}>
        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Text key={`${label}-${i}`} style={styles.weekdayLabel}>
              {label}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) return <View key={`blank-${i}`} style={styles.dayCell} />;
            const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
            const isSelected = day === selectedDay;
            const key = dateKey(viewYear, viewMonth, day);
            const hasPlaydate = playdateDateKeys.has(key);
            const hasEvent = eventDateKeys.has(key);
            return (
              <Pressable key={day} style={styles.dayCell} onPress={() => selectDay(day)}>
                <View style={[styles.dayNumber, isToday && styles.dayNumberToday, isSelected && styles.dayNumberSelected]}>
                  <Text style={[styles.dayText, isToday && styles.dayTextToday, isSelected && styles.dayTextSelected]}>
                    {day}
                  </Text>
                </View>
                {hasPlaydate || hasEvent ? (
                  <View style={styles.dayDotsRow}>
                    {hasPlaydate ? <View style={[styles.dayDot, styles.dayDotPlaydate]} /> : null}
                    {hasEvent ? <View style={[styles.dayDot, styles.dayDotEvent]} /> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dayDot, styles.dayDotPlaydate]} />
          <Text style={styles.legendLabel}>Playdate</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dayDot, styles.dayDotEvent]} />
          <Text style={styles.legendLabel}>Event</Text>
        </View>
      </View>

      {showPanel ? (
        <View style={styles.agenda}>
          <View style={styles.agendaHead}>
            <Text style={styles.agendaLabel}>
              {selectedDay !== null ? `${MONTH_LABELS[viewMonth].slice(0, 3).toUpperCase()} ${selectedDay}` : 'UPCOMING'}
            </Text>
            {selectedDay !== null ? (
              <Pressable onPress={clearSelectedDay} hitSlop={8}>
                <Text style={styles.agendaClear}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          <Animated.View
            style={{
              transform: [{ translateX: slide }],
              opacity: slide.interpolate({ inputRange: [0, 18], outputRange: [1, 0] }),
            }}
          >
            {pagedItems.length === 0 ? (
              <Text style={styles.agendaEmpty}>No events on this day.</Text>
            ) : (
              pagedItems.map((item, i) => (
                <Pressable
                  key={item.key}
                  style={[styles.agendaRow, i > 0 && styles.agendaRowDivider]}
                  onPress={item.onPress}
                >
                  <View style={[styles.agendaIcon, item.type === 'event' && styles.agendaIconEvent]}>
                    <Ionicons name="calendar" size={13} color={item.type === 'event' ? colors.info : colors.accent} />
                  </View>
                  <View style={styles.agendaText}>
                    <Text style={styles.agendaTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.agendaMeta} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={13} color={colors.caption} />
                </Pressable>
              ))
            )}
          </Animated.View>

          {pageCount > 1 ? (
            <View style={styles.pager}>
              <Pressable onPress={() => setPage((p) => Math.max(0, p - 1))} disabled={clampedPage === 0} hitSlop={8}>
                <Ionicons name="chevron-back" size={15} color={clampedPage === 0 ? colors.border : colors.textMuted} />
              </Pressable>
              <Text style={styles.pagerLabel}>
                {clampedPage + 1} / {pageCount}
              </Text>
              <Pressable
                onPress={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={clampedPage === pageCount - 1}
                hitSlop={8}
              >
                <Ionicons
                  name="chevron-forward"
                  size={15}
                  color={clampedPage === pageCount - 1 ? colors.border : colors.textMuted}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginBottom: 10,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  gridWrap: {
    width: '100%',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 3,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberToday: {
    borderWidth: 1.3,
    borderColor: colors.accent,
  },
  // Listed after dayNumberToday in the style array wherever both can apply
  // (today happens to be the selected day) so its borderWidth:0 wins over
  // today's ring, leaving one clean filled circle instead of a ring inside
  // a fill.
  dayNumberSelected: {
    backgroundColor: colors.accent,
    borderWidth: 0,
  },
  dayText: {
    fontSize: 12,
    color: colors.text,
  },
  dayTextToday: {
    fontWeight: '700',
  },
  dayTextSelected: {
    color: colors.surface,
    fontWeight: '700',
  },
  // Wraps 1-2 dots (a day can have both a playdate and an event) centered
  // as a group at the bottom of the cell, rather than each dot
  // individually positioning itself and needing to know about the other.
  dayDotsRow: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    gap: 3,
  },
  dayDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dayDotPlaydate: {
    backgroundColor: colors.accent,
  },
  dayDotEvent: {
    backgroundColor: colors.info,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  agenda: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  agendaHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  agendaLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  agendaClear: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
  agendaEmpty: {
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: 8,
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
  },
  agendaRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  agendaIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaIconEvent: {
    backgroundColor: colors.infoMuted,
  },
  agendaText: {
    flex: 1,
    minWidth: 0,
  },
  agendaTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  agendaMeta: {
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 1,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pagerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
