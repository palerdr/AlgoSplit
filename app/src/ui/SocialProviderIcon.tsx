import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { SocialProvider } from '../api/backend';
import { theme } from '../theme';

interface SocialProviderIconProps {
  provider: SocialProvider;
  size?: number;
}

/** Recognizable provider marks with enough contrast for AlgoSplit's dark glass UI. */
export default function SocialProviderIcon({
  provider,
  size = 24,
}: SocialProviderIconProps) {
  const markSize = Math.round(size * 0.72);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.shell,
        provider === 'google' ? styles.googleShell : styles.appleShell,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {provider === 'google' ? (
        <Svg width={markSize} height={markSize} viewBox="0 0 18 18">
          <Path
            fill="#4285F4"
            d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.615Z"
          />
          <Path
            fill="#34A853"
            d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.91-2.258c-.806.54-1.835.86-3.046.86-2.344 0-4.328-1.585-5.037-3.714H.957v2.333A9 9 0 0 0 9 18Z"
          />
          <Path
            fill="#FBBC05"
            d="M3.963 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.708V4.959H.957A9 9 0 0 0 0 9c0 1.452.347 2.827.957 4.041l3.006-2.333Z"
          />
          <Path
            fill="#EA4335"
            d="M9 3.578c1.322 0 2.508.454 3.442 1.345l2.58-2.58C13.463.891 11.43 0 9 0A9 9 0 0 0 .957 4.959l3.006 2.333C4.672 5.163 6.656 3.578 9 3.578Z"
          />
        </Svg>
      ) : (
        <Svg width={markSize} height={markSize} viewBox="0 0 16 16">
          <Path
            fill={theme.text}
            d="M11.182.008c-.034-.038-1.259.015-2.325 1.172-1.066 1.156-.902 2.482-.878 2.516s1.52.087 2.475-1.258.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422s1.675-2.789 1.698-2.854-.597-.79-1.254-1.157a3.7 3.7 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56s.625 1.924 1.273 2.796c.576.984 1.34 1.667 1.659 1.899s1.219.386 1.843.067c.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758q.52-1.185.473-1.282Z"
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  googleShell: { backgroundColor: '#FFFFFF' },
  appleShell: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});
