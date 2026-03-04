import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useEffect, useRef } from 'react';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface DialGaugeProps {
  value: number;
  maxValue?: number;
  label: string;
  subtitle?: string;
  size: number;
  color: string;
  colorEnd?: string;
  delay?: number;
  showPercent?: boolean;
  labelInside?: boolean;
  /** Flip layout: label on left, dial on right */
  reversed?: boolean;
}

export default function DialGauge({
  value,
  maxValue = 100,
  label,
  subtitle,
  size,
  color,
  colorEnd,
  delay = 0,
  showPercent = false,
  labelInside = false,
  reversed = false,
}: DialGaugeProps) {
  const strokeWidth = size * 0.07;
  const glowExtra = strokeWidth * 0.4;
  const glowStrokeWidth = strokeWidth + glowExtra * 2;
  const radius = (size - glowStrokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(progress, {
          toValue: value / maxValue,
          duration: 1500,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: false,
        }),
        Animated.timing(fadeIn, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [value, maxValue]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const gradientId = `grad-${label.replace(/\s/g, '')}`;
  const glowGradientId = `glow-${label.replace(/\s/g, '')}`;

  const containerWidth = labelInside ? size : size + 110;

  const dialElement = (
    <View style={[styles.dialWrapper, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={color} />
            <Stop offset="100%" stopColor={colorEnd || color} />
          </LinearGradient>
          <LinearGradient id={glowGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={colorEnd || color} stopOpacity="0.15" />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#1A1A1A"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />

        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${glowGradientId})`}
          strokeWidth={glowStrokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />

        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      <View style={[styles.valueContainer, { width: size, height: size }]}>
        <Text style={[styles.valueText, { fontSize: size * (labelInside ? 0.2 : 0.26), color }]}>
          {showPercent ? `${value}%` : value}
        </Text>
        {labelInside && (
          <Text style={[styles.insideLabel, { color: '#999' }]}>{label}</Text>
        )}
      </View>
    </View>
  );

  const labelElement = !labelInside ? (
    <View style={reversed ? styles.labelContainerReversed : styles.labelContainer}>
      <Text style={[styles.label, reversed && styles.labelRight]}>{label}</Text>
      {subtitle ? <Text style={[styles.subtitle, reversed && styles.subtitleRight]}>{subtitle}</Text> : null}
    </View>
  ) : null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: containerWidth,
          opacity: fadeIn,
          flexDirection: labelInside ? 'column' : reversed ? 'row-reverse' : 'row',
          alignItems: 'center',
        },
      ]}
    >
      {dialElement}
      {labelElement}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 2,
  },
  dialWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  insideLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  labelContainer: {
    marginLeft: 10,
    flex: 1,
  },
  labelContainerReversed: {
    marginRight: 10,
    flex: 1,
    alignItems: 'flex-end',
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  labelRight: {
    textAlign: 'right',
  },
  subtitle: {
    color: '#666',
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  subtitleRight: {
    textAlign: 'right',
  },
});
