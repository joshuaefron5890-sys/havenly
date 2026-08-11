// Confirms a Google Calendar access token actually grants free/busy access,
// by making the same freeBusy call the app would make at match time, rather
// than trusting the OAuth grant blindly.
export async function verifyGoogleCalendarAccess(accessToken: string): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 60 * 1000);
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: now.toISOString(),
      timeMax: soon.toISOString(),
      items: [{ id: 'primary' }],
    }),
  });
  if (!res.ok) {
    throw new Error(`calendar-verify-failed-${res.status}`);
  }
}
