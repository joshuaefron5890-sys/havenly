const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

// Same OAuth client Firebase auto-created for the Google auth provider
// (lib/googleIdentity.ts reuses its client ID client-side). The client
// secret that pairs with it can only ever be used server-side — set via
// `firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET`, copied from
// Google Cloud Console > APIs & Services > Credentials > this OAuth client.
const GOOGLE_CLIENT_ID = '315662747088-dr7k9f6sbk4gs431v4j2c06hoob92mkm.apps.googleusercontent.com';
const googleClientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

// Used by connectGoogleCalendar to trade a code for real tokens.
// redirect_uri must match how the code was originally requested:
// 'postmessage' for the web JS popup flow (initCodeClient), or an empty
// string for a serverAuthCode from the native Google Sign-In SDK
// (lib/googleNativeAuth.ts) — Google rejects the exchange outright if
// these don't match.
async function exchangeGoogleCode(code, clientSecret, redirectUri) {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new HttpsError('unknown', tokenJson.error_description || 'Google sign-in failed.');
  }
  return tokenJson;
}

// Stored scoped to this user's own document, same security-rule boundary as
// the rest of their profile — there's no way to re-query it later without
// persisting a re-usable credential.
async function storeGoogleCalendarRefreshToken(uid, refreshToken) {
  await admin
    .firestore()
    .collection('users')
    .doc(uid)
    .set(
      {
        googleCalendarConnected: true,
        googleCalendar: {
          refreshToken,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
}

// Exchanges an authorization code (from the client's initCodeClient popup)
// for tokens. The refresh token is what makes the connection "live" — it
// lets refreshGoogleAccessToken mint a fresh access token later, on demand,
// without the user being present, unlike the short-lived access token the
// old implicit-flow client-side approach relied on.
exports.connectGoogleCalendar = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const code = typeof request.data?.code === 'string' ? request.data.code : '';
  if (!code) {
    throw new HttpsError('invalid-argument', 'Missing authorization code.');
  }
  // native (true) → a serverAuthCode from lib/googleNativeAuth.ts, which
  // Google requires an empty redirect_uri to exchange; web (default,
  // false) → the JS popup flow's fixed 'postmessage' placeholder.
  const native = request.data?.native === true;

  const tokenJson = await exchangeGoogleCode(code, googleClientSecret.value(), native ? '' : 'postmessage');
  if (!tokenJson.refresh_token) {
    throw new HttpsError('unknown', 'Google did not return a refresh token.');
  }

  await storeGoogleCalendarRefreshToken(request.auth.uid, tokenJson.refresh_token);

  return { connected: true };
});

async function refreshGoogleAccessToken(refreshToken, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new HttpsError('unknown', json.error_description || 'Could not refresh Google access token.');
  }
  return json.access_token;
}

// Uses the stored refresh token to fetch live free/busy blocks — the call
// a future matching feature would make to compare two families' calendars,
// without either of them needing to be online at the time.
exports.getGoogleFreeBusy = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const timeMin = typeof request.data?.timeMin === 'string' ? request.data.timeMin : '';
  const timeMax = typeof request.data?.timeMax === 'string' ? request.data.timeMax : '';
  if (!timeMin || !timeMax) {
    throw new HttpsError('invalid-argument', 'timeMin and timeMax are required.');
  }

  const userSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const refreshToken = userSnap.data()?.googleCalendar?.refreshToken;
  if (!refreshToken) {
    throw new HttpsError('failed-precondition', 'Google Calendar is not connected.');
  }

  const accessToken = await refreshGoogleAccessToken(refreshToken, googleClientSecret.value());
  const freeBusyRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
  });
  const freeBusyJson = await freeBusyRes.json();
  if (!freeBusyRes.ok) {
    throw new HttpsError('unknown', 'Could not fetch calendar availability.');
  }

  return { busy: freeBusyJson.calendars?.primary?.busy ?? [] };
});

// A deterministic id (Google allows a client-supplied one on insert, must
// match base32hex — lowercase a-v and digits, 5-1024 chars; a sha1 hex
// digest is entirely [0-9a-f], a subset of that) rather than letting Google
// generate a random one, so calling this twice for the same
// proposal+family — once from the automatic accept-time trigger, once from
// someone completing the opt-in prompt afterward — creates the event at
// most once instead of duplicating it.
function googleEventIdFor(proposalId, uid) {
  return require('crypto').createHash('sha1').update(`havenly-playdate-${proposalId}-${uid}`).digest('hex');
}

async function createGoogleCalendarEvent(
  refreshToken,
  clientSecret,
  { eventId, summary, description, location, startIso, endIso }
) {
  const accessToken = await refreshGoogleAccessToken(refreshToken, clientSecret);
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: eventId,
      summary,
      description: description || undefined,
      location: location || undefined,
      start: { dateTime: startIso },
      end: { dateTime: endIso },
    }),
  });
  // A 409 means this exact event id already exists on the calendar — that's
  // success, not a failure, for our purposes (idempotent retry).
  if (!res.ok && res.status !== 409) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Google Calendar insert failed (${res.status})`);
  }
}

// Shared by the automatic accept-time trigger and the explicit
// addPlaydateToGoogleCalendar callable below, so both derive the exact same
// event content from a proposal doc. Doesn't include the title — that's
// personalized per participant (see buildPlaydateSummary), since each side
// sees the *other* family's name, not their own.
function derivePlaydateEventFields(proposal) {
  const startIso = typeof proposal.date === 'string' ? proposal.date : '';
  const endIso = typeof proposal.endDate === 'string' ? proposal.endDate : '';
  const venue = typeof proposal.venue === 'string' ? proposal.venue : '';
  return { startIso, endIso, venue };
}

// "Playdate with {Surname} Family" — {Surname} is the *other* participant's
// last name, not the calendar owner's own, since the useful thing to see on
// your own calendar is who you're meeting. Falls back to a generic title
// if that family never set a last name.
function buildPlaydateSummary(otherFamilyLastName) {
  const trimmed = typeof otherFamilyLastName === 'string' ? otherFamilyLastName.trim() : '';
  return trimmed ? `Playdate with ${trimmed} Family` : 'Haven.ly playdate';
}

async function deleteGoogleCalendarEvent(refreshToken, clientSecret, eventId) {
  const accessToken = await refreshGoogleAccessToken(refreshToken, clientSecret);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404/410 mean it's already gone (never created, or already cancelled) —
  // that's the outcome we want, not a failure.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Google Calendar delete failed (${res.status})`);
  }
}

// Fires when a playdate proposal flips to 'accepted' (see
// lib/playdateProposals.ts's respondToProposal) and puts the confirmed
// playdate on each family's own Google Calendar. A family with no calendar
// connected is silently skipped, and one family's failure doesn't block the
// other's — same graceful-degradation approach as every other multi-source
// feature in this app rather than surfacing a hard error either family can't
// act on.
//
// This only does anything for a family that both opted in to
// the sync toggle (app/onboarding/calendar.tsx) and completed a real
// connect/reconnect under it — that's what actually gets a calendar.events-
// scoped refresh token, checked just below via googleCalendarSyncEnabled.
// Until this project completes Google's OAuth verification, that consent
// screen throws Google's "unverified app" warning at everyone; the "Advanced
// > Go to Haven.ly (unsafe)" bypass lets a person through it, capped at 100
// lifetime users project-wide (Google Cloud Console > OAuth consent screen
// > Audience > OAuth user cap). Anyone who left the toggle off keeps the
// safe, unaffected freebusy-only connection from sign-up.
exports.createPlaydateCalendarEvents = onDocumentUpdated(
  { document: 'playdateProposals/{proposalId}', secrets: [googleClientSecret] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after || after.status !== 'accepted' || before?.status === 'accepted') {
      return;
    }

    const { startIso, endIso, venue } = derivePlaydateEventFields(after);
    if (!startIso || !endIso) return;

    const uids = [after.fromUid, after.toUid].filter((uid) => typeof uid === 'string' && uid);

    await Promise.all(
      uids.map(async (uid) => {
        try {
          const otherUid = uid === after.fromUid ? after.toUid : after.fromUid;
          const [userSnap, otherSnap] = await Promise.all([
            admin.firestore().collection('users').doc(uid).get(),
            admin.firestore().collection('users').doc(otherUid).get(),
          ]);
          const userData = userSnap.data();
          if (!userData) return;
          const summary = buildPlaydateSummary(otherSnap.data()?.lastName);

          // googleCalendarSyncEnabled reflects whether the family opted in to
          // the calendar.events (write) scope on connect — see the toggle in
          // app/onboarding/calendar.tsx. Skipping outright when it's false
          // avoids a call doomed to fail with "insufficient authentication
          // scopes" for a family that deliberately kept the read-only
          // freebusy connection.
          if (userData.googleCalendarSyncEnabled && userData.googleCalendar?.refreshToken) {
            await createGoogleCalendarEvent(userData.googleCalendar.refreshToken, googleClientSecret.value(), {
              eventId: googleEventIdFor(event.params.proposalId, uid),
              summary,
              location: venue,
              startIso,
              endIso,
            });
          } else {
            // Not an error — just nothing to do for this family — but logged
            // so "no event showed up" is diagnosable from Cloud Logging
            // without guessing whether the trigger even ran.
            console.log(`Skipping calendar event for ${uid}: no eligible Google connection (sync enabled).`);
          }
        } catch (err) {
          console.error(`Could not create playdate calendar event for ${uid}`, err);
        }
      })
    );
  }
);

// Mirror of createPlaydateCalendarEvents above, firing when a proposal
// flips to 'canceled' (lib/playdateProposals.ts's cancelProposal, only the
// original creator can do this) — removes the event from each family's
// Google Calendar if one was ever created. Deletion by the same
// deterministic id createGoogleCalendarEvent used to create it, so this is
// safe to run even for a family that never actually got an event (a
// proposal cancelled while still 'proposed', or one whose calendar wasn't
// connected/synced) — the delete just 404s and that's treated as success.
exports.cancelPlaydateCalendarEvents = onDocumentUpdated(
  { document: 'playdateProposals/{proposalId}', secrets: [googleClientSecret] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after || after.status !== 'canceled' || before?.status === 'canceled') {
      return;
    }

    const uids = [after.fromUid, after.toUid].filter((uid) => typeof uid === 'string' && uid);

    await Promise.all(
      uids.map(async (uid) => {
        try {
          const userSnap = await admin.firestore().collection('users').doc(uid).get();
          const userData = userSnap.data();
          if (!userData) return;

          if (userData.googleCalendarSyncEnabled && userData.googleCalendar?.refreshToken) {
            await deleteGoogleCalendarEvent(
              userData.googleCalendar.refreshToken,
              googleClientSecret.value(),
              googleEventIdFor(event.params.proposalId, uid)
            );
          }
        } catch (err) {
          console.error(`Could not remove playdate calendar event for ${uid}`, err);
        }
      })
    );
  }
);

// Lets a family create the event on their own Google Calendar right away,
// for one specific accepted proposal, instead of waiting on the automatic
// trigger above — used right after someone completes the opt-in "add this
// playdate to your calendar?" prompt (components/AddToGoogleCalendarPrompt,
// shared by the two screens a proposal can be accepted from), since by the
// time they've finished connecting, the trigger already ran (at the moment
// the proposal was accepted) and found sync disabled. The deterministic
// event id from googleEventIdFor makes this safe to call even if the
// trigger's own attempt did go through — it's a no-op on the duplicate.
exports.addPlaydateToGoogleCalendar = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const proposalId = typeof request.data?.proposalId === 'string' ? request.data.proposalId : '';
  if (!proposalId) {
    throw new HttpsError('invalid-argument', 'proposalId is required.');
  }

  const proposalSnap = await admin.firestore().collection('playdateProposals').doc(proposalId).get();
  const proposal = proposalSnap.data();
  if (!proposal) {
    throw new HttpsError('not-found', 'Could not find that playdate.');
  }
  const uid = request.auth.uid;
  if (proposal.fromUid !== uid && proposal.toUid !== uid) {
    throw new HttpsError('permission-denied', 'This playdate is not yours.');
  }
  if (proposal.status !== 'accepted') {
    throw new HttpsError('failed-precondition', 'This playdate has not been accepted yet.');
  }

  const { startIso, endIso, venue } = derivePlaydateEventFields(proposal);
  if (!startIso || !endIso) {
    throw new HttpsError('failed-precondition', 'This playdate is missing timing details.');
  }

  const otherUid = uid === proposal.fromUid ? proposal.toUid : proposal.fromUid;
  const [userSnap, otherSnap] = await Promise.all([
    admin.firestore().collection('users').doc(uid).get(),
    admin.firestore().collection('users').doc(otherUid).get(),
  ]);
  const refreshToken = userSnap.data()?.googleCalendar?.refreshToken;
  if (!refreshToken) {
    throw new HttpsError('failed-precondition', 'Connect Google Calendar first.');
  }
  const summary = buildPlaydateSummary(otherSnap.data()?.lastName);

  await createGoogleCalendarEvent(refreshToken, googleClientSecret.value(), {
    eventId: googleEventIdFor(proposalId, uid),
    summary,
    location: venue,
    startIso,
    endIso,
  });

  return { created: true };
});

// Nearby/community events (TACA and regional feeds, see getNearbyEvents,
// plus community-contributed ones) have no server-side record to look up —
// unlike a playdate proposal, the client already has the full event and
// just hands it over here. A separate hash namespace from googleEventIdFor
// keeps an event id and a proposal id from ever colliding on the same
// deterministic-id scheme.
function googleEventIdForExternalEvent(eventId, uid) {
  return require('crypto').createHash('sha1').update(`havenly-event-${eventId}-${uid}`).digest('hex');
}

const EXTERNAL_EVENT_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

// Creates a calendar event for a nearby-events-feed event on the signed-in
// user's own Google Calendar — the "Add to My Calendar" button on
// app/event/[id].tsx. The feed only ever gives a single start time, never
// a duration, so the event is given a fixed 2-hour length here rather than
// trusting a client-supplied end time.
exports.addExternalEventToGoogleCalendar = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const eventId = typeof data.eventId === 'string' ? data.eventId.trim() : '';
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const startIso = typeof data.startIso === 'string' ? data.startIso : '';
  if (!eventId || !title || !startIso) {
    throw new HttpsError('invalid-argument', 'eventId, title, and startIso are required.');
  }
  const startDate = new Date(startIso);
  if (Number.isNaN(startDate.getTime())) {
    throw new HttpsError('invalid-argument', 'startIso is not a valid date.');
  }
  const endIso = new Date(startDate.getTime() + EXTERNAL_EVENT_DEFAULT_DURATION_MS).toISOString();
  const location = typeof data.location === 'string' ? data.location.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';

  const userSnap = await admin.firestore().collection('users').doc(uid).get();
  const refreshToken = userSnap.data()?.googleCalendar?.refreshToken;
  if (!refreshToken) {
    throw new HttpsError('failed-precondition', 'Connect Google Calendar first.');
  }

  await createGoogleCalendarEvent(refreshToken, googleClientSecret.value(), {
    eventId: googleEventIdForExternalEvent(eventId, uid),
    summary: title,
    description,
    location,
    startIso,
    endIso,
  });

  return { created: true };
});

// --- Email notifications ---------------------------------------------
//
// Purely informational — no action can be taken by replying to the email,
// just a link back into the app. Sent directly via Resend's HTTP API
// (api.resend.com) rather than Firebase's "Trigger Email from Firestore"
// extension, which Google is sunsetting (no new installs after March 31,
// 2027) — not worth building on for new work. The API key is set via
// `firebase functions:secrets:set RESEND_API_KEY`, same pattern as
// googleClientSecret above; RESEND_FROM_EMAIL must be an address on a
// domain verified in the Resend dashboard (Domains > Add Domain) — set up
// and confirmed verified for haven-ly.com — not just any address, since
// Resend rejects sends from an unverified one.
const APP_BASE_URL = 'https://haven-ly.com';
const resendApiKey = defineSecret('RESEND_API_KEY');
const RESEND_FROM_EMAIL = 'Haven.ly <notifications@haven-ly.com>';

// "The Efron Family", or a generic fallback if that family never set a
// last name — same wording buildPlaydateSummary already uses for calendar
// event titles, reused here so a family's name reads the same everywhere
// it's generated automatically rather than typed by a person.
function familyLabelFor(lastName) {
  const trimmed = typeof lastName === 'string' ? lastName.trim() : '';
  return trimmed ? `The ${trimmed} Family` : 'A Haven.ly family';
}

// Resolves the recipient's email via Firebase Auth (not Firestore — see
// the comment on `users/{uid}` elsewhere in this file; the user doc itself
// never reliably carries an email field) and sends it through Resend.
// Silently skips a user with no email on file, and logs (rather than
// throws) on a failed send, since this is a best-effort notification, not
// a required step in either flow — a Resend outage shouldn't show up as
// an error on the proposal/message write that triggered it.
async function sendNotificationEmail(toUid, subject, text) {
  const userRecord = await admin
    .auth()
    .getUser(toUid)
    .catch(() => null);
  const to = userRecord?.email;
  if (!to) {
    console.log(`Skipping notification email to ${toUid}: no email on file.`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [to], subject, text }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error(`Resend send to ${toUid} failed (${res.status}): ${errJson.message || 'unknown error'}`);
  }
}

// Fires when a playdate is proposed — the recipient might not have the
// app open to see it otherwise. Proposing also writes a message into the
// conversation (see sendProposalMessage in lib/messages.ts) — the
// message-created trigger below skips that one (type ===
// 'playdate_proposal') so a new proposal only ever sends this one email,
// not two.
exports.emailOnPlaydateProposed = onDocumentCreated(
  { document: 'playdateProposals/{proposalId}', secrets: [resendApiKey] },
  async (event) => {
    const proposal = event.data?.data();
    if (!proposal || typeof proposal.fromUid !== 'string' || typeof proposal.toUid !== 'string') return;

    const fromSnap = await admin.firestore().collection('users').doc(proposal.fromUid).get();
    const family = familyLabelFor(fromSnap.data()?.lastName);
    const dateLabel = typeof proposal.dateLabel === 'string' ? proposal.dateLabel : '';
    const venue = typeof proposal.venue === 'string' ? proposal.venue : '';
    const note = typeof proposal.note === 'string' ? proposal.note.trim() : '';
    const details = [dateLabel, venue].filter(Boolean).join(' at ');

    const lines = [
      `${family} sent you a playdate invite on Haven.ly${details ? `: ${details}` : '.'}`,
      note ? `Their note: "${note}"` : null,
      '',
      `View and respond: ${APP_BASE_URL}/proposal/${event.params.proposalId}`,
    ].filter((line) => line !== null);

    await sendNotificationEmail(proposal.toUid, `${family} sent you a playdate invite`, lines.join('\n'));
  }
);

// Fires on every new message — skips a playdate-proposal message (the
// trigger above already emails that one) and an empty/system message.
// Recipient is derived from the parent conversation's participantUids,
// since a message doc itself never names its own recipient (see
// lib/messages.ts's sendMessage).
exports.emailOnMessageSent = onDocumentCreated(
  { document: 'conversations/{conversationId}/messages/{messageId}', secrets: [resendApiKey] },
  async (event) => {
    const message = event.data?.data();
    if (!message || message.type === 'playdate_proposal' || typeof message.senderUid !== 'string') return;
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (!text) return;

    const conversationSnap = await admin.firestore().collection('conversations').doc(event.params.conversationId).get();
    const participantUids = conversationSnap.data()?.participantUids;
    const toUid = Array.isArray(participantUids) ? participantUids.find((uid) => uid !== message.senderUid) : null;
    if (!toUid) return;

    const fromSnap = await admin.firestore().collection('users').doc(message.senderUid).get();
    const family = familyLabelFor(fromSnap.data()?.lastName);

    const lines = [
      `${family} sent you a message on Haven.ly:`,
      '',
      `"${text}"`,
      '',
      `Reply: ${APP_BASE_URL}/messages/${event.params.conversationId}`,
    ];

    await sendNotificationEmail(toUid, `New message from ${family}`, lines.join('\n'));
  }
);

// Smallest age gap between any of one family's kids and any of the
// other's — used as a rough "will these two actually enjoy playing
// together" signal. Ages are free-text from onboarding, so this only
// counts entries that parse cleanly as a number.
function ageClosenessBonus(myChildren, theirChildren) {
  const myAges = (Array.isArray(myChildren) ? myChildren : [])
    .map((c) => parseInt(c?.age, 10))
    .filter((n) => Number.isFinite(n));
  const theirAges = (Array.isArray(theirChildren) ? theirChildren : [])
    .map((c) => parseInt(c?.age, 10))
    .filter((n) => Number.isFinite(n));
  if (!myAges.length || !theirAges.length) return 0;

  let smallestGap = Infinity;
  for (const a of myAges) {
    for (const b of theirAges) {
      smallestGap = Math.min(smallestGap, Math.abs(a - b));
    }
  }
  if (smallestGap <= 1) return 10;
  if (smallestGap <= 2) return 7;
  if (smallestGap <= 4) return 4;
  return 1;
}

// A same-city match is a real compatibility signal here, not just trivia —
// it's what actually makes an in-person playdate feasible. Zip-radius
// distance (rather than exact city match) would be a finer signal, but
// that needs lat/long math this doesn't have yet; city+state is what's
// available today.
function locationBonus(me, target) {
  if (!me.city || !target.city) return 0;
  return me.city === target.city && me.state === target.state ? 8 : 0;
}

// Weighted, capped point system — deliberately not "% of everything that
// overlaps," which would treat a shared taste in Pokémon the same as
// shared neurodivergent experience. Heaviest weight goes to the two
// signals that actually predict a good match: shared neurodivergent
// experience (the app's core "someone who gets it" value) and shared
// goals (so a family wanting casual playdates doesn't get matched with one
// looking for a close friendship). Child age closeness and shared
// interests count for less; shared availability is closer to a small
// logistics bonus than a real compatibility signal. Clamped well under
// 100 — no two real families should ever read as a "sure thing."
function computeMatchScore(me, target, sharedInterests, sharedNeurodivergence, sharedAvailability) {
  const myGoals = Array.isArray(me.goals) ? me.goals : [];
  const theirGoals = Array.isArray(target.goals) ? target.goals : [];
  const sharedGoals = theirGoals.filter((g) => myGoals.includes(g));

  const mySoundsGoodTo = Array.isArray(me.soundsGoodTo) ? me.soundsGoodTo : [];
  const theirSoundsGoodTo = Array.isArray(target.soundsGoodTo) ? target.soundsGoodTo : [];
  const sharedSoundsGoodTo = theirSoundsGoodTo.filter((s) => mySoundsGoodTo.includes(s));

  const points =
    Math.min(sharedNeurodivergence.length, 3) * 8 +
    Math.min(sharedGoals.length, 3) * 8 +
    ageClosenessBonus(me.children, target.children) +
    Math.min(sharedInterests.length, 5) * 3 +
    Math.min(sharedSoundsGoodTo.length, 4) * 3 +
    Math.min(sharedAvailability.length, 4) * 1.5 +
    locationBonus(me, target);

  return Math.round(Math.max(50, Math.min(97, 50 + points)));
}

// Shared by getFamilyProfile (which returns every field below) and
// getSuggestedFamilies/getFamiliesByUids (which only need matchScore, to
// power the Home dashboard's "95%+ match" highlight) — one place to
// compute what two families have in common instead of two copies of the
// same filtering logic drifting apart.
function computeMatch(me, target) {
  const myInterests = Array.isArray(me.interests) ? me.interests : [];
  const theirInterests = Array.isArray(target.interests) ? target.interests : [];
  const sharedInterests = theirInterests.filter((i) => myInterests.includes(i));

  const myNeurodivergence = new Set(
    (Array.isArray(me.children) ? me.children : []).flatMap((c) =>
      Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
    )
  );
  const theirNeurodivergence = [
    ...new Set(
      (Array.isArray(target.children) ? target.children : []).flatMap((c) =>
        Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
      )
    ),
  ];
  const sharedNeurodivergence = theirNeurodivergence.filter((n) => myNeurodivergence.has(n));

  const myPlayStyle = new Set(
    (Array.isArray(me.children) ? me.children : []).flatMap((c) => (Array.isArray(c?.playStyle) ? c.playStyle : []))
  );
  const theirPlayStyle = [
    ...new Set(
      (Array.isArray(target.children) ? target.children : []).flatMap((c) =>
        Array.isArray(c?.playStyle) ? c.playStyle : []
      )
    ),
  ];
  const sharedPlayStyle = theirPlayStyle.filter((p) => myPlayStyle.has(p));

  const myAvailability = new Set(Array.isArray(me.availability) ? me.availability : []);
  const theirAvailability = Array.isArray(target.availability) ? target.availability : [];
  const sharedAvailability = theirAvailability.filter((a) => myAvailability.has(a));

  const matchScore = computeMatchScore(me, target, sharedInterests, sharedNeurodivergence, sharedAvailability);

  return { sharedInterests, sharedNeurodivergence, sharedPlayStyle, sharedAvailability, matchScore };
}

// Shared by every endpoint that hands another family's data to a client
// (getSuggestedFamilies, getFamiliesByUids) — the single place that decides
// which fields of a user doc are actually safe to show someone else. User
// docs also hold things that must never reach another user's device (a
// Google Calendar refresh token), so this
// hand-picks rather than passing the doc through. Note zipCode itself is
// deliberately NOT included — city/state is what's shown publicly (see
// contexts/OnboardingContext.tsx), the exact zip stays private.
function toPublicFamily(uid, data) {
  return {
    uid,
    firstName: typeof data.firstName === 'string' ? data.firstName : '',
    lastName: typeof data.lastName === 'string' ? data.lastName : '',
    familyPhotoUrl: typeof data.familyPhotoUrl === 'string' ? data.familyPhotoUrl : null,
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
    children: Array.isArray(data.children)
      ? data.children.map((c) => ({
          name: typeof c?.name === 'string' ? c.name : '',
          age: typeof c?.age === 'string' ? c.age : '',
          photoUrl: typeof c?.photoUrl === 'string' ? c.photoUrl : null,
        }))
      : [],
  };
}

// Powers the "For You" screen's Discover tab. Runs server-side (Admin SDK)
// rather than letting the client query the users collection directly, for
// the same reason toPublicFamily exists — see its comment.
exports.getSuggestedFamilies = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const [meSnap, snap] = await Promise.all([
    admin.firestore().collection('users').doc(request.auth.uid).get(),
    admin.firestore().collection('users').where('onboardingComplete', '==', true).limit(30).get(),
  ]);
  const me = meSnap.data() ?? {};

  const families = snap.docs
    .filter((doc) => doc.id !== request.auth.uid)
    .map((doc) => {
      const target = doc.data();
      return { ...toPublicFamily(doc.id, target), matchScore: computeMatch(me, target).matchScore };
    });

  return { families };
});

// Powers the "For You" screen's My List tab — given the uids a user has
// favorited (client reads its own doc's favoriteFamilyUids array directly,
// a normal Firestore read of one's own document), fetches their current
// public info the same safe way getSuggestedFamilies does.
exports.getFamiliesByUids = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uids = Array.isArray(request.data?.uids)
    ? request.data.uids.filter((u) => typeof u === 'string').slice(0, 50)
    : [];
  if (!uids.length) {
    return { families: [] };
  }

  const [meSnap, snaps] = await Promise.all([
    admin.firestore().collection('users').doc(request.auth.uid).get(),
    Promise.all(uids.map((uid) => admin.firestore().collection('users').doc(uid).get())),
  ]);
  const me = meSnap.data() ?? {};
  const families = snaps
    .filter((snap) => snap.exists)
    .map((snap) => {
      const target = snap.data();
      return { ...toPublicFamily(snap.id, target), matchScore: computeMatch(me, target).matchScore };
    });

  return { families };
});

// Powers the family public-profile screen (tapped from a Discover row).
// Runs server-side, like getSuggestedFamilies, both to keep the same
// private fields out of reach and because it needs the CALLER's own
// profile too — to compute what's actually shared with the target family —
// without handing that comparison data to the client to do itself.
exports.getFamilyProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const targetUid = typeof request.data?.uid === 'string' ? request.data.uid : '';
  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'Missing family uid.');
  }

  const [meSnap, targetSnap] = await Promise.all([
    admin.firestore().collection('users').doc(request.auth.uid).get(),
    admin.firestore().collection('users').doc(targetUid).get(),
  ]);
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', 'That family could not be found.');
  }

  const me = meSnap.data() ?? {};
  const target = targetSnap.data() ?? {};

  // Everything returned below is an INTERSECTION with the caller's own
  // profile, not the target's full data — this screen is meant to show
  // "what you two have in common," not a stranger's complete profile.
  const { sharedInterests, sharedNeurodivergence, sharedPlayStyle, sharedAvailability, matchScore } = computeMatch(
    me,
    target
  );

  return {
    ...toPublicFamily(targetUid, target),
    sharedInterests,
    sharedNeurodivergence,
    sharedPlayStyle,
    sharedAvailability,
    matchScore,
  };
});

// Apple's public, unauthenticated "top charts" endpoint (the same one that
// powers marketing badges/widgets) — 1305 is the Kids & Family genre id.
// Supplements the per-tag term search below with genuinely well-produced
// family content a keyword search might not surface, confirmed working via
// a one-off diagnostic (the domain isn't reachable from the dev sandbox
// this was written against). Chart entries have no feedUrl (that field
// only exists on Search API results), so their detail screen falls back to
// "No description available" same as any podcast whose RSS feed lookup
// fails — an accepted, minor gap rather than a second follow-up request
// per chart entry just to resolve one.
async function fetchFamilyPodcastChart(limit) {
  try {
    const res = await fetch(`https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/${limit}/1305/podcasts.json`);
    if (!res.ok) return [];
    const json = await res.json();
    const results = Array.isArray(json?.feed?.results) ? json.feed.results : [];
    // Normalized into the exact shape Search API results have, tagged with
    // a matchedTag like any other search, so it flows through the same
    // dedupe/ranking loop below unchanged.
    return results.map((r) => ({
      collectionId: r.id,
      collectionName: r.name,
      artistName: r.artistName,
      artworkUrl100: r.artworkUrl100,
      collectionViewUrl: r.url,
      genres: Array.isArray(r.genres) ? r.genres.map((g) => g?.name).filter((n) => typeof n === 'string') : [],
      matchedTag: 'Kids & Family',
    }));
  } catch {
    return [];
  }
}

// Powers "Suggested podcasts" on the For You screen's Discover tab. Uses
// Apple's iTunes Search API — free, unauthenticated, no API key — rather
// than PodcastIndex, which requires a developer account PodcastIndex isn't
// currently issuing to free-email signups. Runs server-side (not because
// the API needs a secret — it doesn't — but to read the caller's own child
// neurodivergence tags from Firestore and because a server-to-server
// request sidesteps any CORS restriction a browser fetch might hit).
exports.getPodcastSuggestions = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const meSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = meSnap.data() ?? {};
  // The two placeholder onboarding options ("Still figuring it out",
  // "Prefer not to say" — see app/onboarding/child.tsx's
  // NEURODIVERGENCE_OPTIONS) aren't real search terms and would just waste
  // a search slot on a nonsense query like "Prefer not to say parenting".
  const NON_SEARCHABLE_TAGS = new Set(['Still figuring it out', 'Prefer not to say']);
  const neurodivergence = [
    ...new Set(
      (Array.isArray(me.children) ? me.children : [])
        .flatMap((c) => (Array.isArray(c?.neurodivergence) ? c.neurodivergence : []))
        .filter((tag) => !NON_SEARCHABLE_TAGS.has(tag))
    ),
  ];
  // Always searched in addition to whatever the family specifically
  // selected — a family with only "Autism" checked still sees ADHD/
  // dyslexia/anxiety-relevant shows too, and a family with no tags on file
  // yet (skipped that onboarding step, or picked one of the placeholder
  // options above) still gets real coverage instead of one thin fallback
  // search. Ambiguous bare acronyms (PDA, SPD, 2e) are spelled out in full
  // — searched as-is they'd just as likely match something unrelated.
  const BROAD_NEURODIVERGENCE_TERMS = [
    'autism',
    'ADHD',
    'dyslexia',
    'special needs',
    'anxiety',
    'dyscalculia',
    'OCD',
    'Tourette syndrome',
    'pathological demand avoidance',
    'sensory processing disorder',
    'twice exceptional',
    'IEP',
    'apraxia of speech',
    'ARFID',
  ];
  const searchTags = [...new Set([...neurodivergence, ...BROAD_NEURODIVERGENCE_TERMS])];

  // One search per tag, "parenting" appended to bias toward family-relevant
  // results instead of purely clinical/adult content — plus the Kids &
  // Family chart, fetched once (not per tag, since it isn't a search).
  const [resultsPerTag, familyChart] = await Promise.all([
    Promise.all(
      searchTags.map(async (tag) => {
        const term = encodeURIComponent(`${tag} parenting`);
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=podcast&limit=10`);
          if (!res.ok) return [];
          const json = await res.json();
          return Array.isArray(json.results) ? json.results.map((r) => ({ ...r, matchedTag: tag })) : [];
        } catch {
          return [];
        }
      })
    ),
    fetchFamilyPodcastChart(10),
  ]);
  resultsPerTag.push(familyChart);

  // A podcast can turn up under more than one tag's search — dedupe by
  // feed and rank higher the more of the child's tags it matched, so a
  // podcast relevant to both ADHD and sensory processing outranks one
  // that only came up under a single search.
  const byFeed = new Map();
  for (const list of resultsPerTag) {
    for (const podcast of list) {
      const key = podcast.collectionId ?? podcast.feedUrl;
      if (!key) continue;
      const existing = byFeed.get(key);
      if (existing) {
        existing.matchedTags.add(podcast.matchedTag);
      } else {
        byFeed.set(key, {
          id: String(key),
          title: typeof podcast.collectionName === 'string' ? podcast.collectionName : '',
          artist: typeof podcast.artistName === 'string' ? podcast.artistName : '',
          artworkUrl:
            typeof podcast.artworkUrl600 === 'string'
              ? podcast.artworkUrl600
              : typeof podcast.artworkUrl100 === 'string'
                ? podcast.artworkUrl100
                : null,
          viewUrl: typeof podcast.collectionViewUrl === 'string' ? podcast.collectionViewUrl : null,
          // The search API has no synopsis field — feedUrl lets the detail
          // screen fetch one from the show's own RSS feed on demand (see
          // getPodcastDescription) instead of every card in the list paying
          // for an extra fetch it might not need.
          feedUrl: typeof podcast.feedUrl === 'string' ? podcast.feedUrl : null,
          trackCount: typeof podcast.trackCount === 'number' ? podcast.trackCount : null,
          genres: Array.isArray(podcast.genres) ? podcast.genres.filter((g) => typeof g === 'string') : [],
          matchedTags: new Set([podcast.matchedTag]),
        });
      }
    }
  }

  const podcasts = [...byFeed.values()]
    .map((p) => ({ ...p, matchedTags: [...p.matchedTags] }))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 24);

  return { podcasts };
});

// The show's own synopsis, for the podcast detail screen — pulled from its
// RSS feed on demand (called once per detail-screen visit, not for every
// card in a list) since the Search API result has no description field.
function extractFirstTag(xml, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = re.exec(xml);
  if (!match) return '';
  // Show descriptions are usually CDATA-wrapped, and may embed their own
  // HTML markup inside that — unwrap the CDATA before the usual
  // decode-then-strip pass.
  const cdataMatch = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(match[1]);
  return stripHtml(cdataMatch ? cdataMatch[1] : match[1]);
}

exports.getPodcastDescription = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const feedUrl = typeof request.data?.feedUrl === 'string' ? request.data.feedUrl : '';
  if (!feedUrl) {
    throw new HttpsError('invalid-argument', 'Missing feedUrl.');
  }
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) return { description: '' };
    const xml = await res.text();
    // Scoped to the channel (show-level), not the first <item> (an
    // episode) — a feed's very first <description> tag is usually the
    // show's own, but bounding the search to before the first <item>
    // guards against a feed ordering things differently.
    const firstItemIndex = xml.search(/<item\b/i);
    const channelXml = firstItemIndex === -1 ? xml : xml.slice(0, firstItemIndex);
    const description = extractFirstTag(channelXml, 'description') || extractFirstTag(channelXml, 'itunes:summary');
    return { description };
  } catch {
    return { description: '' };
  }
});

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // Numeric entities (&#8217;, &#038;, &#x2019; etc.) — MedlinePlus's XML
    // doesn't use these, but WordPress content (TACA's events) does, for
    // ordinary punctuation like apostrophes and ampersands.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

// MedlinePlus's search results embed <span class="qt0">…</span> highlight
// markup around matched terms right inside otherwise-plain-text fields —
// and, in the live response, that markup itself is HTML-entity-escaped
// (&lt;span…&gt;) rather than literal. Decoding entities has to happen
// BEFORE stripping tags, or the escaped tags survive the strip untouched
// and only turn back into literal (now-unstripped) tags once decoded.
function stripHtml(str) {
  return decodeXmlEntities(str)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTaggedContent(body, name) {
  const re = new RegExp(`<content\\s+name="${name}"[^>]*>([\\s\\S]*?)<\\/content>`, 'i');
  const m = re.exec(body);
  return m ? stripHtml(m[1]) : '';
}

// Regex extraction rather than a structured XML parse — see stripHtml's
// comment for why.
function extractMedlinePlusDocuments(xml) {
  const docs = [];
  const docRegex = /<document\b[^>]*\burl="([^"]*)"[^>]*>([\s\S]*?)<\/document>/g;
  let match;
  while ((match = docRegex.exec(xml))) {
    const url = decodeXmlEntities(match[1]);
    const body = match[2];
    const title = extractTaggedContent(body, 'title');
    // snippet is the short, search-term-highlighted excerpt (good for a
    // card's subtitle); FullSummary is the topic's actual full summary
    // (good for the detail screen) — kept separate instead of collapsing
    // into one field, with each falling back to the other if MedlinePlus
    // only returned one of them for a given result.
    const snippet = extractTaggedContent(body, 'snippet');
    const fullSummary = extractTaggedContent(body, 'FullSummary');
    if (url && title) {
      docs.push({ url, title, snippet: snippet || fullSummary, summary: fullSummary || snippet });
    }
  }
  return docs;
}

// Powers "Articles & guides" on the Resources screen. Uses the National
// Library of Medicine's MedlinePlus Web Service — free, no API key or
// registration required, updated daily, and every result links to a
// vetted, government-maintained health topic page rather than an
// arbitrary parenting blog. Per MedlinePlus's terms, results must be
// attributed to MedlinePlus — the client shows that attribution in its own
// copy alongside each result, not just in this comment.
exports.getHealthResources = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const meSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = meSnap.data() ?? {};
  const neurodivergence = [
    ...new Set(
      (Array.isArray(me.children) ? me.children : []).flatMap((c) =>
        Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
      )
    ),
  ];
  // Same fallback reasoning as getPodcastSuggestions above — no tags on
  // file shouldn't mean a permanently empty section.
  const searchTags = neurodivergence.length ? neurodivergence : ['neurodevelopmental disorders'];

  const resultsPerTag = await Promise.all(
    searchTags.map(async (tag) => {
      try {
        const res = await fetch(
          `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(tag)}&retmax=5`
        );
        if (!res.ok) return [];
        const xml = await res.text();
        return extractMedlinePlusDocuments(xml).map((doc) => ({ ...doc, matchedTag: tag }));
      } catch {
        return [];
      }
    })
  );

  // A topic can turn up under more than one tag's search — dedupe by url,
  // rank higher the more of the child's tags it matched.
  const byUrl = new Map();
  for (const list of resultsPerTag) {
    for (const doc of list) {
      const existing = byUrl.get(doc.url);
      if (existing) {
        existing.matchedTags.add(doc.matchedTag);
      } else {
        byUrl.set(doc.url, {
          url: doc.url,
          title: doc.title,
          snippet: doc.snippet,
          summary: doc.summary,
          matchedTags: new Set([doc.matchedTag]),
        });
      }
    }
  }

  const resources = [...byUrl.values()]
    .map((r) => ({ ...r, matchedTags: [...r.matchedTags] }))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 15);

  return { resources };
});

// Curated blogs written by/for neurodivergent parents — pulled directly
// from each site's own public RSS feed (no API key, same "read a feed you
// don't control" approach as TACA's events above, just RSS instead of a
// JSON REST endpoint). Picked for being written from lived experience as
// an autistic/ADHD/neurodivergent parent, not just clinical content.
const BLOG_SOURCES = [
  { name: 'NeuroClastic', feedUrl: 'https://neuroclastic.com/feed' },
  { name: 'ADDitude', feedUrl: 'https://www.additudemag.com/category/blog/feed/' },
  { name: 'Neurodiverging', feedUrl: 'https://www.neurodiverging.com/feed/' },
  { name: 'Beautifully Complex', feedUrl: 'https://parentingadhdandautism.com/feed/' },
];

// Regex extraction rather than a structured XML parse — see stripHtml's
// comment for why. Each <item> is one blog post; a feed's <description> is
// often the full HTML post body, so it's stripped and capped down to a
// plain-text snippet rather than shown as-is.
function extractRssItems(xml) {
  const items = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml))) {
    const body = match[1];
    const title = extractFirstTag(body, 'title');
    const link = extractFirstTag(body, 'link');
    const pubDate = extractFirstTag(body, 'pubDate');
    const description = extractFirstTag(body, 'description');
    if (title && link) {
      items.push({ title, link, pubDate, description });
    }
  }
  return items;
}

// Powers the "Blog" filter on the Resources screen. Unlike
// getHealthResources/getPodcastSuggestions, there's no per-user tag search
// here — a blog's own RSS feed only ever offers its latest posts, not a
// keyword search — so this returns the same merged, most-recent-first feed
// to every caller.
exports.getBlogFeed = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const resultsPerSource = await Promise.all(
    BLOG_SOURCES.map(async (source) => {
      try {
        const res = await fetch(source.feedUrl);
        if (!res.ok) return [];
        const xml = await res.text();
        return extractRssItems(xml).map((item) => ({ ...item, source: source.name }));
      } catch {
        return [];
      }
    })
  );

  const posts = resultsPerSource
    .flat()
    .map((item) => {
      const parsed = item.pubDate ? new Date(item.pubDate) : null;
      const publishedAt = parsed && !isNaN(parsed.getTime()) ? parsed : null;
      const snippet = item.description.length > 220 ? `${item.description.slice(0, 220).trim()}…` : item.description;
      return { url: item.link, title: item.title, snippet, source: item.source, publishedAt };
    })
    // Most recent first; a post with an unparseable date sorts last rather
    // than clustering at the front under an implicit "now".
    .sort((a, b) => {
      if (!a.publishedAt) return 1;
      if (!b.publishedAt) return -1;
      return b.publishedAt - a.publishedAt;
    })
    .slice(0, 20)
    .map((p) => ({ ...p, publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null }));

  return { posts };
});

// Neurodivergent-specialty retailers confirmed to expose Shopify's public
// predictive-search endpoint — the same JSON API their own on-site search
// bar calls, so results are searchable by keyword without needing a
// private Storefront API token. Several other candidates (National Autism
// Resources, Different Roads to Learning, Stimtastic, ARK Therapeutic,
// TheraSpecs) all 404 on this endpoint at the domain guessed for them and
// were dropped.
const PRODUCT_SOURCES = [
  { name: 'Fun and Function', base: 'https://funandfunction.com' },
  { name: 'Harkla', base: 'https://www.harkla.co' },
  { name: 'Chewigem', base: 'https://chewigem.com' },
];

// Shopify's predictive-search endpoint matches literally — a plain word
// like "sensory" returns real results (verified via a one-off diagnostic),
// but the long descriptive labels used during onboarding
// (app/onboarding/child.tsx's NEURODIVERGENCE_OPTIONS) mostly don't appear
// verbatim anywhere in the catalog, so they returned nothing. Map each one
// to a short, retail-friendly keyword instead; anything not listed here
// (a future onboarding option, say) falls back to the label as-is.
const PRODUCT_SEARCH_TERMS = {
  Autism: 'autism',
  ADHD: 'adhd',
  Dyslexia: 'reading',
  Dyspraxia: 'motor skills',
  'Sensory processing differences': 'sensory',
  'Communication differences': 'communication',
  Anxiety: 'calming',
  'Intellectual/developmental disability': 'developmental',
  // No product-relevant keyword for these — skip rather than search for
  // something meaningless like "prefer not to say".
  'Still figuring it out': null,
  'Prefer not to say': null,
};

// Powers "Products" on the Discover tab. Searches each retailer's
// predictive-search endpoint per neurodivergence tag, so results lean
// toward what's actually relevant to the child's needs rather than a
// generic marketplace with no vetting.
exports.getRecommendedProducts = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const meSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = meSnap.data() ?? {};
  const neurodivergence = [
    ...new Set(
      (Array.isArray(me.children) ? me.children : []).flatMap((c) =>
        Array.isArray(c?.neurodivergence) ? c.neurodivergence : []
      )
    ),
  ];
  // Same fallback reasoning as getPodcastSuggestions above — no tags on
  // file (or only unmapped ones like "Prefer not to say") shouldn't mean a
  // permanently empty section. But unlike the podcast/article searches
  // (broad catalogs), Fun and Function/Harkla are small boutique stores —
  // even a real, mapped tag can have thin or zero coverage there (e.g.
  // "reading" for Dyslexia). So a generic "sensory" search always runs
  // alongside whatever the child's tags produce, not only when there are
  // no usable tags at all, to keep the section from coming back empty
  // just because one specific term has nothing in stock.
  const mappedSearches = neurodivergence
    .map((tag) => ({ tag, term: tag in PRODUCT_SEARCH_TERMS ? PRODUCT_SEARCH_TERMS[tag] : tag }))
    .filter((s) => s.term);
  const searches = mappedSearches.some((s) => s.term === 'sensory')
    ? mappedSearches
    : [...mappedSearches, { tag: 'General', term: 'sensory' }];

  const resultsPerSearch = await Promise.all(
    PRODUCT_SOURCES.flatMap((source) =>
      searches.map(async ({ tag, term }) => {
        try {
          const res = await fetch(
            `${source.base}/search/suggest.json?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=5&resources[options][unavailable_products]=hide`
          );
          if (!res.ok) return [];
          const data = await res.json();
          const items = data?.resources?.results?.products;
          if (!Array.isArray(items)) return [];
          // Harkla's catalog also lists Thinkific-hosted courses alongside
          // physical products — not something you can add to a playdate
          // toy bag, so filter those out.
          return items.filter((item) => item?.vendor !== 'Thinkific').map((item) => ({ item, source, tag }));
        } catch {
          return [];
        }
      })
    )
  );

  // A product can turn up under more than one tag's search — dedupe by
  // absolute URL, rank higher the more of the child's tags it matched.
  // Shopify's search response tags each product url with tracking params
  // (?_pos=…&_psq=…) that vary by query, so the same product could
  // otherwise dedupe into multiple entries depending on which search
  // surfaced it — strip those before using the url as the dedupe/favorite
  // key.
  //
  // resultsPerSearch is grouped [source][term] (every one of Fun and
  // Function's terms, then every one of Harkla's, etc.) — flattening it in
  // that order would let whichever source comes first in PRODUCT_SOURCES
  // fill the whole list below on ties (most products only match one tag,
  // and Array#sort is stable), permanently starving out any source later
  // in the array regardless of how relevant its results are. Round-robin
  // across the lists instead, so every source gets a fair turn before the
  // cap below is reached.
  const interleaved = [];
  const maxListLength = Math.max(0, ...resultsPerSearch.map((list) => list.length));
  for (let i = 0; i < maxListLength; i++) {
    for (const list of resultsPerSearch) {
      if (list[i]) interleaved.push(list[i]);
    }
  }

  const byUrl = new Map();
  for (const { item, source, tag } of interleaved) {
    if (typeof item?.url !== 'string' || typeof item?.title !== 'string') continue;
    const resolved = new URL(item.url, source.base);
    resolved.search = '';
    const url = resolved.toString();
    const existing = byUrl.get(url);
    if (existing) {
      existing.matchedTags.add(tag);
    } else {
      byUrl.set(url, {
        url,
        title: item.title,
        vendor: typeof item.vendor === 'string' ? item.vendor : source.name,
        source: source.name,
        imageUrl: typeof item.image === 'string' ? item.image : null,
        // The search response already includes each product's full HTML
        // description (item.body) — no extra fetch needed, just strip it
        // down to plain text for the product detail screen.
        description: typeof item.body === 'string' ? stripHtml(item.body) : '',
        matchedTags: new Set([tag]),
      });
    }
  }

  const products = [...byUrl.values()]
    .map((p) => ({ ...p, matchedTags: [...p.matchedTags] }))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 15);

  return { products };
});

// TACA (The Autism Community in Action) runs local support-group meetups,
// resource fairs, and webinars — real events, not a generic marketplace —
// and publishes them through a public WordPress REST API (confirmed via a
// one-off diagnostic against the deployed function; the domain isn't
// reachable from the dev sandbox this was written against). Their "event"
// post type mixes real events with volunteer paperwork/training pages that
// happen to reuse the same post type, so filtering to only entries with a
// real, parseable, future event_date is what actually separates the two —
// not just "is it in this post type."
function parseTacaEventDate(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// The structured event_venue field is just a short name ("Panera Bread") —
// the full street address, including its zip, lives inside
// content.rendered under a "Location" heading. That zip is what makes
// actual distance filtering possible (state alone is meaningless for a
// state the size of Texas or California). Regex extraction, same
// reasoning as stripHtml's comment: this is arbitrary page-builder HTML,
// not a feed meant for parsing, so a structured HTML parse buys nothing a
// page-builder template change wouldn't just as easily break.
function extractTacaLocation(html) {
  const match = /<h3[^>]*>\s*Location\s*<\/h3>([\s\S]*?)<\/div>/i.exec(html);
  if (!match) return { address: '', city: '', state: '', zip: '' };
  const address = stripHtml(match[1]);
  const cityStateZip = /([A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5})/.exec(address);
  return {
    address,
    city: cityStateZip ? cityStateZip[1].trim() : '',
    state: cityStateZip ? cityStateZip[2] : '',
    zip: cityStateZip ? cityStateZip[3] : '',
  };
}

// Same free, no-key zip lookup used client-side for zip verification (see
// lib/zipcode.ts) — reused here server-side to turn a zip into
// coordinates for distance math, for both the caller's own zip and each
// event's.
async function geocodeZip(zip) {
  if (!/^\d{5}$/.test(zip)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    const lat = parseFloat(place?.latitude);
    const lon = parseFloat(place?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

// Same free lookup as geocodeZip, but for sources (like GGRC's Events
// Calendar API below) that hand back a venue's city/state without a zip.
// Zippopotam supports a city-level path the same way it supports a zip —
// coarser than an exact zip, but plenty precise for a 50-mile driving-
// distance filter.
async function geocodeCityState(city, state) {
  if (!city || !state) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${state}/${encodeURIComponent(city)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    const lat = parseFloat(place?.latitude);
    const lon = parseFloat(place?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

function haversineMiles(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Regional/local orgs that run WordPress's "The Events Calendar" plugin,
// which exposes its own dedicated REST API — structured start/end dates, a
// venue object with city/state, and an explicit is_virtual flag, all
// without an API key. A cleaner shape than TACA's generic post type +
// regex-scraped address (see extractTacaLocation above), and the same
// zero-key, no-approval pattern as PRODUCT_SOURCES — new orgs can be added
// here once confirmed (by hitting <base>/wp-json/tribe/events/v1/events)
// to run the same plugin.
const TRIBE_EVENT_SOURCES = [
  { name: 'Golden Gate Regional Center', base: 'https://www.ggrc.org' },
  { name: 'Regional Center of the East Bay', base: 'https://rceb.org' },
  { name: 'Support for Families of Children with Disabilities', base: 'https://www.supportforfamilies.org' },
];

// Without an explicit date window, the API's default 2-year range plus a
// fixed per_page meant "first N events" — for a source with hundreds of
// recurring monthly support groups (e.g. Support for Families), that first
// page never even reached a month out, silently hiding everything past it.
// Bounding to a 90-day window keeps the request cheap while actually
// covering "coming up soon," which is what this section promises.
const TRIBE_EVENTS_WINDOW_DAYS = 90;

function formatTribeDate(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function fetchTribeEvents(source) {
  try {
    const now = new Date();
    const end = new Date(now.getTime() + TRIBE_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      per_page: '100',
      start_date: formatTribeDate(now),
      end_date: formatTribeDate(end),
    });
    const res = await fetch(`${source.base}/wp-json/tribe/events/v1/events?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

// A driving day trip, not "somewhere in the same state" — nobody's
// driving 500 miles for a coffee talk.
const EVENT_RADIUS_MILES = 50;

// Powers the "Events" section on the Discover tab, merging TACA (national)
// with TRIBE_EVENT_SOURCES (regional/local orgs). In-person events within
// driving distance lead, closest first; virtual events — no parseable
// address for TACA, or an explicit is_virtual flag from a Tribe source —
// always show, since distance is meaningless for those. Without a zip on
// file yet, falls back to showing everything soonest-first rather than
// hiding every in-person event for lack of a distance to compare.
exports.getNearbyEvents = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const meSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
  const me = meSnap.data() ?? {};
  const myZip = typeof me.zipCode === 'string' ? me.zipCode : '';
  const myLocation = myZip ? await geocodeZip(myZip) : null;

  // Sorted by most-recently-modified rather than paging through all ~100+
  // historical entries — TACA republishes their recurring meetups close to
  // the date, so the actively-maintained (i.e. actually upcoming) events
  // cluster at the front of this ordering. 5 pages (150 posts) comfortably
  // covers that while still leaving room for an upcoming, further-out
  // event that hasn't been touched recently to show up.
  const [pages, tribeResults] = await Promise.all([
    Promise.all(
      [1, 2, 3, 4, 5].map(async (page) => {
        try {
          const res = await fetch(
            `https://tacanow.org/wp-json/wp/v2/event?per_page=30&page=${page}&orderby=modified&order=desc&_embed=wp:featuredmedia`
          );
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data) ? data : [];
        } catch {
          return [];
        }
      })
    ),
    Promise.all(TRIBE_EVENT_SOURCES.map(fetchTribeEvents)),
  ]);

  const now = Date.now();
  const tacaCandidates = pages
    .flat()
    .map((e) => {
      const eventDate = parseTacaEventDate(e.event_date);
      const location = extractTacaLocation(e.content?.rendered ?? '');
      const media = e._embedded?.['wp:featuredmedia']?.[0];
      return {
        id: `taca-${e.id}`,
        source: 'The Autism Community in Action (TACA)',
        title: typeof e.title?.rendered === 'string' ? decodeXmlEntities(e.title.rendered) : '',
        link: typeof e.link === 'string' ? e.link : '',
        eventDate,
        venue: typeof e.event_venue === 'string' ? e.event_venue : '',
        imageUrl: typeof media?.source_url === 'string' ? media.source_url : null,
        categories: (Array.isArray(e.class_list) ? e.class_list : [])
          .filter((c) => typeof c === 'string' && c.startsWith('event_category-'))
          .map((c) => c.replace('event_category-', '').replace(/-/g, ' ')),
        ...location,
      };
    })
    .filter((e) => e.title && e.link && e.eventDate && e.eventDate.getTime() >= now);

  const tribeCandidates = tribeResults
    .flatMap((events, i) => {
      const source = TRIBE_EVENT_SOURCES[i];
      return events.map((e) => {
        const eventDate =
          typeof e.utc_start_date === 'string' ? new Date(`${e.utc_start_date.replace(' ', 'T')}Z`) : null;
        const venue = e.venue?.venue;
        return {
          id: `${source.name}-${e.id}`,
          source: source.name,
          title: typeof e.title === 'string' ? decodeXmlEntities(e.title) : '',
          link: typeof e.url === 'string' ? e.url : '',
          eventDate,
          venue: typeof venue === 'string' ? venue : '',
          imageUrl: typeof e.image?.url === 'string' ? e.image.url : null,
          categories: (Array.isArray(e.categories) ? e.categories : [])
            .map((c) => (typeof c?.name === 'string' ? c.name : ''))
            .filter(Boolean),
          isVirtual: Boolean(e.is_virtual),
          address: typeof e.venue?.address === 'string' ? e.venue.address : '',
          city: typeof e.venue?.city === 'string' ? e.venue.city : '',
          state: typeof e.venue?.state === 'string' ? e.venue.state : '',
        };
      });
    })
    .filter((e) => e.title && e.link && e.eventDate && e.eventDate.getTime() >= now);

  const candidates = [...tacaCandidates, ...tribeCandidates];

  // Geocode each candidate's location — deduped, since recurring meetups
  // often reuse the same venue — to get an actual driving-relevant
  // distance. TACA candidates only ever carry a zip (or nothing);
  // tribeCandidates may carry a zip-less city/state instead, so this tries
  // a zip first and falls back to city/state.
  const locationCache = new Map();
  const withDistance = await Promise.all(
    candidates.map(async (e) => {
      if (e.isVirtual || (!e.zip && !(e.city && e.state))) {
        // No parseable address at all (or explicitly virtual) — a
        // webinar, which has no meaningful distance and always shows.
        const { zip, city, state, isVirtual, ...rest } = e;
        return { ...rest, city: city ?? '', state: state ?? '', distanceMiles: null, virtual: true };
      }
      const key = e.zip ? `zip:${e.zip}` : `city:${e.city}|${e.state}`;
      if (!locationCache.has(key)) {
        locationCache.set(key, e.zip ? geocodeZip(e.zip) : geocodeCityState(e.city, e.state));
      }
      const eventLocation = await locationCache.get(key);
      const distanceMiles = myLocation && eventLocation ? haversineMiles(myLocation, eventLocation) : null;
      const { zip, isVirtual, ...rest } = e;
      return { ...rest, distanceMiles, virtual: false };
    })
  );

  // distanceMiles is null both for genuinely virtual events AND for an
  // in-person event whose address failed to geocode (a transient lookup
  // failure, or a zip the parser mis-extracted) — either way, "we don't
  // know the distance" should fall back to showing it, same as the
  // no-zip-on-file case just above, rather than silently dropping an
  // event that just couldn't be measured.
  const filtered = myLocation
    ? withDistance.filter((e) => e.distanceMiles === null || e.distanceMiles <= EVENT_RADIUS_MILES)
    : withDistance;

  // Soonest first, full stop — a single merged timeline across every
  // source reads as coherent; sorting virtual events after in-person ones
  // (or grouping by distance first) fractures that into disconnected
  // date-sorted clusters instead of one chronological list.
  const ranked = filtered.sort((a, b) => a.eventDate - b.eventDate);

  // With 4 merged sources, a cap this low used to mean weeks of near-term
  // recurring support-group meetings alone could fill every slot and push
  // anything a month or more out (e.g. October) off the list entirely,
  // even though it was fetched. 60 leaves real headroom for that spread.
  return {
    events: ranked.slice(0, 60).map(({ eventDate, ...e }) => ({ ...e, eventDate: eventDate.toISOString() })),
  };
});


