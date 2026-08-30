import Svg, { Circle, Rect } from 'react-native-svg';

// Two square puzzle pieces interlocking — a tab on the right piece sits in
// a notch on the left piece (the notch is faked by punching a `gapColor`
// circle out of the left piece's edge, since react-native-svg has no easy
// boolean-subtract; `gapColor` should match whatever surface the icon
// actually sits on so that "cut" reads as a real notch rather than a
// mismatched dot).
export function PuzzleMatchIcon({
  size = 16,
  color = '#FFFFFF',
  gapColor,
}: {
  size?: number;
  color?: string;
  gapColor: string;
}) {
  // A real gap between the two rects (not just touching) — the tab
  // protrudes from the right piece only, reaching to (not past) the
  // notch bitten out of the left piece, so the two shapes stay visually
  // distinct instead of fusing into one blob at small render sizes.
  return (
    <Svg width={size * 1.5} height={size} viewBox="0 0 120 80">
      <Rect x={5} y={15} width={42} height={50} rx={8} fill={color} />
      <Rect x={73} y={15} width={42} height={50} rx={8} fill={color} />
      <Circle cx={63} cy={40} r={10} fill={color} />
      <Circle cx={47} cy={40} r={6} fill={gapColor} />
    </Svg>
  );
}
