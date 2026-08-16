export type ZipLookupResult = { city: string; state: string };

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
    if (typeof city !== 'string' || typeof state !== 'string') return null;
    return { city, state };
  } catch {
    return null;
  }
}
