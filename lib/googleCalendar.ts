import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// Exchanges the authorization code from requestGoogleCalendarAuthCode() for
// a refresh token, server-side (functions/index.js holds the client
// secret this requires — a browser can never safely do this exchange
// itself). Success means the backend can now query this user's calendar
// free/busy on its own, at any later time, without them being present.
export async function connectGoogleCalendarBackend(code: string): Promise<void> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable(functions, 'connectGoogleCalendar');
  await call({ code });
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
