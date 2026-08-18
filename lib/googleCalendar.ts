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

export type GoogleSignInExchange = {
  idToken: string;
  accessToken: string | null;
};

// Exchanges the code from requestGoogleSignInCode() for an ID token to sign
// in to Firebase with. Identity-only — sign-in no longer requests any
// calendar scope (see requestGoogleSignInCode's comment for why), so there's
// no calendar refresh token to come back with here; that only ever happens
// through the explicit Connect action (connectGoogleCalendarBackend).
export async function exchangeGoogleSignInCode(code: string): Promise<GoogleSignInExchange> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ code: string }, GoogleSignInExchange>(functions, 'exchangeGoogleSignInCode');
  const result = await call({ code });
  return result.data;
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
