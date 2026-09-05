import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type SuggestedVenue = {
  name: string;
  distanceMiles: number;
};

// A real public park roughly midway between the caller's own family and
// familyUid's — see functions/index.js's getSuggestedPlaydateVenues for
// how the midpoint and distance are computed. Neither family's zip code
// is ever sent back to the client, only the resulting park names.
export async function fetchSuggestedPlaydateVenues(familyUid: string): Promise<SuggestedVenue[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ familyUid: string }, { venues: SuggestedVenue[] }>(
    functions,
    'getSuggestedPlaydateVenues'
  );
  const result = await call({ familyUid });
  return result.data.venues;
}
