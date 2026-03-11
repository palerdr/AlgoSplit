import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRef, useState, useEffect, useCallback } from 'react';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_WIDTH = 48;
const SIDE_PADDING = (SCREEN_WIDTH - DAY_WIDTH) / 2;
const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getDaysArray(centerDate: Date, range: number): Date[] {
  const days: Date[] = [];
  for (let i = -range; i <= range; i++) {
    const d = new Date(centerDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

interface DateSelectorProps {
  onDateChange?: (date: Date) => void;
  workoutDates?: Set<string>;
  resetToken?: number;
}

export default function DateSelector({ onDateChange, workoutDates, resetToken = 0 }: DateSelectorProps) {
  const days = getDaysArray(new Date(), 30);
  const todayIndex = days.findIndex(d => isToday(d));
  const scrollRef = useRef<any>(null);
  const scrollX = useRef(new Animated.Value(todayIndex * DAY_WIDTH)).current;
  const lastHapticIndex = useRef(todayIndex);
  const [_selectedIndex, setSelectedIndex] = useState(todayIndex);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: todayIndex * DAY_WIDTH, animated: false });
    }, 50);
  }, []);

  useEffect(() => {
    setSelectedIndex(todayIndex);
    lastHapticIndex.current = todayIndex;
    scrollRef.current?.scrollTo({ x: todayIndex * DAY_WIDTH, animated: true });
    onDateChange?.(days[todayIndex]);
  }, [days, onDateChange, resetToken, todayIndex]);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: Platform.OS !== 'web',
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / DAY_WIDTH);
        const clamped = Math.max(0, Math.min(days.length - 1, index));
        if (clamped !== lastHapticIndex.current) {
          lastHapticIndex.current = clamped;
          Haptics.selectionAsync();
        }
      },
    }
  );

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / DAY_WIDTH);
    const clamped = Math.max(0, Math.min(days.length - 1, index));
    setSelectedIndex(clamped);
    onDateChange?.(days[clamped]);
  }, [days, onDateChange]);

  return (
    <View style={styles.container}>
      <View style={styles.centerHighlight} />
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={DAY_WIDTH}
        decelerationRate="fast"
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {days.map((day, i) => {
          const today = isToday(day);
          const hasWorkout = workoutDates?.has(formatKey(day)) ?? false;

          const itemScale = scrollX.interpolate({
            inputRange: [(i - 1.5) * DAY_WIDTH, i * DAY_WIDTH, (i + 1.5) * DAY_WIDTH],
            outputRange: [0.8, 1.15, 0.8],
            extrapolate: 'clamp',
          });

          const itemOpacity = scrollX.interpolate({
            inputRange: [(i - 2.5) * DAY_WIDTH, i * DAY_WIDTH, (i + 2.5) * DAY_WIDTH],
            outputRange: [0.2, 1, 0.2],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={formatKey(day)}
              style={[
                styles.dayItem,
                {
                  opacity: itemOpacity,
                  transform: [{ scale: itemScale }],
                },
              ]}
            >
              <Text style={[styles.dayName, today && styles.todayAccent]}>
                {DAY_NAMES[day.getDay()]}
              </Text>
              {today && <View style={styles.todayMarker} />}
              <Text style={[styles.dayNumber, today && styles.todayAccent]}>
                {day.getDate()}
              </Text>
              {hasWorkout && <View style={styles.dot} />}
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
  },
  centerHighlight: {
    position: 'absolute',
    width: DAY_WIDTH - 2,
    height: 58,
    left: (SCREEN_WIDTH - DAY_WIDTH + 2) / 2,
    top: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(232, 232, 232, 0.07)',
    borderWidth: 0.5,
    borderColor: 'rgba(232, 232, 232, 0.1)',
  },
  scrollContent: {
    paddingHorizontal: SIDE_PADDING,
    alignItems: 'center',
  },
  dayItem: {
    width: DAY_WIDTH,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayName: {
    color: '#555',
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  dayNumber: {
    color: '#E8E8E8',
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  todayAccent: {
    color: '#fff',
  },
  todayMarker: {
    width: 12,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    marginBottom: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8E8E8',
    position: 'absolute',
    bottom: 3,
  },
});
