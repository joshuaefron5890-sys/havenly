// Day-level availability model for sitters — distinct from the family
// side's recurring weekly windows (lib/availabilityWindows.ts). A family
// marks a standing weekly preference ("After school", "Saturday morning")
// that's matched against every week going forward; a sitter instead marks
// specific upcoming dates, since sitting is booked per-occurrence and their
// real availability genuinely varies day to day rather than following a
// fixed weekly pattern.

export type AvailabilityPeriod = 'morning' | 'afternoon' | 'evening';

export type PeriodDef = { key: AvailabilityPeriod; label: string; startHour: number; endHour: number };

export const AVAILABILITY_PERIODS: PeriodDef[] = [
  { key: 'morning', label: 'Morning', startHour: 7, endHour: 12 },
  { key: 'afternoon', label: 'Afternoon', startHour: 12, endHour: 17 },
  { key: 'evening', label: 'Evening', startHour: 17, endHour: 21 },
];

// Keyed by 'YYYY-MM-DD' (local calendar date) -> the periods marked
// available that day. A day with no entry (or an empty array) just means
// nothing has been marked for it yet, not that the sitter is unavailable —
// same "absence isn't a signal" reasoning as every other optional field on
// SitterProfile.
export type DayAvailability = Record<string, AvailabilityPeriod[]>;

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function periodConflictKey(dateKeyStr: string, period: AvailabilityPeriod): string {
  return `${dateKeyStr}|${period}`;
}

// The next `daysAhead` calendar days starting today — a rolling window
// rather than a full month grid, since a sitter only ever needs to plan a
// few weeks out and this avoids a real calendar's empty-past-days problem.
export function upcomingDays(daysAhead = 21): Date[] {
  const now = new Date();
  const days: Date[] = [];
  for (let offset = 0; offset < daysAhead; offset++) {
    days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  }
  return days;
}

function periodRangeMs(day: Date, period: PeriodDef): { start: number; end: number } {
  return {
    start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), period.startHour, 0).getTime(),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), period.endHour, 0).getTime(),
  };
}

// One (date, period) the sitter marked available where their connected
// Google Calendar shows a busy block overlapping it — surfaced for them to
// either remove that period or confirm they're still free despite what the
// calendar says (recorded in SitterProfile.availabilityConflictOverrides,
// keyed by periodConflictKey).
export type SitterAvailabilityConflict = {
  key: string;
  date: Date;
  dateKey: string;
  period: AvailabilityPeriod;
  periodLabel: string;
};

export function findSitterAvailabilityConflicts(
  availability: DayAvailability,
  busy: { start: string; end: string }[],
  daysAhead = 21
): SitterAvailabilityConflict[] {
  const busyRanges = busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));
  const results: SitterAvailabilityConflict[] = [];
  for (const day of upcomingDays(daysAhead)) {
    const key = dateKey(day);
    const periods = availability[key];
    if (!periods?.length) continue;
    for (const periodKey of periods) {
      const period = AVAILABILITY_PERIODS.find((p) => p.key === periodKey);
      if (!period) continue;
      const { start, end } = periodRangeMs(day, period);
      const hasConflict = busyRanges.some((b) => b.start < end && b.end > start);
      if (hasConflict) {
        results.push({ key: periodConflictKey(key, periodKey), date: day, dateKey: key, period: periodKey, periodLabel: period.label });
      }
    }
  }
  return results;
}

// Every (date, period) over the visible range where a connected calendar
// is entirely free — used to pre-populate the picker. Purely additive at
// the call site (see app/(sitter)/availability.tsx's handlePrefill): it
// only ever suggests filling in periods the sitter hasn't already decided
// on either way, so running it again never clobbers an explicit choice,
// and it never suggests a period already known to be busy.
export function freeUpcomingPeriods(busy: { start: string; end: string }[], daysAhead = 21): DayAvailability {
  const busyRanges = busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));
  const now = Date.now();
  const result: DayAvailability = {};
  for (const day of upcomingDays(daysAhead)) {
    const key = dateKey(day);
    for (const period of AVAILABILITY_PERIODS) {
      const { start, end } = periodRangeMs(day, period);
      if (end < now) continue;
      const isFree = !busyRanges.some((b) => b.start < end && b.end > start);
      if (isFree) {
        if (!result[key]) result[key] = [];
        result[key].push(period.key);
      }
    }
  }
  return result;
}

export function totalPeriodsSelected(availability: DayAvailability): number {
  return Object.values(availability).reduce((sum, periods) => sum + periods.length, 0);
}
