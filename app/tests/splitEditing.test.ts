import type {
  ExerciseResponse,
  SessionResponse,
  SessionTemplateResponse,
  SplitResponse,
} from '../src/api/backend';
import {
  newWorkoutDraft,
  normalizeResistanceProfile,
  reorderWorkoutDraftExercises,
  replaceWorkoutDraftExercise,
  splitDayLimit,
  splitWithWorkoutDraft,
  workoutDraftError,
  workoutDraftFromSession,
  workoutDraftFromTemplate,
  workoutDraftFromWizard,
  workoutDraftToTemplateCreate,
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
  it('derives the day limit from the cycle length', () => {
    expect(splitDayLimit(split())).toBe(4);
    expect(splitDayLimit({ ...split(), cycle_length: null })).toBe(7);
    expect(splitDayLimit({ ...split(), cycle_length: 99 })).toBe(14);
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
    expect(draft.exercises.map((item) => item.resistanceProfile)).toEqual([null, null]);
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
        { name: 'Barbell Row', sets: 4, unilateral: false, resistance_profile: null },
        { name: 'Lateral Raise', sets: 3, unilateral: false, resistance_profile: 'ascending' },
      ],
    });
    expect(payload.sessions[1]).toMatchObject({ name: 'Lower', day_number: 3 });
  });

  it('adds a new workout on the first open day and preserves that day in the payload', () => {
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

    const payload = splitWithWorkoutDraft(source, draft);

    expect(draft.dayNumber).toBe(2);
    expect(payload.sessions.map((item) => [item.name, item.day_number])).toEqual([
      ['Upper', 1],
      ['Arms', 2],
      ['Lower', 3],
    ]);
  });

  it('prefills the tapped rest day without naming the draft', () => {
    const draft = newWorkoutDraft(split(), 2);

    expect(draft).toMatchObject({
      name: '',
      dayNumber: 2,
      exercises: [],
    });
  });

  it('requires a name and at least one exercise', () => {
    const source = split();
    const draft = newWorkoutDraft(source);

    expect(workoutDraftError(source, draft)).toBe('Enter a workout name.');
    draft.name = 'Arms';
    expect(workoutDraftError(source, draft)).toBe('Add at least one exercise.');
    draft.exercises = [
      { key: 'new:curl', name: 'Barbell Curl', sets: 3, unilateral: false, resistanceProfile: 'mid' },
    ];
    expect(workoutDraftError(source, draft)).toBeNull();
  });

  it('rejects duplicate days and days beyond the cycle length', () => {
    const source = split();
    const draft = newWorkoutDraft(source);
    draft.name = 'Duplicate';
    draft.exercises = [
      { key: 'new:curl', name: 'Barbell Curl', sets: 3, unilateral: false, resistanceProfile: 'mid' },
    ];
    draft.dayNumber = 1;

    expect(workoutDraftError(source, draft)).toBe('Day 1 already has a workout in this split.');
    draft.dayNumber = 5;
    expect(workoutDraftError(source, draft)).toBe('Day must be a whole number from 1 through 4.');
    draft.dayNumber = 2;
    expect(workoutDraftError(source, draft)).toBeNull();
  });

  it('skips day validation without a split (standalone and wizard drafts)', () => {
    const draft = workoutDraftFromWizard({
      name: 'Push',
      exercises: [{ name: 'Bench Press', sets: 4, unilateral: false, resistance_profile: 'mid' }],
    });
    draft.dayNumber = Number.NaN;

    expect(workoutDraftError(null, draft)).toBeNull();
    expect(draft.exercises.map((item) => item.name)).toEqual(['Bench Press']);
  });

  it('round-trips a saved workout template through a draft', () => {
    const template: SessionTemplateResponse = {
      id: 'template-1',
      user_id: 'user-1',
      name: 'Pull',
      source_session_id: null,
      source_split_id: null,
      notes: null,
      exercises: [
        {
          id: 'tex-2',
          template_id: 'template-1',
          exercise_name: 'Lat Pulldown',
          sets: 3,
          order_index: 1,
          unilateral: false,
          resistance_profile: 'ascending',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'tex-1',
          template_id: 'template-1',
          exercise_name: 'Barbell Row',
          sets: 4,
          order_index: 0,
          unilateral: false,
          resistance_profile: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const draft = workoutDraftFromTemplate(template);
    expect(draft.name).toBe('Pull');
    expect(draft.exercises.map((item) => item.name)).toEqual(['Barbell Row', 'Lat Pulldown']);
    expect(draft.exercises.map((item) => item.resistanceProfile)).toEqual([null, 'ascending']);

    expect(workoutDraftToTemplateCreate(draft)).toEqual({
      name: 'Pull',
      exercises: [
        {
          exercise_name: 'Barbell Row',
          sets: 4,
          order_index: 0,
          unilateral: false,
          resistance_profile: null,
        },
        {
          exercise_name: 'Lat Pulldown',
          sets: 3,
          order_index: 1,
          unilateral: false,
          resistance_profile: 'ascending',
        },
      ],
    });
  });
});
