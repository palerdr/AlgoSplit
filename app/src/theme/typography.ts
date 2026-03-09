import { TextStyle } from 'react-native';

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  } as TextStyle,
  h2: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  } as TextStyle,
  h3: {
    fontSize: 18,
    fontWeight: '700',
  } as TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '400',
  } as TextStyle,
  bodyBold: {
    fontSize: 15,
    fontWeight: '600',
  } as TextStyle,
  caption: {
    fontSize: 13,
    fontWeight: '500',
  } as TextStyle,
  small: {
    fontSize: 11,
    fontWeight: '500',
  } as TextStyle,
  numeric: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  } as TextStyle,
  numericLarge: {
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  } as TextStyle,
} as const;

export type TypographyKey = keyof typeof typography;
