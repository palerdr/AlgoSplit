import {
  analyzeSchedule,
  analyzeTemplate,
  netScoreExact,
  stimulusScore,
} from '../src/analysis/stimulus';
import {
  buildSchedule,
  recommendForSource,
  recommendMoves,
  setFatigueLoad,
  ScheduleSource,
} from '../src/analysis/recommendations';
import { Exercise, getExercise } from '../src/data/exercises';

const exercise = (id: string) => getExercise(id) as Exercise;

// A full-body day whose upper-arm work is already saturated — the shape that
// makes trimming volume outrank adding it.
const FULL_BODY: ScheduleSource = {
  cycleLength: 7,
  sessions: [1, 3, 5].map((day) => ({
    name: `Full Body ${day}`,
    day,
    exercises: [
      { name: 'Back Squat', sets: 3 },
      { name: 'Barbell Bench Press', sets: 3 },
      { name: 'Barbell Row', sets: 3 },
      { name: 'Romanian Deadlift', sets: 3 },
      { name: 'Overhead Press', sets: 2 },
      { name: 'Lateral Raise', sets: 2 },
      { name: 'Barbell Curl', sets: 2 },
      { name: 'Tricep Pushdown', sets: 2 },
    ],
  })),
};

describe('netScoreExact', () => {
  it('is the unrounded form of the record-shaped score', () => {
    const net = { a: 1.8, b: 0.9 };
    expect(netScoreExact(net)).toBeCloseTo(75);
    expect(stimulusScore(net)).toBe(Math.round(netScoreExact(net)));
    expect(netScoreExact({})).toBe(0);
    expect(netScoreExact({ a: -1 })).toBe(0);
  });

  it('resolves moves that integer rounding would tie', () => {
    expect(netScoreExact({ a: 1.0 })).not.toBe(netScoreExact({ a: 1.01 }));
  });
});

describe('analyzeSchedule', () => {
  const entries = [{ exercise: exercise('back_squat'), sets: 3 }];

  it('matches analyzeTemplate when the sessions are identical and daily', () => {
    const template = analyzeTemplate(entries, 7);
    const schedule = analyzeSchedule(
      [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, entries })),
      7
    );
    for (const region of Object.keys(template)) {
      expect(schedule[region]).toBeCloseTo(template[region], 6);
    }
  });

  it('models sessions that differ day to day', () => {
    const push = [{ exercise: exercise('barbell_bench_press'), sets: 4 }];
    const pull = [{ exercise: exercise('barbell_row'), sets: 4 }];
    const net = analyzeSchedule(
      [
        { day: 1, entries: push },
        { day: 3, entries: pull },
      ],
      7
    );
    expect(net.sternocostal).toBeGreaterThan(0);
    expect(net.trapezius).toBeGreaterThan(0);
  });

  it('normalizes a non-weekly cycle to a week', () => {
    const weekly = analyzeSchedule([{ day: 1, entries }], 7);
    const everyOtherDay = analyzeSchedule([{ day: 1, entries }], 2);
    // Same session, 3.5x the weekly frequency — strictly more weekly net.
    expect(everyOtherDay.vasti).toBeGreaterThan(weekly.vasti);
  });

  it('returns empty for a schedule with no sessions', () => {
    expect(analyzeSchedule([], 7)).toEqual({});
  });
});

describe('buildSchedule', () => {
  it('resolves catalog names and keeps the pattern profile when unset', () => {
    const schedule = buildSchedule({
      cycleLength: 7,
      sessions: [{ name: 'Push', day: 1, exercises: [{ name: 'Lateral Raise', sets: 3 }] }],
    });
    // Lateral raise's pattern profile is descending — an unset row must not
    // silently become 'mid'.
    expect(schedule.sessions[0].exercises[0].exercise.resistanceProfile).toBe('descending');
    expect(schedule.unresolved).toEqual([]);
  });

  it('applies a stored override over the pattern default', () => {
    const schedule = buildSchedule({
      cycleLength: 7,
      sessions: [
        {
          name: 'Push',
          day: 1,
          exercises: [{ name: 'Lateral Raise', sets: 3, resistanceProfile: 'ascending' }],
        },
      ],
    });
    expect(schedule.sessions[0].exercises[0].exercise.resistanceProfile).toBe('ascending');
  });

  it('applies a stored unilateral flag over the catalog default', () => {
    const schedule = buildSchedule({
      cycleLength: 7,
      sessions: [
        {
          name: 'Push',
          day: 1,
          exercises: [{ name: 'Barbell Bench Press', sets: 3, unilateral: true }],
        },
      ],
    });
    expect(schedule.sessions[0].exercises[0].exercise.unilateral).toBe(true);
  });

  it('reports names the catalog does not know instead of dropping them silently', () => {
    const schedule = buildSchedule({
      cycleLength: 7,
      sessions: [
        {
          name: 'Push',
          day: 1,
          exercises: [
            { name: 'Barbell Bench Press', sets: 3 },
            { name: 'Zercher Good Morning Thing', sets: 3 },
          ],
        },
      ],
    });
    expect(schedule.unresolved).toEqual(['Zercher Good Morning Thing']);
    expect(schedule.sessions[0].exercises).toHaveLength(1);
  });

  it('grows the cycle to fit the highest day number', () => {
    const schedule = buildSchedule({
      cycleLength: 3,
      sessions: [{ name: 'A', day: 9, exercises: [{ name: 'Back Squat', sets: 3 }] }],
    });
    expect(schedule.cycleLength).toBe(9);
  });
});

describe('setFatigueLoad', () => {
  it('prices axial, high-damage movements above isolation work', () => {
    expect(setFatigueLoad(exercise('back_squat'))).toBeGreaterThan(
      setFatigueLoad(exercise('tricep_pushdown'))
    );
    expect(setFatigueLoad(exercise('romanian_deadlift'))).toBeGreaterThan(
      setFatigueLoad(exercise('lateral_raise'))
    );
  });

  it('is always positive, even for sparse involvement data', () => {
    for (const id of ['back_squat', 'barbell_curl', 'lateral_raise']) {
      expect(setFatigueLoad(exercise(id))).toBeGreaterThan(0);
    }
  });
});

describe('recommendMoves', () => {
  const result = recommendForSource(FULL_BODY, 6);

  it('produces ranked moves against a real split', () => {
    expect(result.moves.length).toBeGreaterThan(0);
    expect(result.baselineScore).toBeGreaterThan(0);
    expect(result.baselineScore).toBeLessThan(100);
  });

  it('only proposes moves that raise the score', () => {
    for (const move of result.moves) {
      expect(move.deltaScore).toBeGreaterThan(0);
    }
  });

  it('ranks fatigue-free moves ahead of moves that cost fatigue', () => {
    const firstCostly = result.moves.findIndex((move) => move.deltaFatigue > 0);
    const lastFree = result.moves.map((move) => move.deltaFatigue <= 0).lastIndexOf(true);
    if (firstCostly !== -1 && lastFree !== -1) {
      expect(lastFree).toBeLessThan(firstCostly);
    }
  });

  it('orders fatigue-costing moves by score per unit fatigue', () => {
    const costly = recommendForSource(FULL_BODY, 200).moves.filter(
      (move) => move.deltaFatigue > 0
    );
    expect(costly.length).toBeGreaterThan(0);
    for (let i = 1; i < costly.length; i++) {
      expect(costly[i - 1].efficiency).toBeGreaterThanOrEqual(costly[i].efficiency);
    }
  });

  it('always shows one move that costs fatigue, so the trade-off is visible', () => {
    // Free profile corrections outrank everything and would otherwise fill
    // every slot, hiding the score-per-fatigue ranking entirely.
    const shown = recommendForSource(FULL_BODY, 4).moves;
    expect(shown).toHaveLength(4);
    expect(shown.some((move) => move.deltaFatigue > 0)).toBe(true);
    expect(shown.filter((move) => move.deltaFatigue > 0)).toHaveLength(1);
  });

  it('prices resistance-profile corrections as free', () => {
    const profileMoves = recommendForSource(FULL_BODY, 40).moves.filter(
      (move) => move.kind === 'profile'
    );
    expect(profileMoves.length).toBeGreaterThan(0);
    for (const move of profileMoves) {
      expect(move.deltaFatigue).toBe(0);
      expect(move.efficiency).toBe(Infinity);
    }
  });

  it('signs fatigue by direction: trims free it, added sets spend it', () => {
    for (const move of recommendForSource(FULL_BODY, 60).moves) {
      if (move.kind === 'trim') expect(move.deltaFatigue).toBeLessThan(0);
      if (move.kind === 'add') expect(move.deltaFatigue).toBeGreaterThan(0);
    }
  });

  it('rejects moves that gain only by dropping a muscle out of the score', () => {
    // Cutting curls measures +3.2 on the displayed score purely because
    // brachialis falls below zero and leaves the denominator. Ranking against a
    // fixed muscle set must not surface that as an improvement.
    const curlTrims = recommendForSource(FULL_BODY, 200).moves.filter(
      (move) => move.kind === 'trim' && /curl/i.test(move.exerciseName)
    );
    expect(curlTrims).toEqual([]);
  });

  it('every proposed move raises net stimulus somewhere', () => {
    for (const move of recommendForSource(FULL_BODY, 200).moves) {
      expect(Object.values(move.deltaNet).some((value) => value > 0.005)).toBe(true);
      expect(move.drivers.length).toBeGreaterThan(0);
    }
  });

  it('proposes each movement at most once', () => {
    const names = recommendForSource(FULL_BODY, 200).moves.map((move) =>
      move.exerciseName.toLocaleLowerCase()
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('applies a move to every day the movement appears on', () => {
    // The full-body fixture runs each movement three times a week.
    for (const move of result.moves) {
      expect(move.occurrences).toBe(3);
      expect(move.sessionName).toBe('3 days');
    }
    const ppl = recommendForSource(
      {
        cycleLength: 7,
        sessions: [
          { name: 'Push', day: 1, exercises: [{ name: 'Barbell Bench Press', sets: 4 }] },
          { name: 'Pull', day: 2, exercises: [{ name: 'Barbell Row', sets: 4 }] },
        ],
      },
      10
    );
    for (const move of ppl.moves) {
      expect(move.occurrences).toBe(1);
      expect(['Push', 'Pull']).toContain(move.sessionName);
    }
  });

  describe('combined moves', () => {
    const { combined, moves } = result;

    it('reports every ranked move applied at once', () => {
      expect(combined).not.toBeNull();
      expect(combined?.count).toBe(moves.length);
      expect(combined?.deltaScore).toBeGreaterThan(0);
    });

    it('beats any single move on its own', () => {
      const bestSingle = Math.max(...moves.map((move) => move.deltaScore));
      expect(combined?.deltaScore).toBeGreaterThan(bestSingle);
    });

    it('is simulated, not summed — the engine is non-linear', () => {
      const summedScore = moves.reduce((total, move) => total + move.deltaScore, 0);
      expect(combined?.deltaScore).not.toBeCloseTo(summedScore, 3);
      // Same for the per-region preview the ghost bars draw.
      const summedNet: Record<string, number> = {};
      for (const move of moves) {
        for (const [region, delta] of Object.entries(move.deltaNet)) {
          summedNet[region] = (summedNet[region] ?? 0) + delta;
        }
      }
      const differs = Object.keys(summedNet).some(
        (region) =>
          Math.abs((combined?.deltaNet[region] ?? 0) - summedNet[region]) > 1e-6
      );
      expect(differs).toBe(true);
    });

    it('sums fatigue, which is the one additive term', () => {
      const summedFatigue = moves.reduce((total, move) => total + move.deltaFatigue, 0);
      expect(combined?.deltaFatigue).toBeCloseTo(summedFatigue, 10);
    });

    it('is null when there is nothing to suggest', () => {
      expect(recommendMoves(buildSchedule({ cycleLength: 7, sessions: [] })).combined).toBeNull();
    });
  });

  it('attributes each move to the regions it actually moves', () => {
    for (const move of result.moves) {
      expect(Object.keys(move.deltaNet).length).toBeGreaterThan(0);
      expect(move.exerciseName).toBeTruthy();
      expect(move.sessionName).toBeTruthy();
    }
  });

  it('respects the limit and returns nothing for an empty split', () => {
    expect(recommendForSource(FULL_BODY, 2).moves).toHaveLength(2);
    const empty = recommendMoves(buildSchedule({ cycleLength: 7, sessions: [] }));
    expect(empty.moves).toEqual([]);
    expect(empty.baselineScore).toBe(0);
  });

  it('never proposes trimming a single-set exercise out of existence', () => {
    const single = recommendForSource(
      {
        cycleLength: 7,
        sessions: [
          { name: 'A', day: 1, exercises: [{ name: 'Barbell Curl', sets: 1 }] },
        ],
      },
      20
    );
    expect(single.moves.every((move) => move.kind !== 'trim')).toBe(true);
  });

  it('will not trim a movement that runs a single set on any day', () => {
    const mixed = recommendForSource(
      {
        cycleLength: 7,
        sessions: [
          { name: 'A', day: 1, exercises: [{ name: 'Barbell Curl', sets: 1 }] },
          { name: 'B', day: 4, exercises: [{ name: 'Barbell Curl', sets: 3 }] },
        ],
      },
      20
    );
    expect(mixed.moves.every((move) => move.kind !== 'trim')).toBe(true);
  });
});
