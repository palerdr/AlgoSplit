import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';

// Format date for display
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format time for display
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Format duration in minutes to readable string
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Calculate estimated 1RM using Epley formula
export function calculate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Format weight with unit
export function formatWeight(pounds: number, unit: 'lb' | 'kg' = 'lb'): string {
  if (unit === 'kg') {
    return `${Math.round(pounds * 0.453592)}kg`;
  }
  return `${pounds}lb`;
}

// Get relative time string
export function getRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

// Debounce function
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Storage helpers with type safety (AsyncStorage for React Native)
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const item = await AsyncStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or not available
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

// Calculate effective (stimulating) reps from total reps and RIR
// The last 5 reps before failure are considered stimulating
// No RIR logged = assume trained to/near failure = 5 effective reps
export function calculateEffectiveReps(reps: number, rir: number | null): number {
  if (rir === null || rir === undefined) return Math.min(reps, 5);
  return Math.min(reps, Math.max(0, 5 - rir));
}

// Stimulus level helper - returns 0-7 based on net_stimulus value
export function getStimulusLevel(netStimulus: number): number {
  if (netStimulus <= 0) return 0;
  if (netStimulus < 0.5) return 1;
  if (netStimulus < 1.0) return 2;
  if (netStimulus < 1.75) return 3;
  if (netStimulus < 2.5) return 4;
  if (netStimulus < 3.25) return 5;
  if (netStimulus < 4.0) return 6;
  return 7;
}

// Get stimulus color from the theme based on level (0-7)
export function getStimulusColor(level: number): string {
  return colors.stimulus[Math.min(level, 7)];
}
