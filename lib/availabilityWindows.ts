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

export type SlotCheck = {
  date: Date;
  label: string;
  free: boolean;
};

// Expands the user's selected preference labels into concrete upcoming
// dated slots over the next `daysAhead` days, and checks each one against
// real busy blocks (from getGoogleFreeBusy) for overlap.
export function upcomingSlots(
  selectedLabels: string[],
  busy: { start: string; end: string }[],
  daysAhead = 7
): SlotCheck[] {
  const windows = AVAILABILITY_WINDOWS.filter((w) => selectedLabels.includes(w.label));
  if (!windows.length) return [];

  const busyRanges = busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));
  const now = new Date();
  const results: SlotCheck[] = [];

  for (let offset = 0; offset < daysAhead; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const dow = day.getDay();
    for (const w of windows) {
      if (!w.days.includes(dow)) continue;
      const slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(w.startHour), (w.startHour % 1) * 60);
      const slotEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(w.endHour), (w.endHour % 1) * 60);
      if (slotEnd.getTime() <= now.getTime()) continue;
      const free = !busyRanges.some((b) => b.start < slotEnd.getTime() && b.end > slotStart.getTime());
      results.push({ date: slotStart, label: w.label, free });
    }
  }

  return results.sort((a, b) => a.date.getTime() - b.date.getTime());
}
