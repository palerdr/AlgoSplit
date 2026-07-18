import type {
  ExerciseResponse,
  SessionTemplateResponse,
  SplitResponse,
} from '../src/api/backend';
import {
  accountWorkoutEditorGroups,
  accountWorkoutGroups,
  accountWorkoutPlans,
  resolveSavedExercise,
  templateWorkoutPlans,
} from '../src/workout/splitSessions';
import { MAX_SPLIT_DAYS } from '../src/workout/splitEditing';

function exercise(
  overrides: Partial<ExerciseResponse> & Pick<ExerciseResponse, 'id' | 'exercise_name'>
): ExerciseResponse {
  return {
    session_id: 'session-1',
    sets: 3,
    order_index: 0,
    unilateral: false,
    resistance_profile: 'mid',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function split(): SplitResponse {
  return {
    id: 'split-1',
    user_id: 'user-1',
    name: 'My Actual Split',
    cycle_length: 8,
    stimulus_duration: 48,
    maintenance_volume: 4,
    dataset: 'average',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sessions: [
      {
        id: 'session-2',
        split_id: 'split-1',
        name: 'Lower',
        day_number: 4,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        exercises: [
          exercise({ id: 'ex-2', exercise_name: 'Leg Press', order_index: 1, sets: 4 }),
          exercise({ id: 'ex-1', exercise_name: 'Back Squat', order_index: 0, sets: 5 }),
        ],
      },
      {
        id: 'session-1',
        split_id: 'split-1',
        name: 'Upper',
        day_number: 1,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        exercises: [exercise({ id: 'ex-3', exercise_name: 'Barbell Bench Press' })],
      },
    ],
  };
}

describe('account workout plans', () => {
  it('groups sessions beneath their persisted split', () => {
    const groups = accountWorkoutGroups([split()]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: 'split-1',
      name: 'My Actual Split',
      cycleLength: 8,
    });
    expect(groups[0].sessions.map((session) => session.name)).toEqual(['Upper', 'Lower']);
  });

  it('flattens real split sessions in day and exercise order', () => {
    const plans = accountWorkoutPlans([split()]);

    expect(plans.map((plan) => plan.name)).toEqual(['Upper', 'Lower']);
    expect(plans[0]).toMatchObject({
      splitName: 'My Actual Split',
      dayNumber: 1,
      sessionId: 'session-1',
    });
    expect(plans[1].exercises.map(({ exercise, sets }) => [exercise.name, sets])).toEqual([
      ['Back Squat', 5],
      ['Leg Press', 4],
    ]);
  });

  it('resolves catalog exercises using normalized saved names', () => {
    const resolved = resolveSavedExercise(
      exercise({ id: 'catalog', exercise_name: 'barbell-bench press' })
    );

    expect(resolved.id).toBe('barbell_bench_press');
    expect(resolved.muscles.length).toBeGreaterThan(0);
  });

  it('keeps custom exercises instead of silently dropping them', () => {
    const resolved = resolveSavedExercise(
      exercise({
        id: 'custom-9',
        exercise_name: 'My Cable Sweep',
        unilateral: true,
        resistance_profile: 'ascending',
      })
    );

    expect(resolved).toMatchObject({
      id: 'account:custom-9',
      name: 'My Cable Sweep',
      unilateral: true,
      resistanceProfile: 'ascending',
      muscles: [],
    });
  });

  it('adds every missing cycle day as rest and excludes them from the start registry', () => {
    const source = split();
    source.cycle_length = 4;
    source.sessions.find((session) => session.day_number === 4)!.day_number = 3;

    const editorDays = accountWorkoutEditorGroups([source])[0].sessions;
    expect(editorDays.map((entry) => [entry.dayNumber, entry.kind])).toEqual([
      [1, 'workout'],
      [2, 'rest'],
      [3, 'workout'],
      [4, 'rest'],
    ]);
    expect(editorDays[1]).toMatchObject({
      sessionId: null,
      name: 'Rest',
      synthetic: true,
    });
    expect(editorDays[3]).toMatchObject({
      sessionId: null,
      name: 'Rest',
      synthetic: true,
    });

    expect(accountWorkoutGroups([source])[0].sessions.map((entry) => entry.dayNumber)).toEqual([
      1,
      3,
    ]);
  });

  it('renders a complete rest schedule for a split with no saved sessions', () => {
    const source = split();
    source.cycle_length = 5;
    source.sessions = [];

    const editorDays = accountWorkoutEditorGroups([source])[0].sessions;

    expect(editorDays.map((entry) => [entry.dayNumber, entry.kind])).toEqual([
      [1, 'rest'],
      [2, 'rest'],
      [3, 'rest'],
      [4, 'rest'],
      [5, 'rest'],
    ]);
    expect(editorDays.every((entry) => entry.kind === 'rest' && entry.synthetic)).toBe(true);
    expect(accountWorkoutGroups([source])[0].sessions).toEqual([]);
  });

  it('fills trailing days through Day 7 for a legacy split without a cycle length', () => {
    const source = split();
    source.cycle_length = null;

    expect(
      accountWorkoutEditorGroups([source])[0].sessions.map((entry) => [
        entry.dayNumber,
        entry.kind,
      ])
    ).toEqual([
      [1, 'workout'],
      [2, 'rest'],
      [3, 'rest'],
      [4, 'workout'],
      [5, 'rest'],
      [6, 'rest'],
      [7, 'rest'],
    ]);
    expect(accountWorkoutGroups([source])[0].sessions.map((entry) => entry.dayNumber)).toEqual([
      1,
      4,
    ]);
  });

  it('caps generated editor days at the authoritative maximum for oversized cycles', () => {
    const source = split();
    source.cycle_length = 99;

    const editorDays = accountWorkoutEditorGroups([source])[0].sessions;

    expect(editorDays.map((entry) => entry.dayNumber)).toEqual(
      Array.from({ length: MAX_SPLIT_DAYS }, (_, index) => index + 1)
    );
    expect(editorDays[MAX_SPLIT_DAYS - 1]).toMatchObject({
      kind: 'rest',
      synthetic: true,
    });
    expect(accountWorkoutGroups([source])[0].sessions.map((entry) => entry.dayNumber)).toEqual([
      1,
      4,
    ]);
  });

  it('keeps a persisted empty rest day editable but never executable', () => {
    const source = split();
    source.sessions.splice(1, 0, {
      id: 'rest-2',
      split_id: source.id,
      name: 'Rest',
      day_number: 2,
      exercises: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const rest = accountWorkoutEditorGroups([source])[0].sessions.find(
      (entry) => entry.dayNumber === 2
    );
    expect(rest).toMatchObject({
      kind: 'rest',
      sessionId: 'rest-2',
      synthetic: false,
    });
    expect(accountWorkoutGroups([source])[0].sessions.map((entry) => entry.dayNumber)).toEqual([
      1,
      4,
    ]);
  });

  it('presents saved workout templates as startable unlinked plans', () => {
    const template: SessionTemplateResponse = {
      id: 'template-1',
      user_id: 'user-1',
      name: 'Push',
      source_session_id: null,
      source_split_id: null,
      notes: null,
      exercises: [
        {
          id: 'tex-2',
          template_id: 'template-1',
          exercise_name: 'Overhead Press',
          sets: 3,
          order_index: 1,
          unilateral: false,
          resistance_profile: null,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'tex-1',
          template_id: 'template-1',
          exercise_name: 'Bench Press',
          sets: 4,
          order_index: 0,
          unilateral: false,
          resistance_profile: 'mid',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const empty: SessionTemplateResponse = { ...template, id: 'template-2', exercises: [] };

    const plans = templateWorkoutPlans([template, empty]);

    // Empty ids keep synced workouts unlinked from any split; exercise-less
    // templates are not startable.
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      kind: 'workout',
      id: 'template:template-1',
      splitId: '',
      sessionId: '',
      name: 'Push',
    });
    expect(plans[0].exercises.map(({ exercise }) => exercise.name)).toEqual([
      'Bench Press',
      'Overhead Press',
    ]);
    expect(plans[0].exercises.map(({ sets }) => sets)).toEqual([4, 3]);
  });
});
