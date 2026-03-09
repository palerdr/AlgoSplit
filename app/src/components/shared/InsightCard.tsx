import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';

interface InsightCardProps {
  title: string;
  description: string;
  index?: number;
}

const DOT_ROWS = 14;
const DOT_COLS = 24;
const dotOpacities: number[][] = [];
for (let r = 0; r < DOT_ROWS; r++) {
  const row: number[] = [];
  for (let c = 0; c < DOT_COLS; c++) {
    const hash = ((r * 31 + c * 17 + 7) % 13) / 13;
    row.push(hash > 0.7 ? 0.025 : hash > 0.4 ? 0.012 : 0.005);
  }
  dotOpacities.push(row);
}

export default function InsightCard({ title, description, index = 0 }: InsightCardProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        delay: 600 + index * 150,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 15,
        stiffness: 100,
        delay: 600 + index * 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.outerContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <LinearGradient
        colors={['#1C1C1C', '#151515', '#191919', '#141414']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientCard}
      >
        <View style={styles.topSheen} />
        <View style={styles.textureOverlay} pointerEvents="none">
          {dotOpacities.map((row, ri) => (
            <View key={ri} style={styles.textureRow}>
              {row.map((op, ci) => (
                <View key={ci} style={[styles.textureDot, { opacity: op }]} />
              ))}
            </View>
          ))}
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#252525',
  },
  gradientCard: {
    borderRadius: 15,
    padding: 18,
    overflow: 'hidden',
  },
  topSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  textureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-evenly',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  textureRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  textureDot: {
    width: 1,
    height: 1,
    borderRadius: 0.5,
    backgroundColor: '#fff',
  },
  title: {
    color: '#E8E8E8',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  description: {
    color: '#888',
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 0.1,
  },
});
