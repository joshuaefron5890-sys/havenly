import { ImageSourcePropType } from 'react-native';
import { images } from './images';

// Shared between the onboarding interests picker and the profile summary,
// so both show the exact same label -> stock photo mapping.
export const INTERESTS: { label: string; image: ImageSourcePropType | undefined }[] = [
  { label: 'Minecraft', image: images.interestMinecraft },
  { label: 'Roblox', image: images.interestRoblox },
  { label: 'Pokémon', image: images.interestPokemon },
  { label: 'LEGO', image: images.interestLego },
  { label: 'Board games', image: images.interestBoardGames },
  { label: 'Arts & crafts', image: images.interestArtsCrafts },
  { label: 'Drawing', image: images.interestDrawing },
  { label: 'Music', image: images.interestMusic },
  { label: 'Cats', image: images.interestCats },
  { label: 'Dogs', image: images.interestDogs },
  { label: 'Other animals', image: images.interestOtherAnimals },
  { label: 'Dinosaurs', image: images.interestDinosaurs },
  { label: 'Science', image: images.interestScience },
  { label: 'Space', image: images.interestSpace },
  { label: 'Reading', image: images.interestReading },
  { label: 'Swimming', image: images.interestSwimming },
  { label: 'Building things', image: images.interestBuildingThings },
  { label: 'Soccer', image: images.interestSoccer },
];
