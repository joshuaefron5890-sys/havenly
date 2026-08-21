import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export type BlogPost = {
  url: string;
  title: string;
  // Already stripped/truncated server-side from the feed's raw HTML body.
  snippet: string;
  // The blog's name, e.g. "NeuroClastic" — shown as attribution the same
  // way resourceSubtitle() shows "MedlinePlus" for health-topic articles.
  source: string;
  publishedAt: string | null;
};

// The latest posts from a handful of blogs written by/for neurodivergent
// parents — fetched server-side (functions/index.js's getBlogFeed) by
// reading each blog's own public RSS feed directly. Not personalized to
// the child's tags the way fetchHealthResources/fetchPodcastSuggestions
// are — a blog's RSS feed has no way to search, only "give me the latest
// posts" — so every caller gets the same merged, most-recent-first list.
export async function fetchBlogFeed(): Promise<BlogPost[]> {
  if (!functions) {
    throw new Error('not-configured');
  }
  const call = httpsCallable<undefined, { posts: BlogPost[] }>(functions, 'getBlogFeed');
  const result = await call();
  return result.data.posts;
}

export function blogPostSubtitle(post: BlogPost): string {
  return `${post.source} · ${post.snippet}`;
}
