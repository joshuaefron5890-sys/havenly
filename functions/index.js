const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

// An invited family member (co-parent, aunt, etc. — see sendFamilyInvite
// below) signs in with their OWN Firebase Auth uid, but every family's data
// lives at users/{ownerUid}, the uid of whoever originally created the
// account. familyMembers/{authUid} is the mapping from "whoever is actually
// signed in" to "whose family data they should see" — a doc only exists
// here for an invited member, so an owner (the overwhelmingly common case)
// resolves to themselves with zero extra reads beyond the miss.
async function resolveFamilyUid(authUid) {
  const memberSnap = await admin.firestore().collection('familyMembers').doc(authUid).get();
  const familyUid = memberSnap.data()?.familyUid;
  return typeof familyUid === 'string' && familyUid ? familyUid : authUid;
}

// --- Clusters -----------------------------------------------------------
//
// A "cluster" is a metro-level community (Bay Area today; eventually LA,
// NYC, etc.) — matching/discovery, community announcements, and
// community-contributed content are all scoped to one, so a family only
// ever sees other families/content from their own city, not a future
// cluster on the other side of the country. Curated EXTERNAL sources
// (TACA events, iTunes podcasts, Shopify products, MedlinePlus/RSS
// articles) are deliberately NOT scoped here — they're either already
// self-localizing via zip-radius distance math (TACA) or genuinely
// national/virtual (podcasts, shopping, today's article sources), so
// cluster-gating them would add complexity without a real benefit. The
// one exception is TRIBE_EVENT_SOURCES below (regional orgs like Golden
// Gate Regional Center) — those really are cluster-specific, tagged
// individually where they're defined.
//
// No Firestore collection for this (yet) — deliberately a hardcoded
// registry, matching SUPER_ADMIN_EMAILS' own reasoning elsewhere in this
// file: this sandbox has no way to seed/manage a Firestore collection
// directly, and a single-entry registry doesn't need one yet. Move this
// to a real `clusters/{clusterId}` collection (with its own admin-managed
// admin list) once there's an actual second cluster and a reason to edit
// this without a deploy.
const CLUSTERS = {
  'bay-area': {
    name: 'Bay Area',
    admins: ['admin@haven-ly.com', 'joshuaefron5890@gmail.com'],
  },
};
const DEFAULT_CLUSTER_ID = 'bay-area';

// Every family gets auto-assigned a cluster from their onboarding zip —
// no user-facing picker, since there's only one real answer today. Always
// returns DEFAULT_CLUSTER_ID for now; this is the one place real
// zip-range/city matching logic goes once a second cluster exists (e.g. a
// zip-prefix table, falling back to DEFAULT_CLUSTER_ID for anything
// unmatched rather than leaving a family clusterless).
function clusterForZip(zip) {
  return DEFAULT_CLUSTER_ID;
}

// Existing families onboarded before clusters existed have no clusterId
// on file at all — treated as DEFAULT_CLUSTER_ID (today's only cluster)
// rather than excluded from matching/community content entirely.
function clusterIdOf(userData) {
  const clusterId = userData?.clusterId;
  return typeof clusterId === 'string' && CLUSTERS[clusterId] ? clusterId : DEFAULT_CLUSTER_ID;
}

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
    // 'invalid_grant' is Google's code for a refresh token that's expired
    // or been revoked (e.g. the user removed Haven.ly's access in their
    // Google account) — surfaced as the same failed-precondition every
    // caller here already uses for "never connected," so the client shows
    // its existing reconnect UI instead of Google's raw OAuth error text.
    if (json.error === 'invalid_grant') {
      throw new HttpsError('failed-precondition', 'Google Calendar access has expired — please reconnect.');
    }
    throw new HttpsError('internal', 'Could not refresh Google access token.');
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

// Sitter equivalent of storeGoogleCalendarRefreshToken/getGoogleFreeBusy
// above — same OAuth token, same Google API call, just scoped to the
// sitters collection instead of users, since a sitter's profile lives
// there, not in users/{uid} (which represents a family, not an individual
// sitter account). Kept as separate functions rather than teaching the
// family versions to branch on account type, so a sitter connecting their
// calendar can never accidentally read or write a family's users/{uid}
// doc, and vice versa.
exports.connectSitterGoogleCalendar = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const code = typeof request.data?.code === 'string' ? request.data.code : '';
  if (!code) {
    throw new HttpsError('invalid-argument', 'Missing authorization code.');
  }
  const native = request.data?.native === true;

  const tokenJson = await exchangeGoogleCode(code, googleClientSecret.value(), native ? '' : 'postmessage');
  if (!tokenJson.refresh_token) {
    throw new HttpsError('unknown', 'Google did not return a refresh token.');
  }

  await admin
    .firestore()
    .collection('sitters')
    .doc(request.auth.uid)
    .set(
      {
        googleCalendarConnected: true,
        googleCalendar: {
          refreshToken: tokenJson.refresh_token,
          connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

  return { connected: true };
});

exports.getSitterGoogleFreeBusy = onCall({ secrets: [googleClientSecret] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const timeMin = typeof request.data?.timeMin === 'string' ? request.data.timeMin : '';
  const timeMax = typeof request.data?.timeMax === 'string' ? request.data.timeMax : '';
  if (!timeMin || !timeMax) {
    throw new HttpsError('invalid-argument', 'timeMin and timeMax are required.');
  }

  const sitterSnap = await admin.firestore().collection('sitters').doc(request.auth.uid).get();
  const refreshToken = sitterSnap.data()?.googleCalendar?.refreshToken;
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

// Lets a sitter fully undo connectSitterGoogleCalendar — the "Disconnect"
// action on app/(sitter)/availability.tsx, for someone who'd rather go back
// to marking availability manually. googleCalendar (the refresh token) is
// pinned out of every client write in firestore.rules, so clearing it has
// to go through here rather than a direct saveMySitterProfile call. Best-
// effort revokes the token with Google directly, in addition to deleting
// it from Firestore, so it can't be replayed even if it somehow leaked —
// but a revoke failure doesn't block the disconnect itself, since the
// stored copy is being deleted either way.
exports.disconnectSitterGoogleCalendar = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const sitterRef = admin.firestore().collection('sitters').doc(request.auth.uid);
  const sitterSnap = await sitterRef.get();
  const refreshToken = sitterSnap.data()?.googleCalendar?.refreshToken;

  if (refreshToken) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      console.error(`Could not revoke Google token for sitter ${request.auth.uid}`, err);
    }
  }

  await sitterRef.set(
    {
      googleCalendarConnected: false,
      googleCalendarSyncEnabled: false,
      googleCalendar: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  return { disconnected: true };
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

// --- Push notifications -------------------------------------------------
//
// toUid/fromUid/participantUids on playdateProposals and conversations are
// family uids (see resolveFamilyUid's comment) — a shared inbox everyone
// in that family sees. Unlike sendNotificationEmail above (which still
// only ever emails the family's original owner — a real, separate gap,
// not addressed here), a push genuinely needs to reach every device of
// every member who accepted an invite into that family, since any of them
// could be the one with the app installed and notifications on. Each
// person's own Expo push token(s) are saved to pushTokens/{their own
// personal auth uid} by lib/pushNotifications.ts — this resolves a family
// uid back out to every personal uid that belongs to it (the owner, via
// resolveFamilyUid's own convention of "no familyMembers doc = owns their
// own uid," plus every accepted member) and fans out to all of their
// tokens at once.
async function personalUidsForFamily(familyUid) {
  const membersSnap = await admin.firestore().collection('familyMembers').where('familyUid', '==', familyUid).get();
  return [familyUid, ...membersSnap.docs.map((doc) => doc.id)];
}

async function pushTokensForFamily(familyUid) {
  const personalUids = await personalUidsForFamily(familyUid);
  const snaps = await Promise.all(personalUids.map((uid) => admin.firestore().collection('pushTokens').doc(uid).get()));
  return snaps.flatMap((snap) => (Array.isArray(snap.data()?.tokens) ? snap.data().tokens : []));
}

// Expo's push service (exp.host) needs no API key for a basic send like
// this — it relays on to APNs/FCM using whatever credentials were
// uploaded to the EAS project itself. Best-effort: a bad/expired token in
// the list shouldn't block the others, so failures are logged, not
// thrown — same reasoning as sendNotificationEmail's own try-and-log.
async function sendExpoPush(tokens, title, body, data) {
  const validTokens = tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken'));
  if (!validTokens.length) return;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(validTokens.map((to) => ({ to, title, body, data, sound: 'default' }))),
    });
    if (!res.ok) {
      console.error(`Expo push send failed (${res.status}): ${await res.text().catch(() => '')}`);
    }
  } catch (err) {
    console.error('Expo push send threw:', err?.message ?? err);
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

    await Promise.all([
      sendNotificationEmail(proposal.toUid, `${family} sent you a playdate invite`, lines.join('\n')),
      pushTokensForFamily(proposal.toUid).then((tokens) =>
        sendExpoPush(tokens, `${family} sent you a playdate invite`, details || 'Tap to view and respond.', {
          url: `/proposal/${event.params.proposalId}`,
        })
      ),
    ]);
  }
);

// Fires when the recipient responds — the proposer might not have the app
// open to see it otherwise. Only ever fires on a genuine proposed ->
// accepted/declined transition, not on the creator's own later cancel
// (status update rules restrict who can move a proposal to which status,
// but this still re-checks the specific transition itself rather than
// trusting "status changed" alone).
exports.pushOnPlaydateResponded = onDocumentUpdated('playdateProposals/{proposalId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || before.status !== 'proposed') return;
  if (after.status !== 'accepted' && after.status !== 'declined') return;
  if (typeof after.fromUid !== 'string' || typeof after.toUid !== 'string') return;

  const toSnap = await admin.firestore().collection('users').doc(after.toUid).get();
  const family = familyLabelFor(toSnap.data()?.lastName);
  const dateLabel = typeof after.dateLabel === 'string' ? after.dateLabel : '';
  const verb = after.status === 'accepted' ? 'accepted' : 'declined';

  const tokens = await pushTokensForFamily(after.fromUid);
  await sendExpoPush(tokens, `${family} ${verb} your playdate invite`, dateLabel || 'Tap to view.', {
    url: `/proposal/${event.params.proposalId}`,
  });
});

// Fires when the assigned sitter confirms or declines their own assignment
// (lib/playdateProposals.ts's respondAsSitter — firestore.rules pins that
// write to the sitter's own uid). Notifies both families and the sitter
// either way; on confirm, also puts the playdate on the sitter's own
// Google Calendar if they opted into the write scope (the sync toggle in
// app/(sitter)/availability.tsx's Connect flow) — same
// googleCalendarSyncEnabled gate createPlaydateCalendarEvents uses for
// families, just read off sitters/{uid} instead of users/{uid}.
//
// pushTokensForFamily/sendNotificationEmail work unmodified for a sitter
// uid too: personalUidsForFamily(sitterUid) queries familyMembers for a
// (nonexistent) family and falls back to just [sitterUid], landing on
// pushTokens/{sitterUid} exactly as intended; sendNotificationEmail reads
// the email straight off Firebase Auth, which every sitter has same as
// any family member.
exports.notifyOnSitterConfirmation = onDocumentUpdated(
  { document: 'playdateProposals/{proposalId}', secrets: [resendApiKey, googleClientSecret] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const beforeStatus = before?.sitter?.confirmationStatus;
    const afterStatus = after?.sitter?.confirmationStatus;
    if (!after?.sitter || beforeStatus !== 'pending') return;
    if (afterStatus !== 'confirmed' && afterStatus !== 'declined') return;

    const sitterUid = after.sitter.uid;
    if (typeof sitterUid !== 'string' || !sitterUid) return;

    const dateLabel = typeof after.dateLabel === 'string' ? after.dateLabel : '';
    const sitterName = typeof after.sitter.name === 'string' ? after.sitter.name : 'Your sitter';
    const verb = afterStatus === 'confirmed' ? 'confirmed' : 'declined';
    const proposalUrl = `${APP_BASE_URL}/proposal/${event.params.proposalId}`;
    // A sitter has no familyUid — app/proposal/[id].tsx assumes family
    // auth context and breaks for them, so their links go to their own
    // Playdates screen instead, not the family-facing proposal detail.
    const sitterPlaydatesUrl = `${APP_BASE_URL}/playdates`;
    const familyUids = [after.fromUid, after.toUid].filter((uid) => typeof uid === 'string' && uid);

    const familyTitle = `${sitterName} ${verb} the playdate`;
    const familyText = [
      `${sitterName} ${verb} their sitter assignment for your playdate on Haven.ly${dateLabel ? `: ${dateLabel}` : '.'}`,
      '',
      `View details: ${proposalUrl}`,
    ].join('\n');
    const sitterTitle = afterStatus === 'confirmed' ? 'Playdate confirmed' : 'Playdate declined';
    const sitterText = [
      `You ${verb} this playdate on Haven.ly${dateLabel ? `: ${dateLabel}` : '.'}`,
      '',
      `View your playdates: ${sitterPlaydatesUrl}`,
    ].join('\n');

    await Promise.all([
      ...familyUids.flatMap((uid) => [
        sendNotificationEmail(uid, familyTitle, familyText),
        pushTokensForFamily(uid).then((tokens) =>
          sendExpoPush(tokens, familyTitle, dateLabel || 'Tap to view.', { url: `/proposal/${event.params.proposalId}` })
        ),
      ]),
      sendNotificationEmail(sitterUid, sitterTitle, sitterText),
      pushTokensForFamily(sitterUid).then((tokens) =>
        sendExpoPush(tokens, sitterTitle, dateLabel || 'Tap to view.', { url: '/playdates' })
      ),
    ]);

    if (afterStatus !== 'confirmed') return;

    try {
      const sitterSnap = await admin.firestore().collection('sitters').doc(sitterUid).get();
      const sitterData = sitterSnap.data();
      if (!sitterData?.googleCalendarSyncEnabled || !sitterData?.googleCalendar?.refreshToken) {
        console.log(`Skipping calendar event for sitter ${sitterUid}: no eligible Google connection (sync enabled).`);
        return;
      }
      const { startIso, endIso, venue } = derivePlaydateEventFields(after);
      if (!startIso || !endIso) return;
      await createGoogleCalendarEvent(sitterData.googleCalendar.refreshToken, googleClientSecret.value(), {
        eventId: googleEventIdFor(event.params.proposalId, sitterUid),
        summary: 'Haven.ly playdate (sitting)',
        location: venue,
        startIso,
        endIso,
      });
    } catch (err) {
      console.error(`Could not create playdate calendar event for sitter ${sitterUid}`, err);
    }
  }
);

// Fires when a sitter is newly assigned to an accepted playdate
// (lib/playdateProposals.ts's addSitterToPlaydate, called from
// app/find-sitter.tsx's "Add to Playdate") — notifies them by email and
// push that a family is waiting on their confirmation. Fires on a genuine
// new-or-different assignment: a brand-new sitter.uid, a reassignment to a
// different sitter (app/proposal/[id].tsx's "Change sitter"), or the same
// sitter re-added after they'd already confirmed/declined (their status
// resets to 'pending', so they need to be told again) — but not a no-op
// re-save of the same still-pending sitter.
exports.notifyOnSitterAssigned = onDocumentUpdated(
  { document: 'playdateProposals/{proposalId}', secrets: [resendApiKey] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after?.sitter || after.sitter.confirmationStatus !== 'pending') return;

    const sitterUid = after.sitter.uid;
    if (typeof sitterUid !== 'string' || !sitterUid) return;

    const sameSitterStillPending = before?.sitter?.uid === sitterUid && before?.sitter?.confirmationStatus === 'pending';
    if (sameSitterStillPending) return;

    const dateLabel = typeof after.dateLabel === 'string' ? after.dateLabel : '';
    const venue = typeof after.venue === 'string' ? after.venue : '';
    const details = [dateLabel, venue].filter(Boolean).join(' at ');
    const sitterPlaydatesUrl = `${APP_BASE_URL}/playdates`;

    const title = 'New playdate request';
    const text = [
      `A family on Haven.ly would like you to sit for a playdate${details ? `: ${details}` : '.'}`,
      '',
      `Confirm or decline: ${sitterPlaydatesUrl}`,
    ].join('\n');

    await Promise.all([
      sendNotificationEmail(sitterUid, title, text),
      pushTokensForFamily(sitterUid).then((tokens) => sendExpoPush(tokens, title, details || 'Tap to respond.', { url: '/playdates' })),
    ]);
  }
);

// Fires when a family cancels an already-assigned sitter
// (lib/playdateProposals.ts's removeSitterFromPlaydate, called from
// app/proposal/[id].tsx's "Cancel" confirmation) — tells the removed
// sitter so their pending/confirmed request doesn't just silently vanish,
// and cleans up any Google Calendar event notifyOnSitterConfirmation
// already created for them (deleteGoogleCalendarEvent's deterministic id +
// 404-is-success handling makes this safe even if no event ever existed).
exports.notifyOnSitterRemoved = onDocumentUpdated(
  { document: 'playdateProposals/{proposalId}', secrets: [resendApiKey, googleClientSecret] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before?.sitter || after?.sitter) return;

    const sitterUid = before.sitter.uid;
    if (typeof sitterUid !== 'string' || !sitterUid) return;

    const dateLabel = typeof before.dateLabel === 'string' ? before.dateLabel : '';
    const sitterPlaydatesUrl = `${APP_BASE_URL}/playdates`;

    const title = 'Playdate request canceled';
    const text = [
      `A family on Haven.ly canceled your sitter assignment for a playdate${dateLabel ? `: ${dateLabel}` : '.'}`,
      '',
      `View your playdates: ${sitterPlaydatesUrl}`,
    ].join('\n');

    await Promise.all([
      sendNotificationEmail(sitterUid, title, text),
      pushTokensForFamily(sitterUid).then((tokens) =>
        sendExpoPush(tokens, title, dateLabel || 'Tap to view.', { url: '/playdates' })
      ),
    ]);

    try {
      const sitterSnap = await admin.firestore().collection('sitters').doc(sitterUid).get();
      const sitterData = sitterSnap.data();
      if (!sitterData?.googleCalendarSyncEnabled || !sitterData?.googleCalendar?.refreshToken) return;
      await deleteGoogleCalendarEvent(
        sitterData.googleCalendar.refreshToken,
        googleClientSecret.value(),
        googleEventIdFor(event.params.proposalId, sitterUid)
      );
    } catch (err) {
      console.error(`Could not remove playdate calendar event for sitter ${sitterUid}`, err);
    }
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

    // senderFamilyUid, not senderUid — participantUids holds family uids
    // (see lib/messages.ts), and senderUid is the specific person who
    // typed it, which only ever equals their own family's uid for an
    // account owner. Comparing participantUids against the raw personal
    // senderUid here would find "the other side" correctly only by
    // accident for an invited member sending a message.
    const senderFamilyUid = typeof message.senderFamilyUid === 'string' ? message.senderFamilyUid : message.senderUid;

    const conversationSnap = await admin.firestore().collection('conversations').doc(event.params.conversationId).get();
    const participantUids = conversationSnap.data()?.participantUids;
    const toUid = Array.isArray(participantUids) ? participantUids.find((uid) => uid !== senderFamilyUid) : null;
    if (!toUid) return;

    const fromSnap = await admin.firestore().collection('users').doc(senderFamilyUid).get();
    const family = familyLabelFor(fromSnap.data()?.lastName);

    const lines = [
      `${family} sent you a message on Haven.ly:`,
      '',
      `"${text}"`,
      '',
      `Reply: ${APP_BASE_URL}/messages/${event.params.conversationId}`,
    ];

    await Promise.all([
      sendNotificationEmail(toUid, `New message from ${family}`, lines.join('\n')),
      pushTokensForFamily(toUid).then((tokens) =>
        sendExpoPush(tokens, `New message from ${family}`, text, { url: `/messages/${event.params.conversationId}` })
      ),
    ]);
  }
);

// Fires on every community announcement — fans out to every family in
// the SAME cluster as the message, not literally everyone (see the
// CLUSTERS comment near the top of this file). Deliberately simple
// (individual email/push sends, no batching) rather than optimized for a
// per-cluster user count this app isn't at yet. Revisit if a cluster
// grows enough that a single broadcast means hundreds+ of individual
// Resend/Expo calls.
exports.notifyOnCommunityMessage = onDocumentCreated(
  { document: 'communityMessages/{messageId}', secrets: [resendApiKey] },
  async (event) => {
    const message = event.data?.data();
    const text = typeof message?.text === 'string' ? message.text.trim() : '';
    if (!text || typeof message.postedByUid !== 'string') return;
    const clusterId = clusterIdOf(message);

    // Belt-and-suspenders: firestore.rules is what actually stops a
    // non-admin from writing this doc in the first place, but this
    // trigger runs with the Admin SDK regardless of what wrote it — worth
    // one extra check before fanning out to a whole cluster, in case
    // those rules and CLUSTERS[clusterId].admins ever drift.
    const posterRecord = await admin.auth().getUser(message.postedByUid).catch(() => null);
    if (!posterRecord?.email || !CLUSTERS[clusterId]?.admins.includes(posterRecord.email)) {
      console.error(`notifyOnCommunityMessage: postedByUid ${message.postedByUid} is not an admin of ${clusterId}, skipping.`);
      return;
    }

    // Firestore can't query "clusterId is missing OR equals X" in one
    // go (a plain where('clusterId','==',...) never matches a doc where
    // the field doesn't exist at all, which is every family onboarded
    // before clusters existed) — filtered here in code instead, via the
    // same clusterIdOf fallback used everywhere else in this file, so
    // those legacy families still get DEFAULT_CLUSTER_ID announcements.
    const usersSnap = await admin.firestore().collection('users').get();
    const familyUids = usersSnap.docs.filter((doc) => clusterIdOf(doc.data()) === clusterId).map((doc) => doc.id);
    const personalUidLists = await Promise.all(familyUids.map((uid) => personalUidsForFamily(uid)));
    const personalUids = [...new Set(personalUidLists.flat())];

    const title = `Haven.ly ${CLUSTERS[clusterId]?.name ?? 'Community'}`;
    const tokenSnaps = await Promise.all(
      personalUids.map((uid) => admin.firestore().collection('pushTokens').doc(uid).get())
    );
    const tokens = tokenSnaps.flatMap((snap) => (Array.isArray(snap.data()?.tokens) ? snap.data().tokens : []));

    await Promise.all([
      ...personalUids.map((uid) => sendNotificationEmail(uid, title, text)),
      sendExpoPush(tokens, title, text, { url: '/messages/community' }),
    ]);
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

// Every kid in the family, neurodivergent or not — unlike
// ageClosenessBonus (which only ever looked at .children, the
// neurodivergent ones specifically, matching the app's core matching
// focus), a same-school connection matters just as much for a sibling as
// it does for the neurodivergent child, so this pulls from both.
function schoolsOf(family) {
  const children = Array.isArray(family.children) ? family.children : [];
  const siblings = Array.isArray(family.siblingProfiles) ? family.siblingProfiles : [];
  return [...children, ...siblings]
    .map((c) => (typeof c?.school === 'string' ? c.school.trim().toLowerCase() : ''))
    .filter(Boolean);
}

// Counted as overlapping (child, child) pairs, not just distinct shared
// schools — two of my kids at the same school as one of theirs is a
// stronger signal than either alone, and this is the one bonus below
// that's meant to reward that multiplicity rather than just "yes/no."
function schoolOverlapCount(me, target) {
  const mySchools = schoolsOf(me);
  const theirSchools = schoolsOf(target);
  let overlaps = 0;
  for (const mine of mySchools) {
    for (const theirs of theirSchools) {
      if (mine === theirs) overlaps += 1;
    }
  }
  return overlaps;
}

// Weighted, capped point system — deliberately not "% of everything that
// overlaps," which would treat a shared taste in Pokémon the same as
// shared neurodivergent experience. Heaviest weight goes to the two
// signals that actually predict a good match: shared neurodivergent
// experience (the app's core "someone who gets it" value) and shared
// goals (so a family wanting casual playdates doesn't get matched with one
// looking for a close friendship). Child age closeness, shared interests,
// and same-school kids count for less; shared availability is closer to a
// small logistics bonus than a real compatibility signal. Clamped well
// under 100 — no two real families should ever read as a "sure thing."
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
    locationBonus(me, target) +
    Math.min(schoolOverlapCount(me, target), 2) * 6;

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

// Every school any of a family's kids attend — neurodivergent child AND
// siblings, deduped case-insensitively but keeping original casing for
// display. Siblings' own records otherwise never leave the server (see
// toPublicFamily below), so this is the one derived, privacy-safe way
// their school still surfaces to another family doing a school search.
// Separate from schoolsOf (which lowercases everything for match-score
// comparison) so display casing and scoring stay independent concerns.
function publicSchoolsOf(data) {
  const children = Array.isArray(data.children) ? data.children : [];
  const siblings = Array.isArray(data.siblingProfiles) ? data.siblingProfiles : [];
  const seen = new Set();
  const schools = [];
  for (const c of [...children, ...siblings]) {
    const school = typeof c?.school === 'string' ? c.school.trim() : '';
    if (!school || seen.has(school.toLowerCase())) continue;
    seen.add(school.toLowerCase());
    schools.push(school);
  }
  return schools;
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
          grade: typeof c?.grade === 'string' ? c.grade : '',
          photoUrl: typeof c?.photoUrl === 'string' ? c.photoUrl : null,
        }))
      : [],
    schools: publicSchoolsOf(data),
  };
}

// Powers the "For You" screen's Discover tab. Runs server-side (Admin SDK)
// rather than letting the client query the users collection directly, for
// the same reason toPublicFamily exists — see its comment.
exports.getSuggestedFamilies = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const familyUid = await resolveFamilyUid(request.auth.uid);
  // 500 is a sanity ceiling, not a UX decision — same reasoning as the
  // podcast/product feeds' own caps (see getPodcastSuggestions,
  // getRecommendedProducts). Home's own "Families like you" preview still
  // only ever shows one row (client-side slice); the full list here is
  // what powers the dedicated Families tab (app/(tabs)/families.tsx).
  const [meSnap, snap] = await Promise.all([
    admin.firestore().collection('users').doc(familyUid).get(),
    admin.firestore().collection('users').where('onboardingComplete', '==', true).limit(500).get(),
  ]);
  const me = meSnap.data() ?? {};
  const myClusterId = clusterIdOf(me);

  const families = snap.docs
    .filter((doc) => doc.id !== familyUid && clusterIdOf(doc.data()) === myClusterId)
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
    admin.firestore().collection('users').doc(await resolveFamilyUid(request.auth.uid)).get(),
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

// Same field selection as toPublicFamily, plus each child's neurodivergence
// tags — deliberately NOT included in toPublicFamily (which powers
// family-to-family Discover/browsing, where a raw diagnosis list is more
// than a stranger needs; getFamilyProfile only ever shares the
// *intersection* with the viewer's own kids for that reason). A sitter
// who's actually been assigned to watch these specific kids genuinely
// needs to know what they're supporting, though, so this is a separate,
// deliberately narrower-scoped function — see getPlaydateFamilies below,
// which is the only caller and only ever returns this for a proposal the
// requester is literally the assigned sitter on.
function toSitterVisibleFamily(uid, data) {
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
          grade: typeof c?.grade === 'string' ? c.grade : '',
          photoUrl: typeof c?.photoUrl === 'string' ? c.photoUrl : null,
          neurodivergence: Array.isArray(c?.neurodivergence) ? c.neurodivergence.filter((n) => typeof n === 'string') : [],
        }))
      : [],
  };
}

// Powers app/(sitter)/playdates.tsx's family/kid detail cards. Takes a
// batch of proposal ids (one call for every card on screen, same
// batching reasoning as getFamiliesByUids) and, for each one, checks that
// the CALLER is the assigned sitter on it before including either
// family's uid in what gets fetched — a sitter only ever sees this level
// of detail for a playdate they've actually been asked to help with, not
// by browsing. Silently skips any proposal id that doesn't check out
// rather than erroring the whole batch, since a stale/removed assignment
// shouldn't break the rest of the list.
exports.getPlaydateFamilies = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const proposalIds = Array.isArray(request.data?.proposalIds)
    ? request.data.proposalIds.filter((id) => typeof id === 'string').slice(0, 50)
    : [];
  if (!proposalIds.length) {
    return { families: [] };
  }

  const proposalSnaps = await Promise.all(
    proposalIds.map((id) => admin.firestore().collection('playdateProposals').doc(id).get())
  );
  const uids = new Set();
  for (const snap of proposalSnaps) {
    const data = snap.data();
    if (data?.sitter?.uid !== request.auth.uid) continue;
    if (typeof data.fromUid === 'string') uids.add(data.fromUid);
    if (typeof data.toUid === 'string') uids.add(data.toUid);
  }
  if (!uids.size) {
    return { families: [] };
  }

  const userSnaps = await Promise.all([...uids].map((uid) => admin.firestore().collection('users').doc(uid).get()));
  const families = userSnaps.filter((snap) => snap.exists).map((snap) => toSitterVisibleFamily(snap.id, snap.data()));
  return { families };
});

// Same reasoning as toPublicFamily above — a sitter's full sitters/{uid}
// doc is only ever readable by the sitter themselves (see firestore.rules);
// every other family sees only this subset, and only ever for a sitter
// who's actually cleared (see getRecommendedSitters/getPendingSitters,
// both of which call this). Contact info is included on purpose — this is
// a directory a family is meant to actually reach out through, not a
// booking flow (no in-app payment yet).
function toPublicSitter(uid, data) {
  return {
    uid,
    name: typeof data.name === 'string' ? data.name : '',
    email: typeof data.email === 'string' ? data.email : '',
    phone: typeof data.phone === 'string' ? data.phone : '',
    bio: typeof data.bio === 'string' ? data.bio : '',
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
    specialties: Array.isArray(data.specialties) ? data.specialties.filter((s) => typeof s === 'string') : [],
    certifications: Array.isArray(data.certifications) ? data.certifications.filter((c) => typeof c === 'string') : [],
    yearsExperience: typeof data.yearsExperience === 'string' ? data.yearsExperience : '',
    hourlyRate: typeof data.hourlyRate === 'string' ? data.hourlyRate : '',
  };
}

// How many of a sitter's specialties overlap with any of the family's kids'
// neurodivergence tags — same "count pairs, not just distinct overlaps"
// reasoning as schoolOverlapCount, just one-sided (a sitter has no
// "children" of their own to compare both ways).
function sitterMatchScore(me, sitterData) {
  const myTags = new Set(
    (Array.isArray(me.children) ? me.children : []).flatMap((c) => (Array.isArray(c?.neurodivergence) ? c.neurodivergence : []))
  );
  const specialties = Array.isArray(sitterData.specialties) ? sitterData.specialties : [];
  return specialties.filter((s) => myTags.has(s)).length;
}

// Whether a sitter's own self-reported availability (SitterProfile.
// availability, keyed by 'YYYY-MM-DD' -> ['morning'|'afternoon'|'evening'])
// includes the given (dateKey, period) — the same day/period vocabulary
// lib/sitterAvailability.ts uses client-side, deliberately re-implemented
// here rather than imported, since Cloud Functions and the Expo app are
// separate bundles with no shared package between them (same reasoning as
// every other bit of duplicated domain logic in this file).
function sitterAvailableForSlot(sitterData, dateKey, period) {
  const periods = sitterData.availability?.[dateKey];
  return Array.isArray(periods) && periods.includes(period);
}

// Cluster + specialty-matched, vetted-only. Only 500 sitters fetched (same
// sanity ceiling as getSuggestedFamilies) since this is a whole-collection
// scan — cluster and vetting status are filtered in code rather than a
// compound where() clause, avoiding a composite index for what's still a
// small collection.
//
// dateKey/period are optional — when app/find-sitter.tsx is opened for a
// specific playdate, it computes them client-side (in the viewer's own
// timezone, the same one a sitter used to mark their own availability) and
// passes them through so sitters who've actually said yes for that exact
// slot sort first. Without them (or for a sitter who hasn't marked
// anything either way) this just falls back to matchScore, same as before.
exports.getRecommendedSitters = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const dateKey = typeof request.data?.dateKey === 'string' ? request.data.dateKey : null;
  const period = typeof request.data?.period === 'string' ? request.data.period : null;

  const familyUid = await resolveFamilyUid(request.auth.uid);
  const [meSnap, snap] = await Promise.all([
    admin.firestore().collection('users').doc(familyUid).get(),
    admin.firestore().collection('sitters').limit(500).get(),
  ]);
  const me = meSnap.data() ?? {};
  const myClusterId = clusterIdOf(me);

  const sitters = snap.docs
    .filter((doc) => doc.data().backgroundCheckStatus === 'clear' && clusterIdOf(doc.data()) === myClusterId)
    .map((doc) => ({
      ...toPublicSitter(doc.id, doc.data()),
      matchScore: sitterMatchScore(me, doc.data()),
      availableForSlot: dateKey && period ? sitterAvailableForSlot(doc.data(), dateKey, period) : false,
    }))
    .sort((a, b) => Number(b.availableForSlot) - Number(a.availableForSlot) || b.matchScore - a.matchScore);

  return { sitters };
});

// True for a cluster's own admin only — same allowlist as community
// announcements (see CLUSTERS), resolved from the caller's own family doc
// rather than a hardcoded email so this also works if a cluster ever has
// more than one admin.
async function isClusterAdmin(authUid, email) {
  const familyUid = await resolveFamilyUid(authUid);
  const meSnap = await admin.firestore().collection('users').doc(familyUid).get();
  const clusterId = clusterIdOf(meSnap.data() ?? {});
  return Boolean(email && CLUSTERS[clusterId]?.admins.includes(email));
}

// Powers the vetting queue (app/admin/sitters.tsx) — every sitter in the
// admin's own cluster, at any vetting status, so the queue can split them
// into Pending/Approved/Rejected tabs. Includes backgroundCheckStatus
// (toPublicSitter's subset doesn't) so the queue can tell them apart.
exports.getPendingSitters = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isClusterAdmin(request.auth.uid, request.auth.token.email))) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  const familyUid = await resolveFamilyUid(request.auth.uid);
  const meSnap = await admin.firestore().collection('users').doc(familyUid).get();
  const myClusterId = clusterIdOf(meSnap.data() ?? {});

  const snap = await admin.firestore().collection('sitters').limit(500).get();
  const sitters = snap.docs
    .filter((doc) => clusterIdOf(doc.data()) === myClusterId)
    .map((doc) => ({
      ...toPublicSitter(doc.id, doc.data()),
      backgroundCheckStatus:
        doc.data().backgroundCheckStatus === 'clear' || doc.data().backgroundCheckStatus === 'flagged'
          ? doc.data().backgroundCheckStatus
          : 'pending',
      certificationDocUrls: Array.isArray(doc.data().certificationDocUrls)
        ? doc.data().certificationDocUrls.filter((u) => typeof u === 'string')
        : [],
    }));

  return { sitters };
});

// The only way backgroundCheckStatus ever changes — firestore.rules pins
// that field (and vettedAt/vettedByEmail) out of a sitter's own writes, so
// this Admin-SDK path is the sole route to actually vetting someone.
exports.setSitterVettingStatus = onCall({ secrets: [resendApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isClusterAdmin(request.auth.uid, request.auth.token.email))) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  const uid = typeof request.data?.uid === 'string' ? request.data.uid : '';
  const status = request.data?.status;
  if (!uid || !['pending', 'clear', 'flagged'].includes(status)) {
    throw new HttpsError('invalid-argument', 'A valid sitter uid and status are required.');
  }

  const sitterRef = admin.firestore().collection('sitters').doc(uid);
  const beforeSnap = await sitterRef.get();
  const wasAlreadyClear = beforeSnap.data()?.backgroundCheckStatus === 'clear';

  await sitterRef.set(
    {
      backgroundCheckStatus: status,
      vettedAt: admin.firestore.FieldValue.serverTimestamp(),
      vettedByEmail: request.auth.token.email ?? null,
    },
    { merge: true }
  );

  // Only on a genuine pending/flagged -> clear transition, not every time
  // an admin re-saves an already-cleared sitter (e.g. re-vetting a
  // different field on the same record) — same "only email on the actual
  // transition" reasoning as pushOnPlaydateResponded elsewhere in this
  // file. Best-effort: a sitter's approval already happened in Firestore
  // regardless of whether this email send succeeds.
  if (status === 'clear' && !wasAlreadyClear) {
    const firstName = (typeof beforeSnap.data()?.name === 'string' ? beforeSnap.data().name : '').trim().split(' ')[0];
    const title = 'You’re approved on Haven.ly';
    await Promise.all([
      sendNotificationEmail(
        uid,
        title,
        [
          firstName ? `Hi ${firstName},` : 'Hi,',
          '',
          'Your Haven.ly application has been approved. Families nearby can now find you and reach out for playdate support.',
          '',
          `View your profile: ${APP_BASE_URL}/sitter-signup?edit=1`,
        ].join('\n')
      ),
      // pushTokensForFamily(uid) works unmodified for a sitter uid too —
      // see notifyOnSitterConfirmation's own comment on why.
      pushTokensForFamily(uid).then((tokens) =>
        sendExpoPush(tokens, title, 'Your profile is now live for families to find.', { url: '/sitter-signup?edit=1' })
      ),
    ]);
  }
});

// Content moderation — lets a cluster admin permanently hide a bad/spam
// item from every feed on the app, curated (TACA events, iTunes podcasts,
// Shopify products, MedlinePlus articles, blog RSS) and community-
// contributed alike, even though the curated ones have no Firestore doc of
// their own to delete and would just come right back on the next fetch
// otherwise. `key` is a type-prefixed identifier built the same way on
// both sides — client-side when hiding (lib/moderation.ts) and server-side
// when filtering each feed below — since these items only exist as an
// in-memory API response, not a document either side could reference by
// id. Docs get an auto id (not a deterministic one keyed off `key`) so
// hiding never has to worry about a raw URL's characters being valid as a
// Firestore doc id; membership is checked by loading the whole collection
// into a Set, which stays cheap since moderation actions are rare.
async function fetchHiddenKeys() {
  const snap = await admin.firestore().collection('hiddenContent').limit(1000).get();
  return new Set(snap.docs.map((doc) => doc.data().key).filter((k) => typeof k === 'string'));
}

exports.hideContent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isClusterAdmin(request.auth.uid, request.auth.token.email))) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  const key = typeof request.data?.key === 'string' ? request.data.key : '';
  const title = typeof request.data?.title === 'string' ? request.data.title : '';
  if (!key) {
    throw new HttpsError('invalid-argument', 'A key is required.');
  }
  await admin.firestore().collection('hiddenContent').add({
    key,
    title,
    hiddenByEmail: request.auth.token.email ?? null,
    hiddenAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});

exports.unhideContent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isClusterAdmin(request.auth.uid, request.auth.token.email))) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  const key = typeof request.data?.key === 'string' ? request.data.key : '';
  if (!key) {
    throw new HttpsError('invalid-argument', 'A key is required.');
  }
  const snap = await admin.firestore().collection('hiddenContent').where('key', '==', key).get();
  await Promise.all(snap.docs.map((doc) => doc.ref.delete()));
});

// Powers the "Hidden items" admin review screen — every hide is
// reversible, so this is a real moderation queue, not a one-way delete.
exports.getHiddenContent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  if (!(await isClusterAdmin(request.auth.uid, request.auth.token.email))) {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
  const snap = await admin.firestore().collection('hiddenContent').orderBy('hiddenAt', 'desc').limit(200).get();
  const items = snap.docs.map((doc) => ({
    key: doc.data().key,
    title: doc.data().title || 'Untitled',
    hiddenByEmail: doc.data().hiddenByEmail || '',
  }));
  return { items };
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
    admin.firestore().collection('users').doc(await resolveFamilyUid(request.auth.uid)).get(),
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

// --- Family membership (invite a co-parent/relative) -----------------
//
// "Full access" invites: an invited member's Firebase Auth uid never
// matches the family's uid, but familyMembers/{theirUid} maps them onto it,
// and resolveFamilyUid (top of file) is what every other family-scoped
// function/rule uses to treat them exactly like the family that invited
// them. crypto.randomBytes rather than a Firestore auto-id for the invite
// token — auto-ids are short enough (20 base64 chars, but generated
// client-reachable-adjacent) that treating one as an unguessable secret
// would be riskier than a purpose-built 192-bit random token.
const crypto = require('node:crypto');

const FAMILY_RELATIONSHIPS = ['Co-parent', 'Aunt', 'Uncle', 'Grandparent', 'Cousin', 'Close friend'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// html is optional — every other call site here is a plain-text
// notification. sendFamilyInvite is the one exception: its link carries a
// 48-character token, long enough that a plain-text email's own line
// wrapping can split it before an email client's auto-linkifier gets to
// it, producing a truncated/broken link a recipient can click straight
// into a "no longer valid" error. A real <a href> sidesteps that
// entirely — its target isn't affected by how the surrounding text wraps.
async function sendRawEmail(to, subject, text, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [to], subject, text, ...(html ? { html } : {}) }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    console.error(`Resend send to ${to} failed (${res.status}): ${errJson.message || 'unknown error'}`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Sends the invite. Any current family member (owner or a previously
// invited member — full access includes being able to grow the family)
// can call this; who actually sent it is recorded on the invite doc for
// the email body ("Josh invited you...") but doesn't otherwise gate
// anything further.
exports.sendFamilyInvite = onCall({ secrets: [resendApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
  const relationship = typeof request.data?.relationship === 'string' ? request.data.relationship : '';
  const email = typeof request.data?.email === 'string' ? request.data.email.trim() : '';
  if (!name) {
    throw new HttpsError('invalid-argument', 'Name is required.');
  }
  if (!FAMILY_RELATIONSHIPS.includes(relationship)) {
    throw new HttpsError('invalid-argument', 'Not a recognized relationship.');
  }
  if (!EMAIL_RE.test(email)) {
    throw new HttpsError('invalid-argument', 'A valid email is required.');
  }

  const familyUid = await resolveFamilyUid(request.auth.uid);
  const [familySnap, inviterRecord] = await Promise.all([
    admin.firestore().collection('users').doc(familyUid).get(),
    admin.auth().getUser(request.auth.uid).catch(() => null),
  ]);
  const familyLabel = familyLabelFor(familySnap.data()?.lastName);
  const invitedByName = inviterRecord?.displayName || 'A family member';

  const token = crypto.randomBytes(24).toString('hex');
  await admin.firestore().collection('familyInvites').doc(token).set({
    familyUid,
    invitedByUid: request.auth.uid,
    invitedByName,
    name,
    relationship,
    email,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const link = `${APP_BASE_URL}/invite/${token}`;
  const lines = [
    `${invitedByName} invited you to join ${familyLabel} on Haven.ly as their ${relationship}.`,
    '',
    `Accept your invite: ${link}`,
    '',
    "You don't need to sign up with this email address — use whichever email (or Gmail) you'd like when you create your account.",
  ];
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <p style="font-size: 16px; color: #1a1a1a; line-height: 1.5;">
        <strong>${escapeHtml(invitedByName)}</strong> invited you to join <strong>${escapeHtml(familyLabel)}</strong>
        on Haven.ly as their ${escapeHtml(relationship)}.
      </p>
      <p style="margin: 24px 0;">
        <a href="${link}" style="background: #d97757; color: #ffffff; text-decoration: none; font-weight: 700; padding: 14px 28px; border-radius: 999px; display: inline-block;">
          Accept your invite
        </a>
      </p>
      <p style="font-size: 13px; color: #6b6b6b; line-height: 1.5;">
        You don't need to sign up with this email address — use whichever email (or Gmail) you'd like when you
        create your account.
      </p>
      <p style="font-size: 12px; color: #9a9a9a; word-break: break-all;">
        Or paste this link into your browser: ${link}
      </p>
    </div>
  `;
  await sendRawEmail(email, `${invitedByName} invited you to join ${familyLabel} on Haven.ly`, lines.join('\n'), html);

  return { sent: true };
});

// No auth required — the invitee doesn't have an account yet when they
// first open the link. Only ever returns what's safe to show someone
// who's proven nothing but knowledge of the token itself.
exports.getFamilyInvite = onCall(async (request) => {
  const token = typeof request.data?.token === 'string' ? request.data.token : '';
  if (!token) {
    throw new HttpsError('invalid-argument', 'Missing invite token.');
  }
  const inviteSnap = await admin.firestore().collection('familyInvites').doc(token).get();
  const invite = inviteSnap.data();
  if (!invite || invite.status !== 'pending') {
    throw new HttpsError('not-found', 'This invite link is no longer valid.');
  }
  const familySnap = await admin.firestore().collection('users').doc(invite.familyUid).get();
  return {
    familyLabel: familyLabelFor(familySnap.data()?.lastName),
    invitedByName: invite.invitedByName,
    name: invite.name,
    relationship: invite.relationship,
  };
});

// Called once the invitee has a real Firebase Auth account (they either
// just created one or signed in with Google) — links THAT uid to the
// inviting family. photoUrl comes from the client's own upload (see
// lib/photoUpload.ts), already scoped to the caller's own uid by Storage's
// own rules, so it's trusted as-is here.
exports.acceptFamilyInvite = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const token = typeof request.data?.token === 'string' ? request.data.token : '';
  const photoUrl = typeof request.data?.photoUrl === 'string' ? request.data.photoUrl : null;
  if (!token) {
    throw new HttpsError('invalid-argument', 'Missing invite token.');
  }
  const inviteRef = admin.firestore().collection('familyInvites').doc(token);
  const inviteSnap = await inviteRef.get();
  const invite = inviteSnap.data();
  if (!invite || invite.status !== 'pending') {
    throw new HttpsError('not-found', 'This invite link is no longer valid.');
  }

  await admin.firestore().collection('familyMembers').doc(request.auth.uid).set({
    familyUid: invite.familyUid,
    name: invite.name,
    relationship: invite.relationship,
    photoUrl,
    role: 'member',
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await inviteRef.set(
    { status: 'accepted', acceptedByUid: request.auth.uid, acceptedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  return { familyUid: invite.familyUid };
});

// Powers Profile's "Family members" list — the owner has no familyMembers
// doc of their own (see resolveFamilyUid's comment), so they're synthesized
// here from the family's own users/{familyUid} doc rather than being just
// another row in the query below.
exports.getFamilyMembers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const familyUid = await resolveFamilyUid(request.auth.uid);
  const [ownerSnap, membersSnap, pendingSnap] = await Promise.all([
    admin.firestore().collection('users').doc(familyUid).get(),
    admin.firestore().collection('familyMembers').where('familyUid', '==', familyUid).get(),
    admin.firestore().collection('familyInvites').where('familyUid', '==', familyUid).where('status', '==', 'pending').get(),
  ]);
  const owner = ownerSnap.data() ?? {};
  const members = [
    {
      uid: familyUid,
      name: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Account owner',
      relationship: 'Owner',
      photoUrl: owner.familyPhotoUrl ?? null,
      role: 'owner',
    },
    ...membersSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        name: data.name ?? '',
        relationship: data.relationship ?? '',
        photoUrl: data.photoUrl ?? null,
        role: 'member',
      };
    }),
  ];
  const pendingInvites = pendingSnap.docs.map((doc) => {
    const data = doc.data();
    return { name: data.name ?? '', relationship: data.relationship ?? '', email: data.email ?? '' };
  });

  return { members, pendingInvites };
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

  const meSnap = await admin.firestore().collection('users').doc(await resolveFamilyUid(request.auth.uid)).get();
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
          const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=podcast&limit=25`);
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
      // String()'d — the Kids & Family chart (fetchFamilyPodcastChart)
      // returns collectionId as a string, while the iTunes Search API
      // returns it as a number. Using either raw as a Map key let the same
      // show, found via both sources, count as two different keys and show
      // up twice.
      const rawKey = podcast.collectionId ?? podcast.feedUrl;
      if (!rawKey) continue;
      const key = String(rawKey);
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

  // Not a UX-driven display cap (the client now reveals these
  // incrementally as the user scrolls, see app/(tabs)/podcasts.tsx) — just
  // a sanity ceiling against a pathological case, well above what ~20
  // search terms deduped by feed would realistically ever produce.
  const hiddenKeys = await fetchHiddenKeys();
  const podcasts = [...byFeed.values()]
    .map((p) => ({ ...p, matchedTags: [...p.matchedTags] }))
    .filter((p) => !hiddenKeys.has(`podcast:${p.id}`))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 150);

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

  const meSnap = await admin.firestore().collection('users').doc(await resolveFamilyUid(request.auth.uid)).get();
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

  const hiddenKeys = await fetchHiddenKeys();
  const resources = [...byUrl.values()]
    .map((r) => ({ ...r, matchedTags: [...r.matchedTags] }))
    .filter((r) => !hiddenKeys.has(`article:${r.url}`))
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

  const hiddenKeys = await fetchHiddenKeys();
  const posts = resultsPerSource
    .flat()
    .map((item) => {
      const parsed = item.pubDate ? new Date(item.pubDate) : null;
      const publishedAt = parsed && !isNaN(parsed.getTime()) ? parsed : null;
      const snippet = item.description.length > 220 ? `${item.description.slice(0, 220).trim()}…` : item.description;
      return { url: item.link, title: item.title, snippet, source: item.source, publishedAt };
    })
    .filter((p) => !hiddenKeys.has(`blog:${p.url}`))
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

// Neurodivergent-specialty retailers exposing Shopify's public
// predictive-search endpoint — the same JSON API their own on-site search
// bar calls, so results are searchable by keyword without needing a
// private Storefront API token. Several other candidates (National Autism
// Resources, Different Roads to Learning, Stimtastic, ARK Therapeutic,
// TheraSpecs) all 404 on this endpoint at the domain guessed for them and
// were dropped.
//
// The first three below were confirmed working via a one-off diagnostic.
// The next three are newly added and NOT similarly confirmed — this
// sandbox's network egress blocks essentially all retail domains (even
// re-testing the three already-confirmed ones fails from here), so there
// was no way to verify them before shipping. Each candidate's own
// try/catch below means a wrong guess just silently contributes zero
// results rather than breaking anything; worth spot-checking the Products
// tab after deploy and pruning whichever of these three don't pan out.
const PRODUCT_SOURCES = [
  { name: 'Fun and Function', base: 'https://funandfunction.com' },
  { name: 'Harkla', base: 'https://www.harkla.co' },
  { name: 'Chewigem', base: 'https://chewigem.com' },
  { name: 'Autism Community Store', base: 'https://autismcommunitystore.com' },
  { name: 'eSpecial Needs', base: 'https://especialneeds.com' },
  { name: 'The Autism Store', base: 'https://www.autism-store.com' },
];

// Shopify's predictive-search endpoint matches literally — a plain word
// like "sensory" returns real results (verified via a one-off diagnostic),
// but the long descriptive labels used during onboarding
// (app/onboarding/child.tsx's NEURODIVERGENCE_OPTIONS) mostly don't appear
// verbatim anywhere in the catalog, so they returned nothing. Map each one
// to a handful of short, retail-friendly keywords instead of just one —
// these are small boutique catalogs (see the comment below), so a single
// term missing stock shouldn't mean the whole tag comes back empty.
// Anything not listed here (a future onboarding option, say) falls back to
// searching the raw label as-is.
const PRODUCT_SEARCH_TERMS = {
  Autism: ['autism', 'sensory', 'stim'],
  ADHD: ['adhd', 'fidget', 'focus'],
  Dyslexia: ['reading', 'phonics'],
  Dyspraxia: ['motor skills', 'coordination'],
  'Sensory processing differences': ['sensory', 'weighted', 'tactile'],
  'Communication differences': ['communication', 'visual schedule'],
  Anxiety: ['calming', 'anxiety'],
  'Intellectual/developmental disability': ['developmental', 'special needs'],
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

  const meSnap = await admin.firestore().collection('users').doc(await resolveFamilyUid(request.auth.uid)).get();
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
  const mappedSearches = neurodivergence.flatMap((tag) => {
    const terms = tag in PRODUCT_SEARCH_TERMS ? PRODUCT_SEARCH_TERMS[tag] : [tag];
    return (terms ?? []).map((term) => ({ tag, term }));
  });
  const searches = mappedSearches.some((s) => s.term === 'sensory')
    ? mappedSearches
    : [...mappedSearches, { tag: 'General', term: 'sensory' }];

  const resultsPerSearch = await Promise.all(
    PRODUCT_SOURCES.flatMap((source) =>
      searches.map(async ({ tag, term }) => {
        try {
          const res = await fetch(
            `${source.base}/search/suggest.json?q=${encodeURIComponent(term)}&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=hide`
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

  // Not a UX-driven display cap (the client reveals these incrementally as
  // the user scrolls, see app/(tabs)/products.tsx) — just a sanity ceiling
  // against a pathological case, well above what this many sources/terms
  // deduped by URL would realistically ever produce.
  const hiddenKeys = await fetchHiddenKeys();
  const products = [...byUrl.values()]
    .map((p) => ({ ...p, matchedTags: [...p.matchedTags] }))
    .filter((p) => !hiddenKeys.has(`product:${p.url}`))
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length)
    .slice(0, 150);

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
    // state (2-letter) isn't used by any existing caller, only by
    // getNearbySchools below (to pick which state's schools to pull) — an
    // extra property on the returned object is harmless for callers that
    // only destructure lat/lon.
    const state = typeof place?.['state abbreviation'] === 'string' ? place['state abbreviation'] : '';
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, state } : null;
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
// Each tagged with the cluster(s) it actually serves — all three of these
// happen to be Bay Area orgs today, filtered to the caller's own cluster
// in getNearbyEvents below (see the CLUSTERS comment near the top of this
// file for why this differs from TACA, which stays cluster-agnostic).
// Adding a source for a future cluster is just another entry here with
// that cluster's id.
const TRIBE_EVENT_SOURCES = [
  { name: 'Golden Gate Regional Center', base: 'https://www.ggrc.org', clusters: ['bay-area'] },
  { name: 'Regional Center of the East Bay', base: 'https://rceb.org', clusters: ['bay-area'] },
  {
    name: 'Support for Families of Children with Disabilities',
    base: 'https://www.supportforfamilies.org',
    clusters: ['bay-area'],
  },
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

  const meSnap = await admin.firestore().collection('users').doc(await resolveFamilyUid(request.auth.uid)).get();
  const me = meSnap.data() ?? {};
  const myZip = typeof me.zipCode === 'string' ? me.zipCode : '';
  const myLocation = myZip ? await geocodeZip(myZip) : null;
  const myClusterId = clusterIdOf(me);
  // Only the regional orgs that actually serve this family's cluster —
  // TACA (fetched separately below) stays cluster-agnostic since it's
  // national and already self-localizes via the zip-radius filter further
  // down.
  const myTribeSources = TRIBE_EVENT_SOURCES.filter((s) => s.clusters.includes(myClusterId));

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
    Promise.all(myTribeSources.map(fetchTribeEvents)),
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
      const source = myTribeSources[i];
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
  const hiddenKeys = await fetchHiddenKeys();
  const ranked = filtered
    .filter((e) => !hiddenKeys.has(`event:${e.link}`))
    .sort((a, b) => a.eventDate - b.eventDate);

  // With 4 merged sources, a cap this low used to mean weeks of near-term
  // recurring support-group meetings alone could fill every slot and push
  // anything a month or more out (e.g. October) off the list entirely,
  // even though it was fetched. 60 leaves real headroom for that spread.
  return {
    events: ranked.slice(0, 60).map(({ eventDate, ...e }) => ({ ...e, eventDate: eventDate.toISOString() })),
  };
});

// --- Nearby schools ---------------------------------------------------
//
// Powers the "School" field when adding a child (app/onboarding/child.tsx)
// — a picker of real nearby schools instead of a bare free-text box.
// Source is the Urban Institute's Education Data Portal
// (educationdata.urban.org), a free, no-API-key REST wrapper around the
// federal government's own NCES Common Core of Data (CCD) — the same
// "read a source we don't control, no key needed" approach already used
// for TACA events, MedlinePlus, and the RSS blog feed above. Its schools
// directory endpoint filters by state (fips) rather than by zip or a
// radius, so — same tradeoff TACA's own pagination comment makes — this
// pages through one state's worth of schools rather than the whole
// country, then does the actual "within N miles" filtering locally with
// the same geocodeZip/haversineMiles helpers used for events.
//
// Caveat worth flagging plainly: this was built against Urban Institute's
// documented field/endpoint conventions, not verified against a live
// response — this sandbox's network egress blocks educationdata.urban.org
// outright, the same way it blocks most external domains (see the
// PRODUCT_SOURCES comment elsewhere in this file for the same situation).
// Field access below is defensive (multiple candidate names, typeof
// guards) for exactly that reason, and the whole call is try/catched to
// degrade to an empty list rather than a hard error if something's off.
// Worth a real spot-check after deploy, especially for a populous state
// where PAGE_LIMIT below might not reach every page.

const STATE_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11',
  FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21',
  LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30',
  NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39',
  OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49',
  VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
};

// CCD's school_level is a numeric code, not a label.
const SCHOOL_LEVEL_LABELS = { 1: 'Elementary', 2: 'Middle', 3: 'High', 4: 'Other' };

const SCHOOL_SEARCH_RADIUS_MILES = 20;
// Fetched in sequence (each page's URL depends on the last), so this is a
// wall-clock cap, not just a request-count one — kept low enough that even
// a slow response per page stays well inside the function's timeout.
const SCHOOL_PAGE_LIMIT = 10;
// The most recent CCD directory year reliably populated tends to lag 1-2
// years behind — if the newest one 404s or comes back empty, this falls
// back to the year before rather than surfacing nothing at all.
const SCHOOL_DIRECTORY_YEARS = [2022, 2021, 2020];

async function fetchSchoolsForState(fipsCode) {
  for (const year of SCHOOL_DIRECTORY_YEARS) {
    const schools = [];
    let url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/${year}/?fips=${fipsCode}&per_page=5000`;
    let pagesFetched = 0;
    try {
      while (url && pagesFetched < SCHOOL_PAGE_LIMIT) {
        // A bare fetch() with no User-Agent reads as a bot to a lot of
        // public APIs (Node's default UA very obviously isn't a browser's)
        // and gets a flat 403 back with no other explanation — this is
        // exactly what was happening here, confirmed via Cloud Functions
        // logs after deploy (zip/state/fips all resolved correctly; the
        // Urban Institute request itself was the thing being rejected).
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HavenlyApp/1.0; +https://haven-ly.com)',
            Accept: 'application/json',
          },
        });
        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          console.error(`getNearbySchools: fetch failed (${res.status}) for ${url} — body: ${bodyText.slice(0, 500)}`);
          break;
        }
        const data = await res.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        console.log(
          `getNearbySchools: year ${year} page ${pagesFetched + 1} — ${results.length} results` +
            (results[0] ? `, sample keys: ${Object.keys(results[0]).join(',')}` : '')
        );
        schools.push(...results);
        url = typeof data?.next === 'string' ? data.next : null;
        pagesFetched += 1;
      }
    } catch (err) {
      console.error(`getNearbySchools: fetchSchoolsForState threw for fips=${fipsCode} year=${year}:`, err?.message ?? err);
    }
    if (schools.length) return schools;
    console.log(`getNearbySchools: year ${year} returned 0 schools for fips=${fipsCode}, trying next year`);
  }
  return [];
}

exports.getNearbySchools = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const requestedZip = typeof request.data?.zip === 'string' ? request.data.zip.trim() : '';

  let zip = requestedZip;
  if (!zip) {
    const familyUid = await resolveFamilyUid(request.auth.uid);
    const meSnap = await admin.firestore().collection('users').doc(familyUid).get();
    zip = typeof meSnap.data()?.zipCode === 'string' ? meSnap.data().zipCode : '';
  }
  if (!zip) {
    console.log('getNearbySchools: no zip on file for caller, returning empty.');
    return { schools: [] };
  }

  const myLocation = await geocodeZip(zip);
  const fipsCode = myLocation?.state ? STATE_FIPS[myLocation.state] : null;
  if (!myLocation || !fipsCode) {
    console.error(`getNearbySchools: couldn't resolve location/fips for zip=${zip}`, myLocation);
    return { schools: [] };
  }
  console.log(`getNearbySchools: zip=${zip} -> state=${myLocation.state} fips=${fipsCode}`);

  const raw = await fetchSchoolsForState(fipsCode);
  console.log(`getNearbySchools: fetched ${raw.length} raw schools for fips=${fipsCode}`);

  const schools = raw
    .map((s) => {
      const lat = parseFloat(s?.latitude);
      const lon = parseFloat(s?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const distanceMiles = haversineMiles(myLocation, { lat, lon });
      if (distanceMiles > SCHOOL_SEARCH_RADIUS_MILES) return null;
      return {
        id: typeof s?.ncessch === 'string' || typeof s?.ncessch === 'number' ? String(s.ncessch) : `${lat},${lon}`,
        name: typeof s?.school_name === 'string' ? s.school_name : '',
        city: typeof s?.city_location === 'string' ? s.city_location : '',
        state: typeof s?.state_location === 'string' ? s.state_location : myLocation.state,
        level: SCHOOL_LEVEL_LABELS[s?.school_level] ?? '',
        distanceMiles: Math.round(distanceMiles * 10) / 10,
      };
    })
    .filter((s) => s && s.name);

  schools.sort((a, b) => a.distanceMiles - b.distanceMiles);
  console.log(`getNearbySchools: ${schools.length} within ${SCHOOL_SEARCH_RADIUS_MILES}mi after filtering`);

  return { schools: schools.slice(0, 100) };
});

// App Store Review Guideline 5.1.1(v) requires any app that offers account
// creation to also offer in-app account deletion — this is that. Scope:
// removes this uid's own primary records (profile, sitter listing, push
// token, family-membership link) and the Firebase Auth account itself,
// which is what actually makes the account gone — can't sign back in, no
// longer discoverable in getSuggestedFamilies/getRecommendedSitters/etc.,
// all of which read from these same docs. Content shared with other people
// (messages, playdate proposals, community contributions) is deliberately
// left in place, the same way most consumer apps handle a deleted user's
// existing contributions to a shared thread — scrubbing those is a much
// larger, separate piece of work and isn't what the guideline requires.
exports.deleteMyAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const uid = request.auth.uid;
  const db = admin.firestore();

  const memberSnap = await db.collection('familyMembers').doc(uid).get();
  const isInvitedMember = memberSnap.exists;

  const batch = db.batch();
  batch.delete(db.collection('pushTokens').doc(uid));
  batch.delete(db.collection('sitters').doc(uid));

  if (isInvitedMember) {
    batch.delete(db.collection('familyMembers').doc(uid));
  } else {
    // uid is an account owner, not an invited member — also clear anything
    // that points back at this family, so an invited member's app doesn't
    // end up referencing a family that no longer exists.
    batch.delete(db.collection('users').doc(uid));
    const [membersSnap, invitesSnap] = await Promise.all([
      db.collection('familyMembers').where('familyUid', '==', uid).get(),
      db.collection('familyInvites').where('familyUid', '==', uid).where('status', '==', 'pending').get(),
    ]);
    membersSnap.docs.forEach((doc) => batch.delete(doc.ref));
    invitesSnap.docs.forEach((doc) => batch.delete(doc.ref));
  }

  await batch.commit();
  await admin.auth().deleteUser(uid);

  return { success: true };
});


