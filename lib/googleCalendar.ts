import { httpsCallable } from 'firebase/functions';
import { Platform } from 'react-native';
import { functions } from './firebase';

// Exchanges the authorization code from requestGoogleCalendarAuthCode() for
// a refresh token, server-side (functions/index.js holds the client
// secret this requires — a browser can never safely do this exchange
// itself). Success means the backend can now query this user's calendar
// free/busy on its own, at any later time, without them being present.
//
// `native` tells the server which redirect_uri convention the code was
// issued under (see functions/index.js's exchangeGoogleCode) — a web JS
// popup code and a native serverAuthCode aren't interchangeable, Google
// rejects the exchange if this doesn't match how the code was requested.
export async function connectGoogleCalendarBackend(code: string): Promise<void> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable(functions, 'connectGoogleCalendar');
  await call({ code, native: Platform.OS !== 'web' });
}

// Creates the calendar event for one accepted proposal on the signed-in
// user's own Google Calendar right now, rather than waiting for the
// automatic accept-time trigger (functions/index.js's
// createPlaydateCalendarEvents) — used right after someone finishes the
// opt-in "add this playdate to your calendar?" prompt, since by the time
// they've connected, that trigger already ran and found sync disabled.
// Safe to call even if the trigger's own attempt succeeded too — the
// server uses a deterministic event id, so a repeat call is a no-op.
export async function addPlaydateToGoogleCalendar(proposalId: string): Promise<void> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable(functions, 'addPlaydateToGoogleCalendar');
  await call({ proposalId });
}

// Creates a calendar event for one nearby-events-feed event (see
// lib/events.ts) on the signed-in user's own Google Calendar — the "Add to
// My Calendar" button on app/event/[id].tsx. Server derives a deterministic
// event id from eventId + uid, same idempotent-retry approach as
// addPlaydateToGoogleCalendar, and gives the event a fixed 2-hour length
// since the feed never supplies an end time.
export async function addExternalEventToGoogleCalendar(params: {
  eventId: string;
  title: string;
  startIso: string;
  location?: string;
  description?: string;
}): Promise<void> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable(functions, 'addExternalEventToGoogleCalendar');
  await call(params);
}

// Fetches this user's busy blocks for a time range using the stored
// refresh token — the same call a future matching feature would make to
// find overlapping free time between two families.
export async function getGoogleFreeBusy(
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ timeMin: string; timeMax: string }, { busy: { start: string; end: string }[] }>(
    functions,
    'getGoogleFreeBusy'
  );
  const result = await call({ timeMin, timeMax });
  return result.data.busy;
}
