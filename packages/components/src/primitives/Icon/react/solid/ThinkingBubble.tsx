import Svg, { SvgProps, Path } from 'react-native-svg';
const SvgThinkingBubble = (props: SvgProps) => (
  <Svg fill="none" viewBox="0 0 24 24" accessibilityRole="image" {...props}>
    <Path
      fill="#000"
      d="M4.75 16.5a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5ZM13 2a3.996 3.996 0 0 0-3.262 1.684c-.152.214-.396.325-.57.319A5 5 0 0 0 6 13a4 4 0 0 0 6.683 2.966c.231-.21.575-.274.778-.209a4.999 4.999 0 0 0 5.882-2.28.366.366 0 0 1 .136-.135 5 5 0 0 0-2.647-9.34c-.174.006-.418-.105-.57-.319A3.996 3.996 0 0 0 13 2Z"
    />
  </Svg>
);
export default SvgThinkingBubble;
