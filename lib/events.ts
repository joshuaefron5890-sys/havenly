import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type NearbyEvent = {
  id: number;
  title: string;
  link: string;
  eventDate: string; // ISO
  venue: string;
  address: string;
  city: string;
  state: string;
  imageUrl: string | null;
  categories: string[];
};

// Local support-group meetups and events from TACA (The Autism Community
// in Action) — fetched server-side (functions/index.js getNearbyEvents),
// which reads the caller's own state from Firestore (see
// contexts/OnboardingContext.tsx's zip code capture) and ranks same-state
// events first.
export async function fetchNearbyEvents(): Promise<NearbyEvent[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<undefined, { events: NearbyEvent[] }>(functions, 'getNearbyEvents');
  const result = await call();
  return result.data.events;
}

export function eventSubtitle(event: NearbyEvent): string {
  const dateLabel = new Date(event.eventDate).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const place = event.city && event.state ? `${event.city}, ${event.state}` : event.venue;
  return [dateLabel, place].filter(Boolean).join(' · ');
}
