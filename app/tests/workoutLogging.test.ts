import type { WorkoutLogResponse } from '../src/api/backend';
import { buildWorkoutPayload } from '../src/api/sync';
import type { CompletedWorkout } from '../src/state/AppState';
import {
  previousLocalExercise,
  previousRemoteExercise,
  validateSetDraft,
} from '../src/workout/logging';

describe('set entry validation', () => {
  it('accepts bodyweight, decimal load, and optional RIR', () => {
    expect(validateSetDraft({ weight: '0', reps: '12', rir: '' }).record).toEqual({
      weight: 0,
      reps: 12,
    });
    expect(validateSetDraft({ weight: '182.5', reps: '8', rir: '2' }).record).toEqual({
      weight: 182.5,
      reps: 8,
      rir: 2,
    });
  });

  it('rejects missing or malformed fields and RIR outside 0–5', () => {
    expect(validateSetDraft({ weight: '', reps: '8.5', rir: '6' })).toMatchObject({
      record: null,
      errors: { weight: expect.any(String), reps: expect.any(String), rir: expect.any(String) },
    });
  });
});

describe('previous-session shadows', () => {
  const remote = (overrides: Partial<WorkoutLogResponse>): WorkoutLogResponse =>
    ({
      id: 'workout',
      user_id: 'user',
      session_id: null,
      split_id: null,
      session_name: 'Push',
      completed_at: '2026-01-01T12:00:00Z',
      duration_minutes: 45,
      notes: null,
      session_id_dropped: false,
      exercises: [],
      created_at: '2026-01-01T12:00:00Z',
      ...overrides,
    }) as WorkoutLogResponse;

  it('uses the newest matching account session and preserves positional RIR and notes', () => {
    const result = previousRemoteExercise(
      [
        remote({
          completed_at: '2026-07-10T12:00:00Z',
          session_name: 'PUSH',
          exercises: [
            {
              exercise_name: 'Bench Press',
              reps: [8, 7],
              weight: [185, 190],
              rir: [2, 1],
              notes: 'Pause on chest',
            } as never,
          ],
        }),
        remote({
          completed_at: '2026-07-01T12:00:00Z',
          exercises: [
            { exercise_name: 'Bench Press', reps: [10], weight: [135], rir: null } as never,
          ],
        }),
      ],
      'Push',
      'bench press'
    );

    expect(result).toEqual({
      records: [
        { weight: 185, reps: 8, rir: 2 },
        { weight: 190, reps: 7, rir: 1 },
      ],
      notes: 'Pause on chest',
    });
  });

  it('does not borrow a shadow from a different session', () => {
    expect(
      previousRemoteExercise(
        [
          remote({
            session_name: 'Pull',
            exercises: [{ exercise_name: 'Bench Press', reps: [8], weight: [185] } as never],
          }),
        ],
        'Push',
        'Bench Press'
      )
    ).toBeNull();
  });

  it('restores locally persisted exercise notes in signed-out mode', () => {
    const workout = {
      date: '2026-07-01T12:00:00Z',
      name: 'Push',
      exercises: [
        {
          name: 'Bench Press',
          sets: 1,
          records: [{ weight: 185, reps: 8, rir: 2 }],
          notes: 'Keep shoulder blades down',
        },
      ],
    } as CompletedWorkout;
    expect(previousLocalExercise([workout], 'Push', 'Bench Press')?.notes).toBe(
      'Keep shoulder blades down'
    );
  });
});

describe('workout API serialization', () => {
  it('sends the deployed parallel-array contract with RIR and exercise notes', () => {
    const workout = {
      date: '2026-07-15T12:00:00Z',
      name: 'Push',
      durationMin: 42,
      exercises: [
        {
          name: 'Bench Press',
          sets: 2,
          records: [
            { weight: 185, reps: 8, rir: 2 },
            { weight: 190, reps: 7 },
          ],
          notes: 'Pause on chest',
        },
      ],
    } as CompletedWorkout;

    expect(buildWorkoutPayload(workout)).toEqual({
      session_name: 'Push',
      completed_at: '2026-07-15T12:00:00Z',
      duration_minutes: 42,
      exercises: [
        {
          exercise_name: 'Bench Press',
          sets_completed: 2,
          weight: [185, 190],
          reps: [8, 7],
          rir: [2, 0],
          notes: 'Pause on chest',
        },
      ],
    });
  });
});
