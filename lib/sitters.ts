import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, functions } from './firebase';
import { clusterForZip } from './clusters';

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
};

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
  await setDoc(
    doc(db, 'sitters', uid),
    isNew
      ? { ...patch, clusterId: clusterForZip(patch.zipCode ?? ''), backgroundCheckStatus: 'pending', createdAt: serverTimestamp() }
      : { ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
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

export type PendingSitter = RecommendedSitter & { backgroundCheckStatus: BackgroundCheckStatus };

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
