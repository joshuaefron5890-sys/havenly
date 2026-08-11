import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// Apple has no browser-callable OAuth for calendar data — connecting to
// iCloud calendars means speaking CalDAV (RFC 4791) with an app-specific
// password, and caldav.icloud.com doesn't send CORS headers, so a browser
// can't do this directly. The Cloud Function in functions/index.js proxies
// the CalDAV handshake server-side and reports back whether it worked.
export async function connectAppleCalendar(appleId: string, appPassword: string): Promise<void> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable(functions, 'connectAppleCalendar');
  await call({ appleId, appPassword });
}
