// The one shared vocabulary for "what kind of neurodivergence" — used both
// for a child's own profile (app/onboarding/child.tsx) and a sitter's
// specialties (lib/sitters.ts), so the two can actually be compared for
// overlap (functions/index.js's getRecommendedSitters) instead of matching
// against free-text that happens to spell things the same way.
export const NEURODIVERGENCE_OPTIONS = [
  'Autism',
  'ADHD',
  'Dyslexia',
  'Dyspraxia',
  'Sensory processing differences',
  'Communication differences',
  'Anxiety',
  'Intellectual/developmental disability',
  'Still figuring it out',
  'Prefer not to say',
];
