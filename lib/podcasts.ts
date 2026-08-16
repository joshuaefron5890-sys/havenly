import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type PodcastSuggestion = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  viewUrl: string | null;
  matchedTags: string[];
};

// Podcasts matching the signed-in user's child's neurodivergence tags —
// fetched server-side (functions/index.js getPodcastSuggestions), which
// reads those tags from the caller's own Firestore doc and searches
// Apple's iTunes Search API on their behalf.
export async function fetchPodcastSuggestions(): Promise<PodcastSuggestion[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<undefined, { podcasts: PodcastSuggestion[] }>(functions, 'getPodcastSuggestions');
  const result = await call();
  return result.data.podcasts;
}

export function podcastSubtitle(podcast: PodcastSuggestion): string {
  const matches = podcast.matchedTags.length ? `Matches ${podcast.matchedTags.join(', ')}` : '';
  return [podcast.artist, matches].filter(Boolean).join(' · ');
}
