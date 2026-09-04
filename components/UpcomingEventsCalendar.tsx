import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// 'YYYY-M-D' in local time — matches how markedDateKeys is built from a raw
// ISO date string (new Date(iso).getFullYear()/getMonth()/getDate()), so a
// day lights up in the viewer's own time zone rather than UTC.
export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${month}-${day}`;
}

export type CalendarAgendaItem = {
  key: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

// A read-only month view, distinct from components/DatePickerModal.tsx's
// calendar (that one's for picking a single date — a filled selected-day
// circle, no dots, plus a time picker/footer this doesn't need). Same
// weekday-row/7-column-grid anatomy, since that's already the app's one
// established calendar pattern, just with a small dot marking any day that
// has something on it instead of a single selectable fill.
export function UpcomingEventsCalendar({
  markedDateKeys,
  agenda,
}: {
  markedDateKeys: Set<string>;
  agenda: CalendarAgendaItem[];
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

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
            const hasEvent = markedDateKeys.has(dateKey(viewYear, viewMonth, day));
            return (
              <View key={day} style={styles.dayCell}>
                <View style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                  <Text style={[styles.dayText, isToday && styles.dayTextToday]}>{day}</Text>
                </View>
                {hasEvent ? <View style={styles.dayDot} /> : null}
              </View>
            );
          })}
        </View>
      </View>

      {agenda.length > 0 ? (
        <View style={styles.agenda}>
          <Text style={styles.agendaLabel}>UPCOMING</Text>
          {agenda.map((item, i) => (
            <Pressable
              key={item.key}
              style={[styles.agendaRow, i > 0 && styles.agendaRowDivider]}
              onPress={item.onPress}
            >
              <View style={styles.agendaIcon}>
                <Ionicons name="calendar" size={13} color={colors.accent} />
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
          ))}
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
  dayText: {
    fontSize: 12,
    color: colors.text,
  },
  dayTextToday: {
    fontWeight: '700',
  },
  dayDot: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  agenda: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  agendaLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 9,
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
});
