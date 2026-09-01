import { lookupZipCode } from './zipcode';

// The sitters splash page's interest-list form gates signup on this — see
// app/sitters.tsx's handleSubmit. 94010 is Burlingame, the rough center of
// the Bay Area Peninsula cluster (lib/clusters.ts's only cluster today).
export const SERVICE_AREA_CENTER_ZIP = '94010';
export const SERVICE_AREA_RADIUS_MILES = 50;

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Great-circle (straight-line) distance between two lat/lng points, in
// miles — not road distance, but accurate enough for "is this zip
// roughly in our service area."
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// null means "couldn't determine" (an invalid/unrecognized zip, or the
// lookup failed) — kept distinct from false ("determined, and it's out of
// range") so the caller can show a different message for each: a lookup
// error vs. "we're not in your area yet."
export async function isWithinServiceArea(zip: string): Promise<boolean | null> {
  const [center, target] = await Promise.all([lookupZipCode(SERVICE_AREA_CENTER_ZIP), lookupZipCode(zip)]);
  if (!center || !target) return null;
  return haversineMiles(center.lat, center.lng, target.lat, target.lng) <= SERVICE_AREA_RADIUS_MILES;
}
