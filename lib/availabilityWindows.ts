export type AvailabilityWindow = {
  label: string;
  group: 'weekday' | 'weekend';
  // JS Date.getDay() values this window applies to: 0=Sun ... 6=Sat
  days: number[];
  startHour: number;
  endHour: number;
};

// Rough local-time windows behind each onboarding availability chip — the
// single source of truth for both the picker (app/onboarding/availability.tsx)
// and checking real calendar free/busy against a selected window
// (app/profile.tsx "My playdate availability").
export const AVAILABILITY_WINDOWS: AvailabilityWindow[] = [
  { label: 'Before school', group: 'weekday', days: [1, 2, 3, 4, 5], startHour: 7, endHour: 8.5 },
  { label: 'After school', group: 'weekday', days: [1, 2, 3, 4, 5], startHour: 15, endHour: 18 },
  { label: 'Evenings', group: 'weekday', days: [1, 2, 3, 4, 5], startHour: 18, endHour: 20.5 },
  { label: 'Saturday morning', group: 'weekend', days: [6], startHour: 9, endHour: 12 },
  { label: 'Saturday afternoon', group: 'weekend', days: [6], startHour: 12, endHour: 17 },
  { label: 'Saturday evening', group: 'weekend', days: [6], startHour: 17, endHour: 20 },
  { label: 'Sunday morning', group: 'weekend', days: [0], startHour: 9, endHour: 12 },
  { label: 'Sunday afternoon', group: 'weekend', days: [0], startHour: 12, endHour: 17 },
  { label: 'Sunday evening', group: 'weekend', days: [0], startHour: 17, endHour: 20 },
];

export const WEEKDAY_LABELS = AVAILABILITY_WINDOWS.filter((w) => w.group === 'weekday').map((w) => w.label);
export const WEEKEND_LABELS = AVAILABILITY_WINDOWS.filter((w) => w.group === 'weekend').map((w) => w.label);

// Matches the options in app/onboarding/play-style.tsx — each child's ideal
// playdate length is a rough band, not a precise duration, so this maps each
// to a single representative number of hours to actually size a suggestion.
const PLAYDATE_LENGTH_HOURS: Record<string, number> = {
  '< 1 hour': 1,
  '1–2 hours': 1.5,
  '2–3 hours': 2.5,
  'Half a day': 4,
  'It depends': 1.5,
};
const DEFAULT_PLAYDATE_LENGTH_HOURS = 1.5;

// When a family has more than one neurodivergent child, a shared playdate
// slot needs to fit whichever child wants the most time — so this takes the
// longest of their individual preferences rather than an average.
export function longestPlaydateLengthHours(lengths: (string | null)[]): number {
  const hours = lengths
    .map((l) => (l ? PLAYDATE_LENGTH_HOURS[l] : undefined))
    .filter((h): h is number => h != null);
  return hours.length ? Math.max(...hours) : DEFAULT_PLAYDATE_LENGTH_HOURS;
}

export type SuggestedSlot = {
  start: Date;
  end: Date;
  label: string;
};

// Finds concrete free slots sized to durationHours within the user's
// selected preference windows over the next daysAhead days (starting
// tomorrow, not today — same-day suggestions don't leave people enough time
// to plan), checked against real calendar busy blocks (from
// getGoogleFreeBusy) — e.g. "Sat, Aug 22 · 10:00–11:30 AM" rather than just
// marking the whole window free or busy. A window can produce more than one
// slot in a day if a busy block splits it into multiple gaps each still
// long enough to fit the duration.
export function suggestedPlaydateSlots(
  selectedLabels: string[],
  busy: { start: string; end: string }[],
  durationHours: number,
  daysAhead = 21
): SuggestedSlot[] {
  const windows = AVAILABILITY_WINDOWS.filter((w) => selectedLabels.includes(w.label));
  if (!windows.length) return [];

  const durationMs = durationHours * 60 * 60 * 1000;
  const busyRanges = busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .sort((a, b) => a.start - b.start);
  const now = new Date();
  const results: SuggestedSlot[] = [];

  for (let offset = 1; offset <= daysAhead; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const dow = day.getDay();
    for (const w of windows) {
      if (!w.days.includes(dow)) continue;
      const windowStart = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Math.floor(w.startHour),
        (w.startHour % 1) * 60
      ).getTime();
      const windowEnd = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Math.floor(w.endHour),
        (w.endHour % 1) * 60
      ).getTime();
      const earliestStart = Math.max(windowStart, now.getTime());
      if (earliestStart + durationMs > windowEnd) continue;

      let cursor = earliestStart;
      const overlapping = busyRanges.filter((b) => b.start < windowEnd && b.end > earliestStart);
      for (const b of overlapping) {
        if (b.start - cursor >= durationMs) {
          results.push({ start: new Date(cursor), end: new Date(cursor + durationMs), label: w.label });
        }
        cursor = Math.max(cursor, b.end);
      }
      if (windowEnd - cursor >= durationMs) {
        results.push({ start: new Date(cursor), end: new Date(cursor + durationMs), label: w.label });
      }
    }
  }

  return results.sort((a, b) => a.start.getTime() - b.start.getTime());
}
