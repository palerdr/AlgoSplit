import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import appConfig from '../../app.json';
import { theme } from '../theme';

const STARTUP_ART = require('../../assets/startup-splash.png');
const APP_VERSION = Constants.expoConfig?.version ?? appConfig.expo.version;

interface StartupSplashProps {
  /** The final portrait artwork can be wired in as soon as it lands in assets. */
  imageSource?: ImageSourcePropType;
}

export default function StartupSplash({ imageSource = STARTUP_ART }: StartupSplashProps) {
  const overlay: ReactNode = (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(13,13,13,0.08)', 'rgba(13,13,13,0.12)', 'rgba(13,13,13,0.76)']}
        locations={[0, 0.58, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={styles.loadingText}>Loading your stuff…</Text>
      </View>
      <Text style={styles.version}>v{APP_VERSION}</Text>
    </>
  );

  const accessibility = {
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel: `Loading AlgoSplit version ${APP_VERSION}`,
  };

  if (imageSource) {
    return (
      <ImageBackground
        {...accessibility}
        source={imageSource}
        resizeMode="cover"
        style={styles.container}
      >
        {overlay}
      </ImageBackground>
    );
  }

  return (
    <View {...accessibility} style={styles.container}>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  loadingRow: {
    position: 'absolute',
    bottom: 62,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  loadingText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
  },
  version: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    color: 'rgba(255,255,255,0.46)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
});
