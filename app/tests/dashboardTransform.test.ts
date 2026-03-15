jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {
  musclesToStimulusLevels,
  computeDashboardDials,
  generateInsights,
} from '../src/utils/analysisTransform';
import type { AnalysisResponse, MuscleStats } from '../src/types/api.types';

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
      makeMuscle({ region_id: 'sternocostal', net_stimulus: 3.2 }),
      makeMuscle({ region_id: 'clavicular', net_stimulus: 2.1 }),
      makeMuscle({ region_id: 'vasti', net_stimulus: 0 }),
    ];
    const levels = musclesToStimulusLevels(muscles);
    expect(levels).toEqual({
      sternocostal: 5,
      clavicular: 4,
      vasti: 0,
    });
  });
});

// --------------- computeDashboardDials ---------------

describe('computeDashboardDials', () => {
  it('returns zeroed dials for empty analysis', () => {
    const dials = computeDashboardDials(makeAnalysis());
    expect(dials.stimulus).toBe(0);
    expect(dials.fatigue).toBe(0);
    expect(dials.recovery).toBe(100);
  });

  it('computes stimulus dial from meaningfully trained muscles', () => {
    const analysis = makeAnalysis({
      muscles: [
        makeMuscle({ region_id: 'sternocostal', net_stimulus: 3.5, prime_sets: 6, secondary_sets: 0, tertiary_sets: 0 }),
        makeMuscle({ region_id: 'clavicular', net_stimulus: 3.0, prime_sets: 5, secondary_sets: 1, tertiary_sets: 0 }),
        makeMuscle({ region_id: 'vasti', net_stimulus: 0.4, prime_sets: 0, secondary_sets: 3, tertiary_sets: 2 }),
      ],
      summary: {
        total_sets: 20,
        muscles_trained: 3,
        total_muscles: 29,
        avg_net_stimulus: 2.3,
        avg_sets_per_muscle: 2,
      },
    });
    const dials = computeDashboardDials(analysis);
    expect(dials.stimulus).toBe(50);
  });

  it('caps stimulus at 100', () => {
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
  });

  it('computes fatigue dial from total_sets', () => {
    const analysis = makeAnalysis({
      muscles: [
        makeMuscle({ net_stimulus: 3, stimulus: 4.2 }),
        makeMuscle({ region_id: 'clavicular', net_stimulus: 2.5, stimulus: 3.5 }),
      ],
      summary: {
        total_sets: 30,
        muscles_trained: 10,
        total_muscles: 29,
        avg_net_stimulus: 3,
        avg_sets_per_muscle: 3,
      },
    });
    const dials = computeDashboardDials(analysis);
    expect(dials.fatigue).toBe(81);
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
