import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type PodcastSuggestion = {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  viewUrl: string | null;
  feedUrl: string | null;
  trackCount: number | null;
  genres: string[];
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

// The show's own synopsis, fetched on demand from its RSS feed for the
// podcast detail screen — the Search API result has no description field,
// so this isn't available until asked for.
export async function fetchPodcastDescription(feedUrl: string): Promise<string> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<{ feedUrl: string }, { description: string }>(functions, 'getPodcastDescription');
  const result = await call({ feedUrl });
  return result.data.description;
}
