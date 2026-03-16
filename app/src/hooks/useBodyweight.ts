import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBodyweightEntries,
  createBodyweightEntry,
  deleteBodyweightEntry,
  bodyweightKeys,
} from '../api/bodyweight.api';
import { useSettingsStore } from '../stores/settingsStore';
import { convertLbToDisplay, parseWeightInput } from '../utils/unitConversion';
import type { BodyweightEntryResponse } from '../types/api.types';

export interface BodyweightStats {
  current: number;
  change: number;
  avg7Day: number;
  count: number;
  trendDirection: 'up' | 'down' | 'flat';
}

export interface BodyweightChartPoint {
  date: Date;
  weight: number;
}

export function useBodyweight() {
  const queryClient = useQueryClient();
  const weightUnit = useSettingsStore((s) => s.weightUnit);

  const { data, isLoading } = useQuery({
    queryKey: bodyweightKeys.list(),
    queryFn: getBodyweightEntries,
  });

  const entries = data?.entries ?? [];

  const addMutation = useMutation({
    mutationFn: createBodyweightEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bodyweightKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBodyweightEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bodyweightKeys.all });
    },
  });

  function logWeight(displayValue: number) {
    const weightInLbs = parseWeightInput(displayValue, weightUnit);
    if (weightInLbs <= 0) return;
    addMutation.mutate({ weight: weightInLbs });
  }

  const stats = useMemo((): BodyweightStats | null => {
    if (entries.length === 0) return null;

    const weights = entries.map((e: BodyweightEntryResponse) =>
      convertLbToDisplay(e.weight, weightUnit),
    );

    const current = weights[weights.length - 1];
    const starting = weights[0];
    const change = current - starting;

    const last7 = weights.slice(-7);
    const avg7Day = last7.reduce((a, b) => a + b, 0) / last7.length;

    // Trend based on last 3 entries
    let trendDirection: 'up' | 'down' | 'flat' = 'flat';
    if (weights.length >= 2) {
      const recent = weights.slice(-3);
      const diff = recent[recent.length - 1] - recent[0];
      if (diff > 0.3) trendDirection = 'up';
      else if (diff < -0.3) trendDirection = 'down';
    }

    return { current, change, avg7Day, count: entries.length, trendDirection };
  }, [entries, weightUnit]);

  const chartData = useMemo((): BodyweightChartPoint[] => {
    return entries.map((e: BodyweightEntryResponse) => ({
      date: new Date(e.recorded_at),
      weight: convertLbToDisplay(e.weight, weightUnit),
    }));
  }, [entries, weightUnit]);

  return {
    entries,
    stats,
    chartData,
    isLoading,
    weightUnit,
    logWeight,
    isLogging: addMutation.isPending,
    deleteEntry: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
