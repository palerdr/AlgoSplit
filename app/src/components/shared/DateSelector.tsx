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
import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAY_WIDTH = 44;
const DAY_HEIGHT = 76;
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
  const days = useMemo(() => getDaysArray(new Date(), 30), []);
  const todayIndex = useMemo(() => days.findIndex(d => isToday(d)), [days]);
  const scrollRef = useRef<any>(null);
  const hasPositionedInitially = useRef(false);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOffsetRef = useRef(todayIndex * DAY_WIDTH);
  const isAutoSnappingRef = useRef(false);
  const scrollX = useRef(new Animated.Value(todayIndex * DAY_WIDTH)).current;
  const lastHapticIndex = useRef(todayIndex);
  const [_selectedIndex, setSelectedIndex] = useState(todayIndex);

  const snapToIndex = useCallback((index: number, animated = true) => {
    isAutoSnappingRef.current = true;
    scrollRef.current?.scrollTo({
      x: index * DAY_WIDTH,
      animated,
    });
    if (snapReleaseRef.current) {
      clearTimeout(snapReleaseRef.current);
    }
    snapReleaseRef.current = setTimeout(() => {
      isAutoSnappingRef.current = false;
      snapReleaseRef.current = null;
    }, animated ? 220 : 0);
  }, []);

  const settleToOffset = useCallback((offsetX: number, animated = true) => {
    const index = Math.round(offsetX / DAY_WIDTH);
    const clamped = Math.max(0, Math.min(days.length - 1, index));
    snapToIndex(clamped, animated);
    setSelectedIndex(clamped);
    onDateChange?.(days[clamped]);
  }, [days, onDateChange, snapToIndex]);

  const scheduleSettle = useCallback((offsetX: number, delayMs: number) => {
    if (snapTimeoutRef.current) {
      clearTimeout(snapTimeoutRef.current);
    }
    snapTimeoutRef.current = setTimeout(() => {
      settleToOffset(offsetX);
      snapTimeoutRef.current = null;
    }, delayMs);
  }, [settleToOffset]);

  useEffect(() => {
    setSelectedIndex(todayIndex);
    lastHapticIndex.current = todayIndex;
    requestAnimationFrame(() => {
      snapToIndex(todayIndex, hasPositionedInitially.current);
      hasPositionedInitially.current = true;
    });
    onDateChange?.(days[todayIndex]);
  }, [days, onDateChange, resetToken, snapToIndex, todayIndex]);

  useEffect(() => {
    return () => {
      if (snapTimeoutRef.current) {
        clearTimeout(snapTimeoutRef.current);
      }
      if (snapReleaseRef.current) {
        clearTimeout(snapReleaseRef.current);
      }
    };
  }, []);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: Platform.OS !== 'web',
      listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        latestOffsetRef.current = offsetX;
        const index = Math.round(offsetX / DAY_WIDTH);
        const clamped = Math.max(0, Math.min(days.length - 1, index));
        if (clamped !== lastHapticIndex.current) {
          lastHapticIndex.current = clamped;
          Haptics.selectionAsync();
        }
        if (!isAutoSnappingRef.current) {
          scheduleSettle(offsetX, 90);
        }
      },
    }
  );

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    latestOffsetRef.current = e.nativeEvent.contentOffset.x;
    settleToOffset(latestOffsetRef.current);
  }, [settleToOffset]);

  const handleScrollEndDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    latestOffsetRef.current = e.nativeEvent.contentOffset.x;
    scheduleSettle(latestOffsetRef.current, 60);
  }, [scheduleSettle]);

  return (
    <View style={styles.container}>
      <View style={styles.centerHighlight} />
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        decelerationRate="fast"
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {days.map((day, i) => {
          const today = isToday(day);
          const hasWorkout = workoutDates?.has(formatKey(day)) ?? false;

          const itemScale = scrollX.interpolate({
            inputRange: [(i - 1.5) * DAY_WIDTH, i * DAY_WIDTH, (i + 1.5) * DAY_WIDTH],
            outputRange: [0.88, 1.04, 0.88],
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
              <Text style={[styles.dayNumber, today && styles.todayAccent]}>
                {day.getDate()}
              </Text>
              <View
                style={[
                  styles.dot,
                  hasWorkout && styles.workoutDot,
                  today && styles.todayDot,
                  today && hasWorkout && styles.todayDotFilled,
                ]}
              />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: DAY_HEIGHT,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
  },
  centerHighlight: {
    position: 'absolute',
    width: DAY_WIDTH - 2,
    height: DAY_HEIGHT - 8,
    left: (SCREEN_WIDTH - DAY_WIDTH + 2) / 2,
    top: 4,
    borderRadius: 18,
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
    height: DAY_HEIGHT - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayName: {
    color: '#555',
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  dayNumber: {
    color: '#E8E8E8',
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginBottom: 10,
  },
  todayAccent: {
    color: '#fff',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'transparent',
    position: 'absolute',
    bottom: 10,
  },
  todayDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#22C55E',
    backgroundColor: '#0D0D0D',
  },
  todayDotFilled: {
    backgroundColor: '#22C55E',
  },
  workoutDot: {
    backgroundColor: '#22C55E',
  },
});
