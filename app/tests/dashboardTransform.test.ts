jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {
  musclesToStimulusLevels,
  computeDashboardDials,
  computeProgressDial,
  generateInsights,
} from '../src/utils/analysisTransform';
import type { AnalysisResponse, MuscleStats, WorkoutLogResponse } from '../src/types/api.types';

// --------------- helpers ---------------

function makeMuscle(overrides: Partial<MuscleStats> = {}): MuscleStats {
  return {
    region_id: 'sternocostal',
    display_name: 'Mid/Lower Chest',
    parent_group: 'chest',
    stimulus: 3.0,
    atrophy: 0.5,
    net_stimulus: 2.5,
    primary_sets: 6,
    prime_sets: 6,
    secondary_sets: 0,
    tertiary_sets: 0,
    frequency: 2,
    leverage: 'M',
    damage_tier: '0',
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    split_name: 'Logged Workouts',
    cycle_length: 7,
    stimulus_duration: 48,
    maintenance_volume: 3,
    dataset: 'schoenfeld',
    muscles: [],
    group_summaries: [],
    suggestions: [],
    summary: {
      total_sets: 0,
      muscles_trained: 0,
      total_muscles: 29,
      avg_net_stimulus: 0,
      avg_sets_per_muscle: 0,
    },
    ...overrides,
  };
}

// --------------- musclesToStimulusLevels ---------------

describe('musclesToStimulusLevels', () => {
  it('returns empty object for empty muscles array', () => {
    expect(musclesToStimulusLevels([])).toEqual({});
  });

  it('maps region_id to heatmap stimulus levels', () => {
    const muscles = [
      makeMuscle({ region_id: 'sternocostal', net_stimulus: 3.2 }), // > 2.3 -> optimal
      makeMuscle({ region_id: 'clavicular', net_stimulus: 2.1 }),   // 1.8–2.3 -> high
      makeMuscle({ region_id: 'vasti', net_stimulus: 0 }),          // <= 0 -> maintenance
    ];
    const levels = musclesToStimulusLevels(muscles);
    expect(levels).toEqual({
      sternocostal: 7,
      clavicular: 6,
      vasti: 0,
    });
  });
});

// --------------- computeDashboardDials ---------------

describe('computeDashboardDials', () => {
  it('returns zeroed stimulus and full headroom for empty analysis', () => {
    const dials = computeDashboardDials(makeAnalysis());
    expect(dials.stimulus).toBe(0);
    expect(dials.headroom).toBe(100);
  });

  it('computes the stimulus dial as focus-weighted dose adequacy of prime movers', () => {
    const analysis = makeAnalysis({
      muscles: [
        // adequacy = clamp(2.3 / 2.3) = 1.0, focus = 1 + 1.00 * 0.35 = 1.35
        makeMuscle({ region_id: 'sternocostal', net_stimulus: 2.3, prime_sets: 6, secondary_sets: 0, tertiary_sets: 0 }),
        // adequacy = clamp(1.15 / 2.3) = 0.5, focus = 1 + (5/6) * 0.35 ≈ 1.2917
        makeMuscle({ region_id: 'clavicular', net_stimulus: 1.15, prime_sets: 5, secondary_sets: 1, tertiary_sets: 0 }),
        // prime_sets = 0 -> excluded from the targeted (prime-mover) set
        makeMuscle({ region_id: 'vasti', net_stimulus: 0.4, prime_sets: 0, secondary_sets: 3, tertiary_sets: 2 }),
      ],
      summary: {
        total_sets: 20,
        muscles_trained: 3,
        total_muscles: 29,
        avg_net_stimulus: 1.28,
        avg_sets_per_muscle: 2,
      },
    });
    const dials = computeDashboardDials(analysis);
    // (1.0*1.35 + 0.5*1.2917) / (1.35 + 1.2917) = 0.7555 -> 76
    expect(dials.stimulus).toBe(76);
    // Headroom over all 3 trained muscles: 1 - mean(clamp(net/2.5))
    // = 1 - (0.92 + 0.46 + 0.16)/3 = 0.4867 -> 49
    expect(dials.headroom).toBe(49);
  });

  it('caps stimulus at 100 when every prime mover hits an optimal dose', () => {
    const analysis = makeAnalysis({
      muscles: Array.from({ length: 22 }, (_, index) =>
        makeMuscle({
          region_id: `region-${index}`,
          net_stimulus: 6,
          prime_sets: 8,
          secondary_sets: 0,
          tertiary_sets: 0,
        }),
      ),
      summary: {
        total_sets: 60,
        muscles_trained: 22,
        total_muscles: 29,
        avg_net_stimulus: 10,
        avg_sets_per_muscle: 2,
      },
    });
    const dials = computeDashboardDials(analysis);
    expect(dials.stimulus).toBe(100);
    // Every muscle far above the ceiling -> no headroom left
    expect(dials.headroom).toBe(0);
  });

  it('excludes untrained muscles from headroom so a sparse split is not "fully rested"', () => {
    const analysis = makeAnalysis({
      muscles: [
        makeMuscle({ region_id: 'sternocostal', stimulus: 3, net_stimulus: 2.5, prime_sets: 6 }),
        // Untrained: stimulus 0 -> must not count as recovered headroom
        makeMuscle({ region_id: 'vasti', stimulus: 0, atrophy: 0, net_stimulus: 0, prime_sets: 0, secondary_sets: 0, tertiary_sets: 0 }),
      ],
    });
    const dials = computeDashboardDials(analysis);
    // Only the trained muscle counts: 1 - clamp(2.5/2.5) = 0
    expect(dials.headroom).toBe(0);
  });

});

// --------------- computeProgressDial ---------------

function makeWorkout(overrides: Partial<WorkoutLogResponse> = {}): WorkoutLogResponse {
  return {
    id: 'w1',
    user_id: 'u1',
    session_id: null,
    split_id: null,
    session_name: 'Push',
    completed_at: new Date().toISOString(),
    duration_minutes: null,
    notes: null,
    exercises: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeProgressDial', () => {
  it('returns 0 with fewer than 2 workouts', () => {
    expect(computeProgressDial([])).toBe(0);
    expect(computeProgressDial([makeWorkout()])).toBe(0);
  });

  it('returns ~50 when exercises are maintained', () => {
    const prev = makeWorkout({
      completed_at: '2026-03-10T10:00:00Z',
      exercises: [{
        id: 'e1', workout_log_id: 'w1', exercise_name: 'Bench Press',
        sets_completed: 3, reps: [8, 8, 8], weight: [100, 100, 100],
        rir: null, order_index: 0, notes: null, created_at: '',
      }],
    });
    const recent = makeWorkout({
      id: 'w2',
      completed_at: '2026-03-12T10:00:00Z',
      exercises: [{
        id: 'e2', workout_log_id: 'w2', exercise_name: 'Bench Press',
        sets_completed: 3, reps: [8, 8, 8], weight: [100, 100, 100],
        rir: null, order_index: 0, notes: null, created_at: '',
      }],
    });
    const score = computeProgressDial([prev, recent]);
    // Maintained = ratio 1.0, maps to (1.0-0.85)/0.30*100 = 50 for ratio part
    // 0 improved out of 1 = 0 improved share, so 50*0.7 + 0*0.3 = 35
    expect(score).toBe(35);
  });

  it('scores higher when exercises improve', () => {
    const prev = makeWorkout({
      completed_at: '2026-03-10T10:00:00Z',
      exercises: [{
        id: 'e1', workout_log_id: 'w1', exercise_name: 'Bench Press',
        sets_completed: 3, reps: [8, 8, 8], weight: [100, 100, 100],
        rir: null, order_index: 0, notes: null, created_at: '',
      }],
    });
    const recent = makeWorkout({
      id: 'w2',
      completed_at: '2026-03-12T10:00:00Z',
      exercises: [{
        id: 'e2', workout_log_id: 'w2', exercise_name: 'Bench Press',
        sets_completed: 3, reps: [9, 9, 8], weight: [105, 105, 105],
        rir: null, order_index: 0, notes: null, created_at: '',
      }],
    });
    const score = computeProgressDial([prev, recent]);
    expect(score).toBeGreaterThan(50);
  });

  it('returns 0 when no exercises overlap', () => {
    const prev = makeWorkout({
      completed_at: '2026-03-10T10:00:00Z',
      exercises: [{
        id: 'e1', workout_log_id: 'w1', exercise_name: 'Squat',
        sets_completed: 3, reps: [5, 5, 5], weight: [140, 140, 140],
        rir: null, order_index: 0, notes: null, created_at: '',
      }],
    });
    const recent = makeWorkout({
      id: 'w2',
      completed_at: '2026-03-12T10:00:00Z',
      exercises: [{
        id: 'e2', workout_log_id: 'w2', exercise_name: 'Deadlift',
        sets_completed: 3, reps: [5, 5, 5], weight: [180, 180, 180],
        rir: null, order_index: 0, notes: null, created_at: '',
      }],
    });
    expect(computeProgressDial([prev, recent])).toBe(0);
  });
});

// --------------- generateInsights ---------------

describe('generateInsights', () => {
  it('generates volume insight even with empty muscles', () => {
    const analysis = makeAnalysis();
    const insights = generateInsights(analysis);
    // Should have at least the volume insight
    expect(insights.length).toBeGreaterThanOrEqual(1);
    const volumeInsight = insights.find((i) => i.title === 'Weekly Volume');
    expect(volumeInsight).toBeDefined();
    expect(volumeInsight!.description).toContain('0 total sets');
  });

  it('generates balance insight when muscles are present', () => {
    const analysis = makeAnalysis({
      muscles: [
        makeMuscle({ region_id: 'sternocostal', display_name: 'Mid/Lower Chest', net_stimulus: 4 }),
        makeMuscle({ region_id: 'clavicular', display_name: 'Upper Chest', net_stimulus: 3 }),
        makeMuscle({ region_id: 'vasti', display_name: 'Vasti', net_stimulus: 0.5 }),
      ],
      summary: {
        total_sets: 18,
        muscles_trained: 3,
        total_muscles: 29,
        avg_net_stimulus: 2.5,
        avg_sets_per_muscle: 6,
      },
    });
    const insights = generateInsights(analysis);
    const balanceInsight = insights.find((i) => i.title === 'Muscle Balance');
    expect(balanceInsight).toBeDefined();
    // Vasti has net_stimulus < 1, should suggest adding volume
    expect(balanceInsight!.description).toContain('Vasti');
  });

  it('includes top suggestion when suggestions exist', () => {
    const analysis = makeAnalysis({
      suggestions: [
        {
          priority: 'HIGH',
          muscle: 'Hamstrings',
          issue: 'Not trained',
          suggestion: 'Add at least 3 sets per week.',
        },
      ],
      summary: {
        total_sets: 10,
        muscles_trained: 5,
        total_muscles: 29,
        avg_net_stimulus: 2,
        avg_sets_per_muscle: 2,
      },
    });
    const insights = generateInsights(analysis);
    const suggestion = insights.find((i) => i.title === 'Top Suggestion');
    expect(suggestion).toBeDefined();
    expect(suggestion!.description).toContain('Hamstrings');
  });
});
