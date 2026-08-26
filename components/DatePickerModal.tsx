import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
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

function formatLabel(day: Date, hourText: string, minuteText: string, isPM: boolean): string {
  const weekday = day.toLocaleDateString(undefined, { weekday: 'short' });
  const month = day.toLocaleDateString(undefined, { month: 'short' });
  const hour = clampHour(hourText);
  const minute = clampMinute(minuteText);
  return `${weekday}, ${month} ${day.getDate()} · ${hour}:${minute} ${isPM ? 'PM' : 'AM'}`;
}

// Typed input is free-form while the field has focus (so backspacing to an
// empty string doesn't fight the user), then clamped into a valid,
// consistently-formatted value on blur/confirm.
function clampHour(text: string): string {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || n < 1) return '12';
  return String(Math.min(n, 12));
}

function clampMinute(text: string): string {
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || n < 0) return '00';
  return String(Math.min(n, 59)).padStart(2, '0');
}

// A fully custom calendar + time picker — no native date-picker dependency,
// since this app's whole pipeline is verified on web this session and a
// natively-linked picker's behavior can't be confirmed from here. Produces
// both the formatted display label and a real ISO timestamp for the same
// moment — the label is what's shown everywhere, the ISO string is what
// lets a past event actually be filtered out later (see
// lib/contributions.ts's parseContributedEventDate).
export function DatePickerModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (label: string, iso: string) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [hourText, setHourText] = useState('10');
  const [minuteText, setMinuteText] = useState('00');
  const [isPM, setIsPM] = useState(false);

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: totalDays }, (_, i) => i + 1)];

  const goToPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
    setSelectedDay(null);
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
    setSelectedDay(null);
  };

  const isPastDay = (day: number) => {
    const candidate = new Date(viewYear, viewMonth, day);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return candidate < startOfToday;
  };

  const handleConfirm = () => {
    if (!selectedDay) return;
    const day = new Date(viewYear, viewMonth, selectedDay);
    const hour24 = (parseInt(clampHour(hourText), 10) % 12) + (isPM ? 12 : 0);
    const minute = parseInt(clampMinute(minuteText), 10);
    const withTime = new Date(viewYear, viewMonth, selectedDay, hour24, minute);
    onConfirm(formatLabel(day, hourText, minuteText, isPM), withTime.toISOString());
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable onPress={goToPrevMonth} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {MONTH_LABELS[viewMonth]} {viewYear}
            </Text>
            <Pressable onPress={goToNextMonth} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>

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
              const disabled = isPastDay(day);
              const selected = selectedDay === day;
              return (
                <Pressable
                  key={day}
                  style={[styles.dayCell, selected && styles.dayCellSelected]}
                  onPress={() => !disabled && setSelectedDay(day)}
                  disabled={disabled}
                >
                  <Text style={[styles.dayText, disabled && styles.dayTextDisabled, selected && styles.dayTextSelected]}>
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>TIME</Text>
            <View style={styles.timeControls}>
              <TextInput
                style={styles.timeInput}
                value={hourText}
                onChangeText={(text) => setHourText(text.replace(/[^0-9]/g, '').slice(0, 2))}
                onBlur={() => setHourText(clampHour(hourText))}
                keyboardType="number-pad"
                maxLength={2}
                selectTextOnFocus
              />
              <Text style={styles.timeColon}>:</Text>
              <TextInput
                style={styles.timeInput}
                value={minuteText}
                onChangeText={(text) => setMinuteText(text.replace(/[^0-9]/g, '').slice(0, 2))}
                onBlur={() => setMinuteText(clampMinute(minuteText))}
                keyboardType="number-pad"
                maxLength={2}
                selectTextOnFocus
              />
              <View style={styles.ampmGroup}>
                <Pressable
                  style={[styles.ampmOption, !isPM && styles.ampmOptionSelected]}
                  onPress={() => setIsPM(false)}
                >
                  <Text style={[styles.ampmText, !isPM && styles.ampmTextSelected]}>AM</Text>
                </Pressable>
                <Pressable
                  style={[styles.ampmOption, isPM && styles.ampmOptionSelected]}
                  onPress={() => setIsPM(true)}
                >
                  <Text style={[styles.ampmText, isPM && styles.ampmTextSelected]}>PM</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, !selectedDay && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={!selectedDay}
            >
              <Text style={styles.confirmText}>Set date</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(24,24,27,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
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
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: colors.accent,
    borderRadius: 999,
  },
  dayText: {
    fontSize: 13,
    color: colors.text,
  },
  dayTextDisabled: {
    color: colors.border,
  },
  dayTextSelected: {
    color: colors.surface,
    fontWeight: '700',
  },
  timeRow: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    // Fixed, small width instead of flex — a flex item's default min-width
    // is its own content width, so two of these plus the AM/PM group could
    // refuse to shrink and overflow the card instead of fitting the row.
    width: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 0,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  timeColon: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  ampmGroup: {
    flex: 1.4,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    overflow: 'hidden',
  },
  ampmOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ampmOptionSelected: {
    backgroundColor: colors.accent,
  },
  ampmText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  ampmTextSelected: {
    color: colors.surface,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.surface,
  },
});
