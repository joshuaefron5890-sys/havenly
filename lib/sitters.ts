import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, db, functions } from './firebase';
import { clusterForZip } from './clusters';
import { AVAILABILITY_PERIODS, AvailabilityPeriod, DayAvailability } from './sitterAvailability';

// Gates the two family-facing entry points (app/index.tsx's "Register as a
// sitter" link, app/proposal/[id].tsx's "Need a sitter for this playdate?"
// prompt/assigned-sitter card) — the feature isn't ready to launch yet, but
// the backend (registration, vetting, matching) stays intact so this is a
// one-line flip to bring it back rather than ripping the feature out.
// Sitter self-registration (/sitter-signup), the sitter's own app shell
// (/(sitter)), and the admin vetting/hidden-content screens are untouched —
// only the two links a family would actually discover the feature through.
export const SITTERS_ENABLED = false;

// Common childcare credentials, distinct from NEURODIVERGENCE_OPTIONS
// (lib/neurodivergence.ts) — a certification is a qualification a sitter
// holds, not a population they have experience with, so the two are kept
// as separate fields/lists rather than one merged list.
export const SITTER_CERTIFICATIONS = [
  'CPR Certified',
  'First Aid Certified',
  'Special Education Background',
  'Early Childhood Education',
  'Nursing/Medical Background',
  'Behavioral Therapy Experience (ABA, etc.)',
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
export async function saveMySitterProfile(patch: Partial<SitterProfile>, isNew: boolean): Promise<void> {
  const uid = auth?.currentUser?.uid;
  if (!uid || !db) throw new Error('not-signed-in');
  const sitterRef = doc(db, 'sitters', uid);
  if (isNew) {
    await setDoc(
      sitterRef,
      { ...patch, clusterId: clusterForZip(patch.zipCode ?? ''), backgroundCheckStatus: 'pending', createdAt: serverTimestamp() },
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
  await updateDoc(sitterRef, { ...patch, updatedAt: serverTimestamp() });
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
};

// Cluster + specialty-matched, vetted-only — see functions/index.js's
// getRecommendedSitters for the actual scoring.
export async function fetchRecommendedSitters(): Promise<RecommendedSitter[]> {
  if (!functions) throw new Error('not-configured');
  const call = httpsCallable<undefined, { sitters: RecommendedSitter[] }>(functions, 'getRecommendedSitters');
  const result = await call();
  return result.data.sitters;
}

export type PendingSitter = RecommendedSitter & {
  backgroundCheckStatus: BackgroundCheckStatus;
  certificationDocUrls: string[];
};

// Admin-only (see functions/index.js's admin check) — every sitter in the
// admin's own cluster that isn't 'clear' yet, for the vetting queue
// (app/admin/sitters.tsx).
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
