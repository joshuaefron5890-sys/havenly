// lat/lng come from the same zippopotam response as city/state (each
// place includes them) — added for lib/serviceArea.ts's radius check,
// alongside the city/state confirmation this was originally built for.
export type ZipLookupResult = { city: string; state: string; lat: number; lng: number };

// Zippopotam.us — free, no API key or signup, exactly the kind of public
// zip→city lookup most apps use to confirm "did you type that right?"
// without asking the user to pick their city from a list. Client-side
// (not a Cloud Function) since it's a plain public lookup with no
// dependency on the caller's own account data.
export async function lookupZipCode(zip: string): Promise<ZipLookupResult | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = Array.isArray(data?.places) ? data.places[0] : null;
    const city = place?.['place name'];
    const state = place?.['state abbreviation'];
    const lat = place ? Number(place['latitude']) : NaN;
    const lng = place ? Number(place['longitude']) : NaN;
    if (typeof city !== 'string' || typeof state !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { city, state, lat, lng };
  } catch {
    return null;
  }
}
