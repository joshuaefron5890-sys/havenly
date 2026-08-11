import { ImageSourcePropType } from 'react-native';

// Remote Unsplash photos (from the reference prototype) loaded at runtime —
// not bundled locally, so no build-time fetch needed and the viewer's
// browser/device pulls full-resolution versions directly from Unsplash's CDN.
function unsplash(id: string, w: number, h: number): ImageSourcePropType {
  return { uri: `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80` };
}

// Unsplash+ (licensed) photos are served from a separate subdomain.
function unsplashPlus(id: string, w: number, h: number): ImageSourcePropType {
  return { uri: `https://plus.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80` };
}

export const images: Record<string, ImageSourcePropType | undefined> = {
  onboardingHero: unsplash('photo-1606092195730-5d7b9af1efc5', 800, 500),
  featureFindPeople: unsplash('photo-1607748862156-7c548e7e98f4', 300, 200),
  featureBuildCommunity: unsplash('photo-1777817530517-bd54a0574213', 300, 200),
  featureGetSupport: unsplash('photo-1708687045030-26702e62fc65', 300, 200),
  matchesHero: unsplash('photo-1606474226448-4aa808468efc', 700, 350),
  familyNakamura: unsplash('photo-1771785990200-0857c2b8e70b', 160, 160),
  familyOsei: unsplash('photo-1760084836111-b384c6d32104', 160, 160),
  familyReyes: unsplash('photo-1774641373997-9e5b8b2df8f3', 160, 160),
  familyYuki: unsplash('photo-1782225203933-1b591fd703d9', 200, 200),
  familyAbena: unsplash('photo-1641598547935-49453f079d90', 200, 200),
  playdatePlayground: unsplash('photo-1606474226448-4aa808468efc', 700, 400),
  playdateMuseum: unsplash('photo-1524178232363-1fb2b075b655', 700, 400),
  playdateSensoryStorytime: unsplash('photo-1529543544282-ea669407fca3', 700, 400),
  playdateOutdoorArt: unsplash('photo-1541140532154-b024d705b90a', 700, 400),
  eventParentsNightOut: unsplash('photo-1481627834876-b7833e8f5570', 300, 300),
  eventMomsNightOut: unsplash('photo-1544772711-57da9c7368fa', 300, 300),
  productWeightedBlanket: unsplash('photo-1584227327140-31a5528dee6d', 300, 300),
  productRubiksCube: unsplash('photo-1587654780291-39c9404d746b', 300, 300),
  productHeadphones: unsplash('photo-1478737270239-2f02b77fc618', 300, 300),
  seminarAdhdPlaydates: unsplash('photo-1503454537195-1dcabb73ffb9', 300, 300),
  helperMarcus: unsplash('photo-1507003211169-0a1dd7228f2d', 700, 500),
  helperOt: unsplash('photo-1488426862026-3ee34a7d66df', 300, 300),
  interestMinecraft: unsplash('photo-1524685794168-52985e79c1f8', 200, 200),
  interestRoblox: unsplash('photo-1656639969809-ebc544c96955', 200, 200),
  interestPokemon: unsplash('photo-1703023689733-6a4281149189', 200, 200),
  interestLego: unsplash('photo-1752322069850-f92b5ce0e961', 200, 200),
  interestBoardGames: unsplash('photo-1577896849786-738ed6c78bd3', 200, 200),
  interestArtsCrafts: unsplash('photo-1613950190144-4f2a84c75e8c', 200, 200),
  interestDrawing: unsplash('photo-1560130958-0ea787c275de', 200, 200),
  interestMusic: unsplashPlus('premium_photo-1661331956773-325b1c597c26', 200, 200),
  interestCats: unsplash('photo-1529778873920-4da4926a72c2', 200, 200),
  interestDogs: unsplashPlus('premium_photo-1666777247416-ee7a95235559', 200, 200),
  interestOtherAnimals: unsplash('photo-1636986766802-a9bf23d30448', 200, 200),
  interestDinosaurs: unsplash('photo-1525877442103-5ddb2089b2bb', 200, 200),
  interestScience: unsplash('photo-1758685734030-a31d96462eec', 200, 200),
  interestSpace: unsplash('photo-1766995596065-590702fcce47', 200, 200),
  interestReading: unsplash('flagged/photo-1551887373-6edba6dacbb1', 200, 200),
  interestSwimming: unsplashPlus('premium_photo-1661382079454-c71b72df64e8', 200, 200),
  interestBuildingThings: unsplash('photo-1758687126192-98f54f4b747f', 200, 200),
  interestSoccer: unsplashPlus('premium_photo-1661524208761-0ce228cf015c', 200, 200),
};
