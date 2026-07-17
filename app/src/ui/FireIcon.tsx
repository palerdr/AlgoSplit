import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface FireIconProps {
  /** Rendered height in points; width follows the glyph's aspect ratio. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const ASPECT = 24 / 30; // width / height of the source path's viewBox

/**
 * A small custom flame glyph for streak badges. Apple's 🔥 emoji renders
 * too cartoonish and inconsistently across OS versions at this size —
 * this is a flat two-tone flame designed to stay legible around 12-16pt.
 */
export default function FireIcon({ size = 14, style }: FireIconProps) {
  return (
    <Svg width={size * ASPECT} height={size} viewBox="0 0 24 30" style={style}>
      <Path
        d="M14 1
          C19.5 4.5 21.5 9 20 14
          C18.7 18.5 15 22.5 11 29
          C7.5 24.5 4 19.5 4.5 14.5
          C5 9.5 8.5 4.5 14 1
          Z"
        fill="#E8452A"
      />
      <Path
        d="M14 11
          C17 14 18 17.5 16.5 21.5
          C15.5 24.5 13.5 27 11.5 29
          C9 26 7 22.5 7.5 18.5
          C8 14.5 10.5 11.5 14 11
          Z"
        fill="#FFB238"
      />
    </Svg>
  );
}
