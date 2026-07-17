import type { ExerciseResponse, SessionResponse, SplitResponse } from '../src/api/backend';
import {
  newWorkoutDraft,
  normalizeResistanceProfile,
  parseWorkoutDayInput,
  reorderWorkoutDraftExercises,
  replaceWorkoutDraftExercise,
  splitWithWorkoutDraft,
  workoutDraftError,
  workoutDraftFromSession,
} from '../src/workout/splitEditing';

function exercise(id: string, name: string, order: number): ExerciseResponse {
  return {
    id,
    session_id: 'session-1',
    exercise_name: name,
    sets: 3,
    order_index: order,
    unilateral: false,
    resistance_profile: null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function session(id: string, name: string, day: number, exercises: ExerciseResponse[]): SessionResponse {
  return {
    id,
    split_id: 'split-1',
    name,
    day_number: day,
    exercises,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function split(): SplitResponse {
  return {
    id: 'split-1',
    user_id: 'user-1',
    name: 'Account Split',
    cycle_length: 4,
    stimulus_duration: 72,
    maintenance_volume: 5,
    dataset: 'average',
    sessions: [
      session('session-1', 'Upper', 1, [
        exercise('ex-2', 'Barbell Row', 1),
        exercise('ex-1', 'Bench Press', 0),
      ]),
      session('session-2', 'Lower', 3, [exercise('ex-3', 'Back Squat', 0)]),
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('workout split editing', () => {
  it('allows the day field to be cleared and entered again', () => {
    const cleared = parseWorkoutDayInput('');
    expect(cleared.text).toBe('');
    expect(Number.isNaN(cleared.dayNumber)).toBe(true);
    expect(parseWorkoutDayInput('Day 4')).toEqual({ text: '4', dayNumber: 4 });
  });

  it('reorders exercises by drag indices without mutating the source', () => {
    const draft = workoutDraftFromSession('split-1', split().sessions[0]);
    const reordered = reorderWorkoutDraftExercises(draft.exercises, 0, 1);

    expect(reordered.map((item) => item.name)).toEqual(['Barbell Row', 'Bench Press']);
    expect(draft.exercises.map((item) => item.name)).toEqual(['Bench Press', 'Barbell Row']);
  });

  it('swaps a row exercise while preserving its key, set count, and position', () => {
    const draft = workoutDraftFromSession('split-1', split().sessions[0]);
    draft.exercises[0].sets = 5;

    const replaced = replaceWorkoutDraftExercise(draft.exercises, 'ex-1', {
      name: 'Incline Dumbbell Press',
      unilateral: true,
      resistanceProfile: 'ascending',
    });

    expect(replaced.map((item) => item.name)).toEqual([
      'Incline Dumbbell Press',
      'Barbell Row',
    ]);
    expect(replaced[0]).toMatchObject({
      key: 'ex-1',
      sets: 5,
      unilateral: true,
      resistanceProfile: 'ascending',
    });
    expect(draft.exercises[0].name).toBe('Bench Press');
  });

  it('hydrates exercises in persisted order', () => {
    const draft = workoutDraftFromSession('split-1', split().sessions[0]);

    expect(draft.exercises.map((item) => item.name)).toEqual(['Bench Press', 'Barbell Row']);
    expect(draft.exercises.map((item) => item.resistanceProfile)).toEqual(['mid', 'mid']);
    expect(normalizeResistanceProfile('descending')).toBe('descending');
  });

  it('replaces one workout while preserving split settings and other days', () => {
    const source = split();
    const draft = workoutDraftFromSession(source.id, source.sessions[0]);
    draft.name = 'Upper Revised';
    draft.exercises = [
      { ...draft.exercises[1], sets: 4 },
      {
        key: 'new:lateral_raise',
        name: 'Lateral Raise',
        sets: 3,
        unilateral: false,
        resistanceProfile: 'ascending',
      },
    ];

    const payload = splitWithWorkoutDraft(source, draft);

    expect(payload).toMatchObject({
      name: 'Account Split',
      cycle_length: 4,
      stimulus_duration: 72,
      maintenance_volume: 5,
      dataset: 'average',
    });
    expect(payload.sessions[0]).toEqual({
      name: 'Upper Revised',
      day_number: 1,
      exercises: [
        { name: 'Barbell Row', sets: 4, unilateral: false, resistance_profile: 'mid' },
        { name: 'Lateral Raise', sets: 3, unilateral: false, resistance_profile: 'ascending' },
      ],
    });
    expect(payload.sessions[1]).toMatchObject({ name: 'Lower', day_number: 3 });
  });

  it('adds a new workout on the first open day', () => {
    const source = split();
    const draft = newWorkoutDraft(source);
    draft.name = 'Arms';
    draft.exercises = [
      {
        key: 'new:curl',
        name: 'Barbell Curl',
        sets: 3,
        unilateral: false,
        resistanceProfile: 'mid',
      },
    ];

    expect(draft.dayNumber).toBe(2);
    expect(splitWithWorkoutDraft(source, draft).sessions.map((item) => item.name)).toEqual([
      'Upper',
      'Arms',
      'Lower',
    ]);
  });

  it('prefills an interior automatic rest sentinel for manual persistence', () => {
    const draft = newWorkoutDraft(split(), 2);

    expect(draft).toMatchObject({
      name: 'Rest',
      dayNumber: 2,
      exercises: [],
    });
    expect(workoutDraftError(split(), draft)).toBeNull();
  });

  it('rejects duplicate days but permits empty rest sentinels', () => {
    const source = split();
    const draft = newWorkoutDraft(source);
    draft.name = 'Duplicate';
    draft.dayNumber = 1;

    expect(workoutDraftError(source, draft)).toBe('Day 1 already has a workout in this split.');
    draft.dayNumber = 2;
    expect(workoutDraftError(source, draft)).toBeNull();
  });
});
