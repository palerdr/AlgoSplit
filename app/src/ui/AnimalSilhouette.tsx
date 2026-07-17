import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ANIMAL_PATHS, type AnimalSlug } from '../data/animalPaths';

interface AnimalSilhouetteProps {
  slug: AnimalSlug;
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}

/** Flat single-color animal silhouette — see animalPaths.ts for the source/license. */
export default function AnimalSilhouette({ slug, size, color, style }: AnimalSilhouetteProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
      <Path fill={color} d={ANIMAL_PATHS[slug]} />
    </Svg>
  );
}
