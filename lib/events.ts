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
  // null distanceMiles + virtual:true means no parseable address (a
  // webinar) — always shown regardless of the caller's own location.
  // null distanceMiles + virtual:false means the caller hasn't set a zip
  // code yet, so distance couldn't be computed either way.
  distanceMiles: number | null;
  virtual: boolean;
};

// Local support-group meetups and events from TACA (The Autism Community
// in Action) — fetched server-side (functions/index.js getNearbyEvents),
// which reads the caller's own zip code from Firestore, geocodes both
// sides with the same free lookup used for zip verification (see
// lib/zipcode.ts), and filters in-person events to driving distance.
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
  const place = event.virtual
    ? 'Virtual'
    : event.distanceMiles != null
      ? `${Math.round(event.distanceMiles)} mi away`
      : event.city && event.state
        ? `${event.city}, ${event.state}`
        : event.venue;
  return [dateLabel, place].filter(Boolean).join(' · ');
}
