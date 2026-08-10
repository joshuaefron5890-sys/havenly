import { ImageSourcePropType } from 'react-native';

// Central manifest of photo assets used across the app. Photo (see
// components/Photo.tsx) falls back to a color placeholder when a source is
// undefined, so new slots can be added here without touching every screen.
export const images: Record<string, ImageSourcePropType | undefined> = {
  onboardingHero: require('../assets/photos/onboarding-hero.jpg'),
  featureFindPeople: require('../assets/photos/feature-find-people.jpg'),
  featureBuildCommunity: require('../assets/photos/feature-build-community.jpg'),
  featureGetSupport: require('../assets/photos/feature-get-support.jpg'),
  matchesHero: require('../assets/photos/matches-hero.jpg'),
  familyNakamura: require('../assets/photos/family-nakamura.jpg'),
  familyOsei: require('../assets/photos/family-osei.jpg'),
  familyReyes: require('../assets/photos/family-reyes.jpg'),
  familyYuki: require('../assets/photos/family-yuki.jpg'),
  familyAbena: require('../assets/photos/family-abena.jpg'),
  playdatePlayground: require('../assets/photos/playdate-playground.jpg'),
  playdateMuseum: require('../assets/photos/playdate-museum.jpg'),
  playdateSensoryStorytime: require('../assets/photos/playdate-sensory-storytime.jpg'),
  playdateOutdoorArt: require('../assets/photos/playdate-outdoor-art.jpg'),
  eventParentsNightOut: require('../assets/photos/event-parents-night-out.jpg'),
  eventMomsNightOut: require('../assets/photos/event-moms-night-out.jpg'),
  productWeightedBlanket: require('../assets/photos/product-weighted-blanket.jpg'),
  productRubiksCube: require('../assets/photos/product-rubiks-cube.jpg'),
  productHeadphones: require('../assets/photos/product-headphones.jpg'),
  seminarAdhdPlaydates: require('../assets/photos/seminar-adhd-playdates.jpg'),
  helperMarcus: require('../assets/photos/helper-marcus.jpg'),
  helperOt: require('../assets/photos/helper-ot.jpg'),
};
