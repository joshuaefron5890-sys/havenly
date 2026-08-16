import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
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
const MINUTES = ['00', '15', '30', '45'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function formatLabel(day: Date, hour12: number, minute: string, isPM: boolean): string {
  const weekday = day.toLocaleDateString(undefined, { weekday: 'short' });
  const month = day.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday}, ${month} ${day.getDate()} · ${hour12}:${minute} ${isPM ? 'PM' : 'AM'}`;
}

// A fully custom calendar + time picker — no native date-picker dependency,
// since this app's whole pipeline is verified on web this session and a
// natively-linked picker's behavior can't be confirmed from here. Only
// ever produces a formatted label string (same shape a contributor could
// have typed by hand), so nothing downstream needs to know this exists.
export function DatePickerModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (label: string) => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [hour12, setHour12] = useState(10);
  const [minute, setMinute] = useState('00');
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

  const cycleMinute = () => {
    setMinute((prev) => MINUTES[(MINUTES.indexOf(prev) + 1) % MINUTES.length]);
  };

  const cycleHour = () => {
    setHour12((prev) => (prev % 12) + 1);
  };

  const isPastDay = (day: number) => {
    const candidate = new Date(viewYear, viewMonth, day);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return candidate < startOfToday;
  };

  const handleConfirm = () => {
    if (!selectedDay) return;
    const day = new Date(viewYear, viewMonth, selectedDay);
    onConfirm(formatLabel(day, hour12, minute, isPM));
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
              <Pressable style={styles.stepper} onPress={cycleHour}>
                <Text style={styles.stepperText}>{hour12}</Text>
              </Pressable>
              <Text style={styles.timeColon}>:</Text>
              <Pressable style={styles.stepper} onPress={cycleMinute}>
                <Text style={styles.stepperText}>{minute}</Text>
              </Pressable>
              <Pressable style={styles.ampmToggle} onPress={() => setIsPM((prev) => !prev)}>
                <Text style={styles.stepperText}>{isPM ? 'PM' : 'AM'}</Text>
              </Pressable>
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
  stepper: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  stepperText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  timeColon: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  ampmToggle: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
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
