import {
  AVG,
  MAINTENANCE_VOLUME,
  OPTIMAL_NET,
  STIMULUS_THRESHOLDS,
  TIER_BETA,
  analyzeTemplate,
  atrophyRatePerHour,
  cnsFatigueMult,
  computeWorkoutStimulus,
  e1rm,
  getLeverageMultiplier,
  getStimulusLevel,
  leverageAdjustedWeights,
  levelsFromNet,
  marginalAt,
  regionWindowHours,
  residualLocalMultiplier,
  rollingNet,
  stimulusAdequacy,
  stimulusScore,
} from '../src/analysis/stimulus';
import { EXERCISES, getExercise, Exercise } from '../src/data/exercises';
import { MUSCLE_REGIONS } from '../src/data/muscleRegions.gen';
import { MOVEMENT_PATTERNS } from '../src/data/movementPatterns.gen';

describe('empirical curves', () => {
  it('averages Schoenfeld and Pelland (values from MainClasses.py)', () => {
    expect(AVG[0]).toBeCloseTo(1.0);
    expect(AVG[1]).toBeCloseTo(1.64);
    expect(AVG[8]).toBeCloseTo(3.695);
  });

  it('marginals are the per-set deltas, decaying past set 9', () => {
    expect(marginalAt(0)).toBeCloseTo(1.0);
    expect(marginalAt(1)).toBeCloseTo(0.64);
    expect(marginalAt(9)).toBeCloseTo(marginalAt(8) * 0.97);
    expect(marginalAt(1)).toBeGreaterThan(marginalAt(2));
  });

  it('residual multiplier softens by beta', () => {
    // beta 0 → no diminishing returns at all
    expect(residualLocalMultiplier(5, 0)).toBeCloseTo(1.0);
    // beta 1 → full marginal curve
    expect(residualLocalMultiplier(2, 1)).toBeCloseTo(marginalAt(2));
    // quaternary is nearly flat
    expect(residualLocalMultiplier(4, TIER_BETA.quaternary)).toBeGreaterThan(0.85);
  });
});

describe('canonical stimulus scale', () => {
  it('maps thresholds inclusively on the upper bound', () => {
    expect(getStimulusLevel(0)).toBe(0);
    expect(getStimulusLevel(0.3)).toBe(1);
    expect(getStimulusLevel(0.31)).toBe(2);
    expect(getStimulusLevel(1.8)).toBe(5);
    expect(getStimulusLevel(2.31)).toBe(7);
    expect(getStimulusLevel(NaN)).toBe(0);
    expect(STIMULUS_THRESHOLDS.length).toBe(7);
  });

  it('adequacy saturates at OPTIMAL_NET', () => {
    expect(stimulusAdequacy(OPTIMAL_NET)).toBe(1);
    expect(stimulusAdequacy(OPTIMAL_NET / 2)).toBeCloseTo(0.5);
    expect(stimulusAdequacy(-1)).toBe(0);
  });

  it('score is the mean adequacy across trained muscles', () => {
    expect(stimulusScore({ a: 1.8, b: 0.9 })).toBe(75);
    expect(stimulusScore({})).toBe(0);
    expect(levelsFromNet({ a: 1.8 }).a).toBe(5);
  });
});

describe('CNS fatigue (exponential, fatigue_modifiers.py)', () => {
  it('starts fresh at 1.0 and decays toward the 0.85 floor', () => {
    expect(cnsFatigueMult(0)).toBeCloseTo(1.0);
    expect(cnsFatigueMult(10)).toBeCloseTo(0.85 + 0.15 * Math.exp(-0.6), 5);
    expect(cnsFatigueMult(500)).toBeCloseTo(0.85, 3);
  });

  it('axial fatigue adds 2.5 set-equivalents per unit', () => {
    expect(cnsFatigueMult(0, 2)).toBeCloseTo(cnsFatigueMult(5, 0), 10);
  });
});

describe('leverage matching', () => {
  it('matches the LEVERAGE_MATCH_MULTIPLIERS table', () => {
    expect(getLeverageMultiplier('S', 'ascending')).toBe(1.0);
    expect(getLeverageMultiplier('S', 'descending')).toBe(0.7);
    expect(getLeverageMultiplier('M', 'mid')).toBe(1.0);
    expect(getLeverageMultiplier('L', 'ascending')).toBe(0.7);
    expect(getLeverageMultiplier('?', 'mid')).toBe(0.85); // unknown default
  });

  it('conserves total weight when a perfect-match pool exists', () => {
    const bench = getExercise('barbell_bench_press');
    expect(bench).toBeDefined();
    const adjusted = leverageAdjustedWeights(bench as Exercise);
    const originalTotal = (bench as Exercise).muscles.reduce((n, m) => n + m.weight, 0);
    const adjustedTotal = [...adjusted.values()].reduce((n, v) => n + v, 0);
    // Perfect pool exists for 'mid' profiles (M-leverage muscles), so the
    // lost stimulus is fully redistributed.
    expect(adjustedTotal).toBeCloseTo(originalTotal, 5);
  });
});

describe('recovery windows', () => {
  it('scales the 48h base by the region recovery modifier', () => {
    for (const [region, meta] of Object.entries(MUSCLE_REGIONS)) {
      expect(regionWindowHours(region)).toBeCloseTo(48 * meta.recoveryModifier);
    }
    expect(regionWindowHours('nonexistent')).toBe(48);
  });
});

describe('workout stimulus', () => {
  const bench = getExercise('barbell_bench_press') as Exercise;

  it('accumulates diminishing returns on the prime mover', () => {
    const one = computeWorkoutStimulus([{ exercise: bench, sets: 1 }]);
    const three = computeWorkoutStimulus([{ exercise: bench, sets: 3 }]);
    const prime = 'sternocostal';
    expect(three[prime]).toBeGreaterThan(one[prime]);
    expect(three[prime]).toBeLessThan(one[prime] * 3); // diminishing
  });

  it('applies the recovery penalty inside the window', () => {
    const fresh = computeWorkoutStimulus([{ exercise: bench, sets: 3 }]);
    const window = regionWindowHours('sternocostal');
    const half = computeWorkoutStimulus([{ exercise: bench, sets: 3 }], {
      hoursSinceByRegion: { sternocostal: window / 2 },
    });
    expect(half.sternocostal).toBeCloseTo(fresh.sternocostal / 2, 5);
    const recovered = computeWorkoutStimulus([{ exercise: bench, sets: 3 }], {
      hoursSinceByRegion: { sternocostal: window + 1 },
    });
    expect(recovered.sternocostal).toBeCloseTo(fresh.sternocostal, 10);
  });

  it('gives unilateral movements the +5% bonus', () => {
    const unilateral = EXERCISES.find((e) => e.unilateral && e.muscles.length > 0);
    expect(unilateral).toBeDefined();
    const withBonus = computeWorkoutStimulus([{ exercise: unilateral as Exercise, sets: 1 }]);
    const noBonus = computeWorkoutStimulus([
      { exercise: { ...(unilateral as Exercise), unilateral: false }, sets: 1 },
    ]);
    const region = (unilateral as Exercise).muscles[0].region;
    expect(withBonus[region]).toBeCloseTo(noBonus[region] * 1.05, 5);
  });
});

describe('atrophy + weekly steady state', () => {
  const squat = getExercise('back_squat') as Exercise;
  const entries = [{ exercise: squat, sets: 3 }];

  it('maintenance volume anchors the atrophy rate', () => {
    const rate = atrophyRatePerHour(48);
    expect(rate).toBeCloseTo(AVG[MAINTENANCE_VOLUME - 1] / (168 - 48));
    expect(atrophyRatePerHour(168)).toBe(0);
  });

  it('net is stimulus minus atrophy (less than raw stimulus)', () => {
    const raw = computeWorkoutStimulus(entries);
    const net = analyzeTemplate(entries, 1);
    for (const region of Object.keys(net)) {
      expect(net[region]).toBeLessThan(raw[region]);
    }
  });

  it('training the template more often increases weekly net', () => {
    const once = analyzeTemplate(entries, 1);
    const twice = analyzeTemplate(entries, 2);
    expect(twice.vasti).toBeGreaterThan(once.vasti);
  });

  it('returns empty for an empty template', () => {
    expect(analyzeTemplate([], 2)).toEqual({});
  });
});

describe('rolling decay', () => {
  it('holds through the window then decays to zero by a week', () => {
    const net = { biceps_brachii: 1.0 };
    expect(rollingNet([{ stimulus: net, daysAgo: 1 }]).biceps_brachii).toBeCloseTo(1);
    expect(rollingNet([{ stimulus: net, daysAgo: 8 }]).biceps_brachii ?? 0).toBe(0);
    const mid = rollingNet([{ stimulus: net, daysAgo: 5 }]).biceps_brachii;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('e1RM (Brzycki)', () => {
  it('computes the standard formula', () => {
    expect(e1rm(100, 10)).toBeCloseTo((100 * 36) / 27);
    expect(e1rm(225, 1)).toBeCloseTo(225);
    expect(e1rm(0, 10)).toBe(0);
    expect(e1rm(100, 40)).toBe(100 * 36); // degenerate guard
  });
});

describe('generated data integrity', () => {
  it('has 29 regions, 38 patterns, and a 300+ exercise catalog', () => {
    expect(Object.keys(MUSCLE_REGIONS).length).toBe(29);
    expect(Object.keys(MOVEMENT_PATTERNS).length).toBe(38);
    expect(EXERCISES.length).toBeGreaterThanOrEqual(300);
  });

  it('every pattern region exists in the region table', () => {
    for (const pattern of Object.values(MOVEMENT_PATTERNS)) {
      for (const tier of [pattern.prime, pattern.secondary, pattern.tertiary, pattern.quaternary]) {
        for (const region of Object.keys(tier)) {
          expect(MUSCLE_REGIONS[region]).toBeDefined();
        }
      }
    }
  });

  it('seed template ids resolve', () => {
    for (const id of [
      'barbell_bench_press',
      'pull_up',
      'back_squat',
      'romanian_deadlift',
      'standing_calf_raise',
    ]) {
      expect(getExercise(id)).toBeDefined();
    }
  });
});
