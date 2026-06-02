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

  it('averages dose adequacy across every trained muscle (any tier)', () => {
    const analysis = makeAnalysis({
      muscles: [
        // adequacy = clamp(2.3 / 1.8) = 1.0
        makeMuscle({ region_id: 'sternocostal', net_stimulus: 2.3, prime_sets: 6 }),
        // adequacy = 1.15 / 1.8 ≈ 0.639
        makeMuscle({ region_id: 'clavicular', net_stimulus: 1.15, prime_sets: 5, secondary_sets: 1 }),
        // adequacy = 0.4 / 1.8 ≈ 0.222 — counted even though prime_sets = 0
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
    // (1.0 + 0.639 + 0.222) / 3 = 0.620 -> 62
    expect(dials.stimulus).toBe(62);
    // Headroom over all 29 regions: 1 - (0.92 + 0.46 + 0.16)/29 ≈ 0.947 -> 95
    expect(dials.headroom).toBe(95);
  });

  it('caps stimulus at 100 when every trained muscle hits its dose', () => {
    const analysis = makeAnalysis({
      muscles: Array.from({ length: 22 }, (_, index) =>
        makeMuscle({
          region_id: `region-${index}`,
          net_stimulus: 6,
          prime_sets: 8,
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
    // 22 of 29 regions saturated, 7 still rested -> ~24
    expect(dials.headroom).toBe(24);
  });

  it('keeps Headroom high when only a single muscle is fried (whole-body semantics)', () => {
    const analysis = makeAnalysis({
      muscles: [
        // Saturated trained muscle
        makeMuscle({ region_id: 'sternocostal', stimulus: 3, net_stimulus: 2.5, prime_sets: 6 }),
        // Untrained — must contribute 0 fatigue, not be excluded
        makeMuscle({
          region_id: 'vasti', stimulus: 0, atrophy: 0, net_stimulus: 0,
          prime_sets: 0, secondary_sets: 0, tertiary_sets: 0,
        }),
      ],
      summary: {
        total_sets: 6, muscles_trained: 1, total_muscles: 29,
        avg_net_stimulus: 2.5, avg_sets_per_muscle: 6,
      },
    });
    const dials = computeDashboardDials(analysis);
    // One of 29 regions fully fried: 1 - 1/29 ≈ 0.966 -> 97. NOT 0.
    expect(dials.headroom).toBe(97);
  });

  it('reflects a bright-on-the-map muscle in the dial regardless of tier', () => {
    // A muscle the user did not target as a prime mover but received heavy
    // secondary/tertiary stimulus must register on the dial — the body map
    // shows it bright, the dial must agree.
    const analysis = makeAnalysis({
      muscles: [
        makeMuscle({
          region_id: 'glute_max', net_stimulus: 2.3, stimulus: 3,
          prime_sets: 0, secondary_sets: 0, tertiary_sets: 8,
        }),
      ],
      summary: {
        total_sets: 8, muscles_trained: 1, total_muscles: 29,
        avg_net_stimulus: 2.3, avg_sets_per_muscle: 8,
      },
    });
    const dials = computeDashboardDials(analysis);
    expect(dials.stimulus).toBe(100);
  });

  it('falls back to muscles.length when summary.total_muscles is zero', () => {
    const analysis = makeAnalysis({
      muscles: [makeMuscle({ region_id: 'sternocostal', net_stimulus: 2.5, prime_sets: 6 })],
      summary: {
        total_sets: 6, muscles_trained: 1, total_muscles: 0,
        avg_net_stimulus: 2.5, avg_sets_per_muscle: 6,
      },
    });
    const dials = computeDashboardDials(analysis);
    // Defensive: with total_muscles = 0 the denominator falls back to
    // muscles.length (1) -> single fried muscle -> headroom 0.
    expect(dials.headroom).toBe(0);
    expect(dials.stimulus).toBe(100);
  });
});

// --------------- baseline fixture sanity (property tests) ---------------

describe('dial values stay in range on a realistic baseline split', () => {
  // Snapshot of the 24 trained muscles from the PPL 7-day baseline fixture
  // (backend/tests/fixtures/analysis_engine_main_baseline.json). Inlined so
  // jest doesn't need to resolve a path into backend/. Catches calibration
  // regressions: if a reference split ever scores 0 or 100, something has
  // drifted in the dial formulas or the engine.
  const PPL_BASELINE_MUSCLES: Partial<MuscleStats>[] = [
    { region_id: 'clavicular', stimulus: 2.046, atrophy: 5.754, net_stimulus: -3.708, prime_sets: 3 },
    { region_id: 'sternocostal', stimulus: 3.36, atrophy: 1.233, net_stimulus: 2.127, prime_sets: 6 },
    { region_id: 'anterior_deltoid', stimulus: 1.773, atrophy: 0.411, net_stimulus: 1.362, prime_sets: 3 },
    { region_id: 'lateral_deltoid', stimulus: 3.115, atrophy: 1.233, net_stimulus: 1.882, prime_sets: 9 },
    { region_id: 'posterior_deltoid', stimulus: 2.738, atrophy: 0, net_stimulus: 2.738, prime_sets: 3 },
    { region_id: 'trapezius', stimulus: 2.951, atrophy: 1.233, net_stimulus: 1.718, prime_sets: 9 },
    { region_id: 'rhomboids', stimulus: 1.247, atrophy: 1.233, net_stimulus: 0.014, prime_sets: 9 },
    { region_id: 'spinal_erectors', stimulus: 0.842, atrophy: 1.233, net_stimulus: -0.391, prime_sets: 6 },
    { region_id: 'thoracic_lats', stimulus: 2.809, atrophy: 1.233, net_stimulus: 1.576, prime_sets: 6 },
    { region_id: 'iliac_lats', stimulus: 0.177, atrophy: 0, net_stimulus: 0.177, prime_sets: 0 },
    { region_id: 'biceps_brachii', stimulus: 2.718, atrophy: 1.233, net_stimulus: 1.485, prime_sets: 4 },
    { region_id: 'brachialis', stimulus: 0.525, atrophy: 1.233, net_stimulus: -0.708, prime_sets: 4 },
    { region_id: 'brachioradialis', stimulus: 0.266, atrophy: 0, net_stimulus: 0.266, prime_sets: 0 },
    { region_id: 'triceps_long_head', stimulus: 1.319, atrophy: 5.754, net_stimulus: -4.435, prime_sets: 2 },
    { region_id: 'triceps_lateral_medial', stimulus: 2.284, atrophy: 1.233, net_stimulus: 1.051, prime_sets: 4 },
    { region_id: 'glute_max', stimulus: 1.188, atrophy: 1.233, net_stimulus: -0.045, prime_sets: 14 },
    { region_id: 'vasti', stimulus: 1.415, atrophy: 1.233, net_stimulus: 0.182, prime_sets: 12 },
    { region_id: 'rectus_femoris', stimulus: 1.19, atrophy: 1.233, net_stimulus: -0.043, prime_sets: 12 },
    { region_id: 'hip_extensors', stimulus: 1.448, atrophy: 1.233, net_stimulus: 0.215, prime_sets: 10 },
    { region_id: 'knee_flexors', stimulus: 1.488, atrophy: 1.233, net_stimulus: 0.255, prime_sets: 4 },
    { region_id: 'gastrocnemius', stimulus: 1.939, atrophy: 1.233, net_stimulus: 0.706, prime_sets: 6 },
    { region_id: 'soleus', stimulus: 1.278, atrophy: 1.233, net_stimulus: 0.045, prime_sets: 6 },
    { region_id: 'hip_adductors', stimulus: 0.462, atrophy: 0, net_stimulus: 0.462, prime_sets: 0 },
    { region_id: 'deep_core', stimulus: 0.414, atrophy: 0, net_stimulus: 0.414, prime_sets: 0 },
  ];

  it('produces dials in [0, 100] and a stimulus reading consistent with a "decent" split', () => {
    const muscles = PPL_BASELINE_MUSCLES.map((m) => makeMuscle(m));
    const analysis = makeAnalysis({
      muscles,
      summary: {
        total_sets: 0, muscles_trained: 24, total_muscles: 29,
        avg_net_stimulus: 0.27, avg_sets_per_muscle: 0,
      },
    });
    const dials = computeDashboardDials(analysis);
    expect(dials.stimulus).toBeGreaterThanOrEqual(0);
    expect(dials.stimulus).toBeLessThanOrEqual(100);
    expect(dials.headroom).toBeGreaterThanOrEqual(0);
    expect(dials.headroom).toBeLessThanOrEqual(100);
    // PPL is a baseline reference split, not a perfect one. Expect a clearly
    // middling stimulus reading — neither cold (< 15, our prior bug) nor
    // saturated (> 80, would mean the anchor is too lenient).
    expect(dials.stimulus).toBeGreaterThan(20);
    expect(dials.stimulus).toBeLessThan(70);
    // Most muscles below the headroom ceiling, so headroom should be high.
    expect(dials.headroom).toBeGreaterThan(50);
  });

  it('maps every muscle in the PPL fixture to a valid 0–7 heat level', () => {
    const muscles = PPL_BASELINE_MUSCLES.map((m) => makeMuscle(m));
    const levels = musclesToStimulusLevels(muscles);
    for (const [regionId, level] of Object.entries(levels)) {
      expect(Number.isInteger(level)).toBe(true);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(7);
      // Bright muscles (net > 2.3) must hit level 7
      const net = muscles.find((m) => m.region_id === regionId)!.net_stimulus;
      if (net > 2.3) expect(level).toBe(7);
      if (net <= 0) expect(level).toBe(0);
    }
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
