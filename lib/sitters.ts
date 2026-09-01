import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, db, functions } from './firebase';
import { clusterForZip } from './clusters';
import { AVAILABILITY_PERIODS, AvailabilityPeriod, DayAvailability } from './sitterAvailability';

// Gates the two family-facing entry points (app/index.tsx's "Register as a
// sitter" link, app/proposal/[id].tsx's "Need a sitter for this playdate?"
// prompt/assigned-sitter card). Re-enabled now that sitters have a real
// availability picker (lib/sitterAvailability.ts) for getRecommendedSitters
// to actually match against, rather than just vetting/cluster/specialty.
export const SITTERS_ENABLED = true;

// Common childcare credentials, distinct from NEURODIVERGENCE_OPTIONS
// (lib/neurodivergence.ts) — a certification is a qualification a sitter
// holds, not a population they have experience with, so the two are kept
// as separate fields/lists rather than one merged list.
export const SITTER_CERTIFICATIONS = [
  'Behavioral Therapy Experience (ABA, etc.)',
  'CPR Certified',
  'Early Childhood Education',
  'First Aid Certified',
  'Nursing/Medical Background',
  'Special Education Background',
];

// certificationDocUrls only ever stores plain download URLs (see
// firestore.rules and lib/photoUpload.ts's pickAndUploadDocument) — no
// separate filename/mimeType field — so these read the extension straight
// back out of the URL's own filename to decide how to render each one
// (an actual <Image> thumbnail vs. a generic file icon + extension label
// for a PDF/DOCX/etc., which an <Image> can't render at all).
const IMAGE_DOC_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'gif', 'webp'];

function docUrlExtension(url: string): string {
  const withoutQuery = url.split('?')[0];
  return withoutQuery.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? '';
}

export function isImageDocUrl(url: string): boolean {
  return IMAGE_DOC_EXTENSIONS.includes(docUrlExtension(url));
}

export function docExtensionLabel(url: string): string {
  const ext = docUrlExtension(url);
  return ext ? ext.toUpperCase() : 'FILE';
}

// 'pending' the moment someone self-registers; only a cluster admin can
// move it to 'clear' (functions/index.js's setSitterVettingStatus) — never
// settable by the sitter themselves, enforced in firestore.rules by pinning
// this field out of the client's own update diff. 'flagged' is a background
// check that came back with something on it — kept distinct from 'pending'
// so an admin's review queue can tell "hasn't been checked yet" apart from
// "was checked and failed."
export type BackgroundCheckStatus = 'pending' | 'clear' | 'flagged';

export type SitterProfile = {
  name: string;
  email: string;
  phone: string;
  bio: string;
  photoUrl: string | null;
  city: string;
  state: string;
  zipCode: string;
  specialties: string[];
  certifications: string[];
  yearsExperience: string;
  hourlyRate: string;
  backgroundCheckStatus: BackgroundCheckStatus;
  // Photos of certification cards/credentials, uploaded to back up the
  // `certifications` checkboxes above — reviewed privately by an admin
  // during vetting (app/admin/sitters.tsx) and deliberately never included
  // in RecommendedSitter/toPublicSitter below, since these can contain a
  // real name/cert number a family has no reason to see.
  certificationDocUrls: string[];
  // Day-specific availability — which morning/afternoon/evening periods
  // the sitter has marked themselves free for on each upcoming date (see
  // lib/sitterAvailability.ts). Deliberately not the family's recurring
  // weekly-window model, since a sitter's real availability varies day to
  // day rather than following a fixed weekly pattern.
  availability: DayAvailability;
  googleCalendarConnected: boolean;
  // Whether the sitter opted into the broader calendar.events (write)
  // scope on connect, same toggle/reasoning as a family's own
  // googleCalendarSyncEnabled (app/onboarding/calendar.tsx) — off by
  // default so most sitters never hit Google's "unverified app" warning,
  // only those who actually want a confirmed playdate added to their own
  // calendar (functions/index.js's notifyOnSitterConfirmation).
  googleCalendarSyncEnabled: boolean;
  // A sitter confirming they're still available despite a specific
  // detected calendar conflict (see lib/sitterAvailability.ts's
  // findSitterAvailabilityConflicts) — keyed by periodConflictKey(date,
  // period), so it's scoped to that one occurrence. Deliberately not in
  // RecommendedSitter — matching logic reads this server-side, a family
  // never needs to see it directly.
  availabilityConflictOverrides: Record<string, true>;
  // Every (date, period) the sitter has ever hand-toggled directly, keyed
  // the same way as availabilityConflictOverrides above — protects that
  // choice from ever being silently re-applied by the automatic calendar
  // sync on app/(sitter)/availability.tsx (which otherwise can't tell "the
  // sitter unchecked this" apart from "nobody's decided yet," and would
  // re-check anything the calendar shows as free). A manual choice always
  // wins over what the calendar says, indefinitely, not just for the
  // session it was made in.
  availabilityManualOverrides: Record<string, true>;
  // Assigned once, server-side, the moment this sitter's doc is first
  // created (functions/index.js's onSitterProfileCreated trigger) — never
  // client-writable, so null until that trigger has run (briefly, right
  // after signup).
  referralCode: string | null;
  // Where their referral earnings (as either a referrer or a referred
  // sitter — see lib/referrals.ts) actually get sent. Both null/empty
  // until the sitter fills them in from the referral modal.
  payoutMethod: 'venmo' | 'paypal' | null;
  payoutHandle: string;
  // The multi-step signup wizard (app/provider-signup/*) writes these after
  // every step so a sitter who bails partway through can pick up where
  // they left off on a later sign-in (lib/onboardingProgress.ts's
  // routeSignedInUser) instead of either restarting or, worse, being
  // mistaken for a fully-registered sitter just because their doc exists.
  // Both null/true once the final step completes.
  signupStep: string | null;
  signupComplete: boolean;
};

export const emptySitterProfile: SitterProfile = {
  name: '',
  email: '',
  phone: '',
  bio: '',
  photoUrl: null,
  city: '',
  state: '',
  zipCode: '',
  specialties: [],
  certifications: [],
  yearsExperience: '',
  hourlyRate: '',
  backgroundCheckStatus: 'pending',
  certificationDocUrls: [],
  availability: {},
  googleCalendarConnected: false,
  googleCalendarSyncEnabled: false,
  availabilityConflictOverrides: {},
  availabilityManualOverrides: {},
  referralCode: null,
  payoutMethod: null,
  payoutHandle: '',
  signupStep: null,
  signupComplete: false,
};

const VALID_PERIODS = new Set(AVAILABILITY_PERIODS.map((p) => p.key));

function parseDayAvailability(value: unknown): DayAvailability {
  if (typeof value !== 'object' || value === null) return {};
  const result: DayAvailability = {};
  for (const [key, periods] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(periods)) continue;
    const valid = periods.filter((p): p is AvailabilityPeriod => typeof p === 'string' && VALID_PERIODS.has(p as AvailabilityPeriod));
    if (valid.length) result[key] = valid;
  }
  return result;
}

function parseTrueMap(value: unknown): Record<string, true> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v === true)) as Record<
    string,
    true
  >;
}

function parseSitterProfile(data: Record<string, unknown>): SitterProfile {
  const status = data.backgroundCheckStatus;
  return {
    name: typeof data.name === 'string' ? data.name : '',
    email: typeof data.email === 'string' ? data.email : '',
    phone: typeof data.phone === 'string' ? data.phone : '',
    bio: typeof data.bio === 'string' ? data.bio : '',
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
    city: typeof data.city === 'string' ? data.city : '',
    state: typeof data.state === 'string' ? data.state : '',
    zipCode: typeof data.zipCode === 'string' ? data.zipCode : '',
    specialties: Array.isArray(data.specialties) ? data.specialties.filter((s) => typeof s === 'string') : [],
    certifications: Array.isArray(data.certifications) ? data.certifications.filter((c) => typeof c === 'string') : [],
    yearsExperience: typeof data.yearsExperience === 'string' ? data.yearsExperience : '',
    hourlyRate: typeof data.hourlyRate === 'string' ? data.hourlyRate : '',
    backgroundCheckStatus: status === 'clear' || status === 'flagged' ? status : 'pending',
    certificationDocUrls: Array.isArray(data.certificationDocUrls)
      ? data.certificationDocUrls.filter((u) => typeof u === 'string')
      : [],
    availability: parseDayAvailability(data.availability),
    googleCalendarConnected: data.googleCalendarConnected === true,
    googleCalendarSyncEnabled: data.googleCalendarSyncEnabled === true,
    availabilityConflictOverrides: parseTrueMap(data.availabilityConflictOverrides),
    availabilityManualOverrides: parseTrueMap(data.availabilityManualOverrides),
    referralCode: typeof data.referralCode === 'string' ? data.referralCode : null,
    payoutMethod: data.payoutMethod === 'venmo' || data.payoutMethod === 'paypal' ? data.payoutMethod : null,
    payoutHandle: typeof data.payoutHandle === 'string' ? data.payoutHandle : '',
    signupStep: typeof data.signupStep === 'string' ? data.signupStep : null,
    // Absent on every sitter who registered before the multi-step wizard
    // existed — those are all fully-registered profiles, so absence has to
    // default to true, not false, or every legacy sitter would suddenly
    // read as mid-signup.
    signupComplete: typeof data.signupComplete === 'boolean' ? data.signupComplete : true,
  };
}

// Reads the signed-in sitter's own profile directly (firestore.rules only
// ever allows a sitter to read their own doc — every other family reads a
// public subset through getRecommendedSitters instead, same reasoning as
// toPublicFamily on the family side).
export async function fetchMySitterProfile(): Promise<SitterProfile | null> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) return null;
  const snap = await getDoc(doc(db, 'sitters', uid));
  return snap.exists() ? parseSitterProfile(snap.data()) : null;
}

// First save (registration) and every later edit both go through this —
// firestore.rules requires backgroundCheckStatus stay 'pending' on create
// and pins it (plus vettedAt/vettedByEmail) out of every update's diff, so
// there's no path for a sitter to mark themselves vetted.
//
// `referredByCode` is only meaningful on the isNew path — whatever the
// sitter typed into provider-signup's optional "Referral code" field, if
// anything. Firestore create isn't field-restricted the way update is
// (see firestore.rules), so this is safe to write directly; it's the
// server-side onSitterProfileCreated trigger (Admin SDK) that actually
// resolves it into a real referredByUid, silently ignoring it if the code
// doesn't match a real sitter. Never touched again after creation.
export async function saveMySitterProfile(
  patch: Partial<SitterProfile>,
  isNew: boolean,
  referredByCode?: string
): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) throw new Error('not-signed-in');
  const sitterRef = doc(db, 'sitters', uid);
  // The multi-step signup wizard's first step creates the doc before the
  // ZIP code is even collected (that's a later step) — clusterId has to
  // be (re)computed whenever a save actually includes one, on an update
  // just as much as on create, or a sitter who set their ZIP on a later
  // step would be stuck with whatever clusterId (or lack of one) the
  // create call happened to compute.
  const clusterPatch = patch.zipCode !== undefined ? { clusterId: clusterForZip(patch.zipCode) } : {};
  if (isNew) {
    await setDoc(
      sitterRef,
      {
        ...patch,
        ...clusterPatch,
        backgroundCheckStatus: 'pending',
        createdAt: serverTimestamp(),
        ...(referredByCode ? { referredByCodeInput: referredByCode } : {}),
      },
      { merge: true }
    );
    return;
  }
  // updateDoc rather than setDoc(..., {merge: true}) — merge:true
  // recursively deep-merges nested map fields (availability,
  // availabilityConflictOverrides, availabilityManualOverrides), so
  // removing a key locally (e.g. unmarking a day) just stops sending that
  // key, and merge:true never deletes a key that's merely absent — the
  // old value silently survives. updateDoc replaces each named top-level
  // field wholesale with exactly what's passed, which is what every
  // caller here actually intends: "this is the complete new value for
  // this field," not a partial nested patch.
  await updateDoc(sitterRef, { ...patch, ...clusterPatch, updatedAt: serverTimestamp() });
}

// The safe subset of a sitter's profile a family is ever shown — mirrors
// SuggestedFamily on the family side. Only ever returned for a sitter whose
// backgroundCheckStatus is 'clear' (see getRecommendedSitters); contact info
// is included on purpose, since this is a directory a family is meant to
// actually reach out through (no in-app booking/payment yet).
export type RecommendedSitter = {
  uid: string;
  name: string;
  email: string;
  phone: string;
  bio: string;
  photoUrl: string | null;
  city: string;
  state: string;
  specialties: string[];
  certifications: string[];
  yearsExperience: string;
  hourlyRate: string;
  // How many of the sitter's specialties overlap with any of the caller's
  // kids' neurodivergence tags — not a percentage, just a sort key.
  matchScore: number;
  // Only meaningful when fetchRecommendedSitters was called with a slot —
  // whether the sitter has that exact (date, period) marked in their own
  // availability (lib/sitterAvailability.ts). False both when they marked
  // themselves unavailable AND when they simply haven't decided either way
  // yet — this is a "did they say yes," not a live calendar check.
  availableForSlot: boolean;
};

// Cluster + specialty-matched, vetted-only, and — when a slot is given —
// sorted to put sitters who've actually marked themselves available for
// that exact date/period first (see functions/index.js's
// getRecommendedSitters for the scoring/sort). `slot` is computed
// client-side from the proposal's local date (see app/find-sitter.tsx)
// rather than passing a raw timestamp, so "morning/afternoon/evening" is
// classified in the viewer's own timezone — the same one a sitter used
// when they marked their own availability — instead of the server's.
export async function fetchRecommendedSitters(slot?: { dateKey: string; period: AvailabilityPeriod }): Promise<RecommendedSitter[]> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<{ dateKey?: string; period?: AvailabilityPeriod } | undefined, { sitters: RecommendedSitter[] }>(
    functions,
    'getRecommendedSitters'
  );
  const result = await call(slot);
  return result.data.sitters;
}

export type PendingSitter = RecommendedSitter & {
  backgroundCheckStatus: BackgroundCheckStatus;
  certificationDocUrls: string[];
};

// Admin-only (see functions/index.js's admin check) — every sitter in the
// admin's own cluster, at any vetting status, for the vetting queue
// (app/admin/sitters.tsx) to split into Pending/Approved/Rejected tabs.
export async function fetchPendingSitters(): Promise<PendingSitter[]> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, { sitters: PendingSitter[] }>(functions, 'getPendingSitters');
  const result = await call();
  return result.data.sitters;
}

export async function setSitterVettingStatus(uid: string, status: BackgroundCheckStatus): Promise<void> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<{ uid: string; status: BackgroundCheckStatus }, void>(functions, 'setSitterVettingStatus');
  await call({ uid, status });
}

// Sitter equivalents of lib/googleCalendar.ts's connectGoogleCalendarBackend/
// getGoogleFreeBusy — same OAuth code (from
// lib/googleIdentity.ts's requestGoogleCalendarAuthCode, called with
// pushEvents=false since a sitter only ever needs read-only free/busy, never
// the sensitive calendar.events write scope), just exchanged against
// functions/index.js's sitter-scoped Cloud Functions so the refresh token
// lands on sitters/{uid} instead of users/{uid}.
export async function connectSitterGoogleCalendarBackend(code: string): Promise<void> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable(functions, 'connectSitterGoogleCalendar');
  await call({ code, native: Platform.OS !== 'web' });
}

export async function fetchSitterGoogleFreeBusy(timeMin: string, timeMax: string): Promise<{ start: string; end: string }[]> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<{ timeMin: string; timeMax: string }, { busy: { start: string; end: string }[] }>(
    functions,
    'getSitterGoogleFreeBusy'
  );
  const result = await call({ timeMin, timeMax });
  return result.data.busy;
}

// Undoes connectSitterGoogleCalendarBackend — clears the stored refresh
// token server-side (it's pinned out of client writes in firestore.rules,
// so this can't be a plain saveMySitterProfile call) and revokes it with
// Google. Used by the "Disconnect" action on app/(sitter)/availability.tsx.
export async function disconnectSitterGoogleCalendarBackend(): Promise<void> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable(functions, 'disconnectSitterGoogleCalendar');
  await call();
}
