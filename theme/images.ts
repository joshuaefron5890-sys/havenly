import { ImageSourcePropType } from 'react-native';

// Central manifest of photo assets used across the app. Every entry is
// `undefined` until the corresponding file exists in assets/photos/ — Photo
// falls back to a color placeholder when a source is undefined. Once real
// files land, uncomment/replace the require() call for that key; nothing
// else in the app needs to change.
//
// Expected filename -> where it's used:
//   onboarding-hero.jpg            Landing page hero
//   feature-find-people.jpg        Landing page feature tile
//   feature-build-community.jpg    Landing page feature tile
//   feature-get-support.jpg        Landing page feature tile
//   matches-hero.jpg                Onboarding match-results hero
//   family-nakamura.jpg             Onboarding matches list
//   family-osei.jpg                 Onboarding matches list
//   family-reyes.jpg                Onboarding matches list
//   family-yuki.jpg                  For You (My List + Discover)
//   family-abena.jpg                 For You Discover
//   playdate-playground.jpg          For You / Events / playdate detail
//   playdate-museum.jpg              Events
//   playdate-sensory-storytime.jpg   For You Discover
//   playdate-outdoor-art.jpg         For You Discover
//   event-parents-night-out.jpg      Events
//   event-moms-night-out.jpg         Events
//   product-weighted-blanket.jpg     For You Products
//   product-rubiks-cube.jpg          For You Products
//   product-headphones.jpg           For You Discover products
//   seminar-adhd-playdates.jpg       For You Seminars
//   helper-marcus.jpg                Get Help card + detail
//   helper-ot.jpg                    Get Help card

export const images: Record<string, ImageSourcePropType | undefined> = {
  onboardingHero: undefined,
  featureFindPeople: undefined,
  featureBuildCommunity: undefined,
  featureGetSupport: undefined,
  matchesHero: undefined,
  familyNakamura: undefined,
  familyOsei: undefined,
  familyReyes: undefined,
  familyYuki: undefined,
  familyAbena: undefined,
  playdatePlayground: undefined,
  playdateMuseum: undefined,
  playdateSensoryStorytime: undefined,
  playdateOutdoorArt: undefined,
  eventParentsNightOut: undefined,
  eventMomsNightOut: undefined,
  productWeightedBlanket: undefined,
  productRubiksCube: undefined,
  productHeadphones: undefined,
  seminarAdhdPlaydates: undefined,
  helperMarcus: undefined,
  helperOt: undefined,
};
