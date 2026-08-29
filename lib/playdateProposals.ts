import {
  addDoc,
  collection,
  doc,
  DocumentSnapshot,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { getMyFamilyUid } from './familyContext';
import { getOrCreateConversation, PlaydateProposalDetails, sendProposalMessage } from './messages';
import { RecommendedSitter } from './sitters';

export type ProposalStatus = 'proposed' | 'accepted' | 'declined' | 'canceled';

// A small snapshot of the sitter's public info at the moment they were
// added, not a live join — same reasoning as dateLabel/venue below already
// being denormalized copies rather than references. Good enough for a
// sitter's own profile changing rarely; re-adding them (or a different
// sitter) from app/find-sitter.tsx just overwrites this.
export type SitterConfirmationStatus = 'pending' | 'confirmed' | 'declined';

export type AssignedSitter = Pick<RecommendedSitter, 'uid' | 'name' | 'photoUrl' | 'phone' | 'email' | 'specialties'> & {
  // Set to 'pending' the moment a family assigns a sitter; only the sitter
  // themselves can move it to 'confirmed'/'declined' (firestore.rules pins
  // this update to their own uid) — surfaced to both families on the
  // proposal detail screen, and drives functions/index.js's
  // notifyOnSitterConfirmation trigger (notifications + optional Google
  // Calendar event on confirm).
  confirmationStatus: SitterConfirmationStatus;
};

export type PlaydateProposal = {
  id: string;
  conversationId: string;
  fromUid: string;
  toUid: string;
  status: ProposalStatus;
  note: string;
  createdAt: Date | null;
  sitter: AssignedSitter | null;
} & PlaydateProposalDetails;

// dateLabel carries the full "Sat, Aug 22 · 10:00 AM–11:30 AM" range (see
// formatSlotLabel in app/propose-playdate.tsx) — right for a detail view,
// too long for a small square-card thumbnail. Re-derived from the raw ISO
// `date` rather than string-splitting dateLabel, so it stays correct
// regardless of how the range itself is formatted.
export function proposalStartLabel(proposal: Pick<PlaydateProposal, 'date' | 'dateLabel'>): string {
  const start = proposal.date ? new Date(proposal.date) : null;
  if (!start || Number.isNaN(start.getTime())) return proposal.dateLabel;
  const dateLabel = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${dateLabel} · ${time}`;
}

// A lightweight, denormalized record of a proposal — the actual proposal
// lives as a message in the conversation (see lib/messages.ts's
// sendProposalMessage, which is what the message center/unread badge
// actually reacts to). This top-level collection exists purely so the
// Discover dashboard can cheaply ask "do I have a pending proposal?"
// without a collection-group query across every conversation's messages,
// and so status (accepted/declined) has one place to live rather than
// being duplicated onto the message doc too.
export async function createPlaydateProposal(
  toUid: string,
  details: PlaydateProposalDetails,
  note: string
): Promise<string> {
  const myUid = getMyFamilyUid();
  if (!myUid || !db) {
    throw new Error('not-signed-in');
  }
  const conversationId = await getOrCreateConversation(toUid);
  await sendProposalMessage(conversationId, details, note);
  await addDoc(collection(db, 'playdateProposals'), {
    conversationId,
    fromUid: myUid,
    toUid,
    participantUids: [myUid, toUid],
    status: 'proposed',
    note: note.trim(),
    createdAt: serverTimestamp(),
    ...details,
  });
  return conversationId;
}

// Only the recipient can respond, and only while it's still pending — both
// enforced again server-side in firestore.rules.
export async function respondToProposal(proposalId: string, status: 'accepted' | 'declined'): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  await setDoc(doc(db, 'playdateProposals', proposalId), { status }, { merge: true });
}

// Only the family who created the proposal can cancel it, and only while
// it's still pending or accepted (not already declined/canceled) — both
// enforced again server-side in firestore.rules. Cancelling an accepted
// playdate also removes it from either family's calendar, if either had
// sync on (functions/index.js's cancelPlaydateCalendarEvents).
export async function cancelProposal(proposalId: string): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  await setDoc(doc(db, 'playdateProposals', proposalId), { status: 'canceled' }, { merge: true });
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

// A playdate is still "upcoming" as long as it hasn't ended yet — checked
// against endDate (falling back to date, for an older proposal saved
// before endDate existed) rather than just the start time, so a playdate
// that's already underway doesn't disappear from Home mid-event. An
// unparseable/missing date is treated as still upcoming rather than
// silently dropped — better to show a proposal with bad data than hide it.
function hasNotEnded(proposal: Pick<PlaydateProposal, 'date' | 'endDate'>): boolean {
  const raw = proposal.endDate || proposal.date;
  if (!raw) return true;
  const end = new Date(raw);
  if (Number.isNaN(end.getTime())) return true;
  return end.getTime() >= Date.now();
}

function parseSitter(value: unknown): AssignedSitter | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.uid !== 'string' || typeof data.name !== 'string') return null;
  const confirmationStatus = data.confirmationStatus;
  return {
    uid: data.uid,
    name: data.name,
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : null,
    phone: typeof data.phone === 'string' ? data.phone : '',
    email: typeof data.email === 'string' ? data.email : '',
    specialties: Array.isArray(data.specialties) ? data.specialties.filter((s) => typeof s === 'string') : [],
    confirmationStatus:
      confirmationStatus === 'confirmed' || confirmationStatus === 'declined' ? confirmationStatus : 'pending',
  };
}

function parseProposal(id: string, data: Record<string, unknown>): PlaydateProposal {
  const status = data.status;
  return {
    id,
    conversationId: typeof data.conversationId === 'string' ? data.conversationId : '',
    fromUid: typeof data.fromUid === 'string' ? data.fromUid : '',
    toUid: typeof data.toUid === 'string' ? data.toUid : '',
    status: status === 'accepted' || status === 'declined' || status === 'canceled' ? status : 'proposed',
    note: typeof data.note === 'string' ? data.note : '',
    createdAt: toDate(data.createdAt),
    sitter: parseSitter(data.sitter),
    date: typeof data.date === 'string' ? data.date : '',
    endDate: typeof data.endDate === 'string' ? data.endDate : '',
    dateLabel: typeof data.dateLabel === 'string' ? data.dateLabel : '',
    windowLabel: typeof data.windowLabel === 'string' ? data.windowLabel : '',
    venue: typeof data.venue === 'string' ? data.venue : '',
  };
}

// Either family on the playdate can add (or replace) the sitter, only once
// it's actually accepted — enforced again server-side in firestore.rules,
// which pins this write to only the `sitter` field (same idea as
// respondToProposal/cancelProposal being pinned to `status`).
export async function addSitterToPlaydate(proposalId: string, sitter: RecommendedSitter): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  const snapshot: AssignedSitter = {
    uid: sitter.uid,
    name: sitter.name,
    photoUrl: sitter.photoUrl,
    phone: sitter.phone,
    email: sitter.email,
    specialties: sitter.specialties,
    confirmationStatus: 'pending',
  };
  await setDoc(doc(db, 'playdateProposals', proposalId), { sitter: snapshot }, { merge: true });
}

// Either family can remove the assigned sitter (e.g. to pick a different
// one later) — enforced again server-side in firestore.rules, pinned to
// just the `sitter` field going to null. functions/index.js's
// notifyOnSitterRemoved reacts to this to tell the sitter and clean up any
// Google Calendar event already created for them.
export async function removeSitterFromPlaydate(proposalId: string): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  await setDoc(doc(db, 'playdateProposals', proposalId), { sitter: null }, { merge: true });
}

// Only the assigned sitter can respond, via a dot-path update so
// firestore.rules can pin the diff to just `sitter` — enforced again
// server-side (functions/index.js's notifyOnSitterConfirmation reacts to
// the resulting transition).
export async function respondAsSitter(proposalId: string, status: 'confirmed' | 'declined'): Promise<void> {
  if (!db) throw new Error('not-signed-in');
  await setDoc(
    doc(db, 'playdateProposals', proposalId),
    { sitter: { confirmationStatus: status } },
    { merge: true }
  );
}

// The single most recent pending proposal involving the signed-in user, if
// any — shown as the leading card in Discover's Events section. A one-time
// fetch (not a live subscription) since it's read once per dashboard visit,
// same as the other Discover sections.
//
// Only filters by participantUids array-contains here — adding a second
// where() on status would need a Firestore composite index, so "proposed"
// is filtered client-side instead (same array-contains-only pattern used by
// subscribeToConversations). Also excludes anything already over
// (hasNotEnded) — a proposal for a date that's passed is stale, not
// something to surface as the latest one to act on.
export async function fetchLatestProposal(): Promise<PlaydateProposal | null> {
  const myUid = getMyFamilyUid();
  if (!myUid || !db) return null;
  const q = query(collection(db, 'playdateProposals'), where('participantUids', 'array-contains', myUid));
  const snap = await getDocs(q);
  const proposals = snap.docs
    .map((d) => parseProposal(d.id, d.data()))
    .filter((p) => p.status === 'proposed' && hasNotEnded(p));
  if (!proposals.length) return null;
  proposals.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  return proposals[0];
}

// Every still-pending, not-yet-past proposal involving the signed-in
// user, soonest first — powers the Home dashboard's "For You" highlights
// (second priority, right after confirmed playdates). Same shape as
// fetchAcceptedProposals; kept separate from fetchLatestProposal since
// that one only needs the single most recent for the Events section's
// badge card, not the full list.
export async function fetchPendingProposals(): Promise<PlaydateProposal[]> {
  const myUid = getMyFamilyUid();
  if (!myUid || !db) return [];
  const q = query(collection(db, 'playdateProposals'), where('participantUids', 'array-contains', myUid));
  const snap = await getDocs(q);
  const proposals = snap.docs
    .map((d) => parseProposal(d.id, d.data()))
    .filter((p) => p.status === 'proposed' && hasNotEnded(p));
  proposals.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return proposals;
}

// Every accepted (confirmed), not-yet-past playdate involving the
// signed-in user, soonest first — powers the Home dashboard's "For You"
// highlights, where a confirmed playdate is the single highest-priority
// thing to surface. Same array-contains-only + client-side status filter
// as fetchLatestProposal, for the same composite-index reason.
export async function fetchAcceptedProposals(): Promise<PlaydateProposal[]> {
  const myUid = getMyFamilyUid();
  if (!myUid || !db) return [];
  const q = query(collection(db, 'playdateProposals'), where('participantUids', 'array-contains', myUid));
  const snap = await getDocs(q);
  const proposals = snap.docs
    .map((d) => parseProposal(d.id, d.data()))
    .filter((p) => p.status === 'accepted' && hasNotEnded(p));
  proposals.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return proposals;
}

// Live feed of every proposal involving the signed-in user, across all
// conversations — the message thread screen filters this client-side down
// to its own conversationId to know whether a proposal it's rendering is
// still pending, and to react instantly when the other side responds.
export function subscribeToMyProposals(callback: (proposals: PlaydateProposal[]) => void): () => void {
  const myUid = getMyFamilyUid();
  if (!myUid || !db) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, 'playdateProposals'), where('participantUids', 'array-contains', myUid));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => parseProposal(d.id, d.data())));
  });
}

// Every playdate the signed-in sitter has been assigned to and hasn't yet
// responded to — powers app/(sitter)/index.tsx's "Playdate requests"
// section. Only accepted proposals ever carry a `sitter` at all (see
// addSitterToPlaydate), so no extra status filter is needed beyond that.
export async function fetchSitterPlaydateRequests(uid: string): Promise<PlaydateProposal[]> {
  if (!db) return [];
  const q = query(collection(db, 'playdateProposals'), where('sitter.uid', '==', uid));
  const snap = await getDocs(q);
  const proposals = snap.docs
    .map((d) => parseProposal(d.id, d.data()))
    .filter((p) => p.sitter?.confirmationStatus === 'pending');
  proposals.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return proposals;
}

// Every playdate the signed-in sitter has confirmed — powers
// app/(sitter)/index.tsx's "Confirmed playdates" section.
export async function fetchSitterConfirmedPlaydates(uid: string): Promise<PlaydateProposal[]> {
  if (!db) return [];
  const q = query(collection(db, 'playdateProposals'), where('sitter.uid', '==', uid));
  const snap = await getDocs(q);
  const proposals = snap.docs
    .map((d) => parseProposal(d.id, d.data()))
    .filter((p) => p.sitter?.confirmationStatus === 'confirmed');
  proposals.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return proposals;
}

// Live view of a single proposal by id — backs the standalone
// app/proposal/[id].tsx screen. A single-document read/subscription isn't
// subject to the composite-index constraint above (that only applies to
// multi-field list queries), so no client-side filtering is needed here.
export function subscribeToProposal(
  proposalId: string,
  callback: (proposal: PlaydateProposal | null) => void
): () => void {
  if (!db) {
    callback(null);
    return () => {};
  }
  return onSnapshot(doc(db, 'playdateProposals', proposalId), (snap: DocumentSnapshot) => {
    callback(snap.exists() ? parseProposal(snap.id, snap.data() as Record<string, unknown>) : null);
  });
}
