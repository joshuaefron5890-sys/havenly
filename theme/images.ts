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

// The standard multi-color Google "G" mark, inlined as a data URI so it
// renders offline/bundled rather than fetching an external asset.
const GOOGLE_LOGO_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+CjxwYXRoIGZpbGw9IiNGRkMxMDciIGQ9Ik00My42MTEsMjAuMDgzSDQyVjIwSDI0djhoMTEuMzAzYy0xLjY0OSw0LjY1Ny02LjA4LDgtMTEuMzAzLDhjLTYuNjI3LDAtMTItNS4zNzMtMTItMTJjMC02LjYyNyw1LjM3My0xMiwxMi0xMmMzLjA1OSwwLDUuODQyLDEuMTU0LDcuOTYxLDMuMDM5bDUuNjU3LTUuNjU3QzM0LjA0Niw2LjA1MywyOS4yNjgsNCwyNCw0QzEyLjk1NSw0LDQsMTIuOTU1LDQsMjRjMCwxMS4wNDUsOC45NTUsMjAsMjAsMjBjMTEuMDQ1LDAsMjAtOC45NTUsMjAtMjBDNDQsMjIuNjU5LDQzLjg2MiwyMS4zNSw0My42MTEsMjAuMDgzeiIvPgo8cGF0aCBmaWxsPSIjRkYzRDAwIiBkPSJNNi4zMDYsMTQuNjkxbDYuNTcxLDQuODE5QzE0LjY1NSwxNS4xMDgsMTguOTYxLDEyLDI0LDEyYzMuMDU5LDAsNS44NDIsMS4xNTQsNy45NjEsMy4wMzlsNS42NTctNS42NTdDMzQuMDQ2LDYuMDUzLDI5LjI2OCw0LDI0LDRDMTYuMzE4LDQsOS42NTYsOC4zMzcsNi4zMDYsMTQuNjkxeiIvPgo8cGF0aCBmaWxsPSIjNENBRjUwIiBkPSJNMjQsNDRjNS4xNjYsMCw5Ljg2LTEuOTc3LDEzLjQwOS01LjE5MmwtNi4xOS01LjIzOEMyOS4yMTEsMzUuMDkxLDI2LjcxNSwzNiwyNCwzNmMtNS4yMDIsMC05LjYxOS0zLjMxNy0xMS4yODMtNy45NDZsLTYuNTIyLDUuMDI1QzkuNTA1LDM5LjU1NiwxNi4yMjcsNDQsMjQsNDR6Ii8+CjxwYXRoIGZpbGw9IiMxOTc2RDIiIGQ9Ik00My42MTEsMjAuMDgzSDQyVjIwSDI0djhoMTEuMzAzYy0wLjc5MiwyLjIzNy0yLjIzMSw0LjE2Ni00LjA4Nyw1LjU3MWMwLjAwMS0wLjAwMSwwLjAwMi0wLjAwMSwwLjAwMy0wLjAwMmw2LjE5LDUuMjM4QzM2Ljk3MSwzOS4yMDUsNDQsMzQsNDQsMjRDNDQsMjIuNjU5LDQzLjg2MiwyMS4zNSw0My42MTEsMjAuMDgzeiIvPgo8L3N2Zz4=';

export const images: Record<string, ImageSourcePropType | undefined> = {
  googleLogo: { uri: GOOGLE_LOGO_URI },
  onboardingHero: {
    uri: 'https://images.unsplash.com/photo-1550096141-7263640aa48c?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
  },
  featureFindPeople: unsplash('photo-1607748862156-7c548e7e98f4', 300, 200),
  featureBuildCommunity: unsplash('photo-1777817530517-bd54a0574213', 300, 200),
  featureGetSupport: unsplash('photo-1708687045030-26702e62fc65', 300, 200),
  matchesHero: unsplash('photo-1606474226448-4aa808468efc', 700, 350),
  familyNakamura: unsplash('photo-1771785990200-0857c2b8e70b', 160, 160),
  familyOsei: unsplash('photo-1760084836111-b384c6d32104', 160, 160),
  familyReyes: unsplash('photo-1774641373997-9e5b8b2df8f3', 160, 160),
  playdatePlayground: unsplash('photo-1606474226448-4aa808468efc', 700, 400),
  helperMarcus: unsplash('photo-1507003211169-0a1dd7228f2d', 700, 500),
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
