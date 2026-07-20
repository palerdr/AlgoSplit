import type { WorkoutLogResponse } from '../src/api/backend';
import { buildWorkoutPayload, queueFailedWorkoutRetries } from '../src/api/sync';
import type { CompletedWorkout } from '../src/state/AppState';
import {
  latestAuthenticatedExerciseRecord,
  latestLocalExerciseRecord,
  latestRemoteExerciseRecord,
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

describe('latest exercise record', () => {
  const remote = (overrides: Partial<WorkoutLogResponse>): WorkoutLogResponse =>
    ({
      id: 'workout',
      user_id: 'user',
      session_id: null,
      split_id: null,
      session_name: 'Push',
      completed_at: '2026-07-01T12:00:00Z',
      duration_minutes: 45,
      notes: null,
      session_id_dropped: false,
      exercises: [],
      created_at: '2026-07-01T12:00:00Z',
      ...overrides,
    }) as WorkoutLogResponse;

  it('finds the newest account set globally instead of requiring the same workout name', () => {
    const workouts = [
      remote({
        id: 'new',
        session_name: 'Arms B',
        completed_at: '2026-07-18T12:00:00Z',
        created_at: '2026-07-18T12:01:00Z',
        exercises: [
          {
            exercise_name: 'Triceps Pushdown',
            reps: [10],
            weight: [72.5],
            rir: [1],
            order_index: 0,
          } as never,
        ],
      }),
      remote({
        id: 'old',
        session_name: 'Push A',
        completed_at: '2026-07-10T12:00:00Z',
        exercises: [
          {
            exercise_name: 'Triceps Pushdown',
            reps: [12],
            weight: [60],
            order_index: 0,
          } as never,
        ],
      }),
    ];

    expect(latestRemoteExerciseRecord(workouts.reverse(), ' triceps pushdown ')).toEqual({
      weight: 72.5,
      reps: 10,
      rir: 1,
    });
  });

  it('uses the final set from the latest duplicate row by order_index', () => {
    const workout = remote({
      session_name: 'Arms',
      exercises: [
        {
          exercise_name: 'Pushdown',
          reps: [12, 9],
          weight: [70, 75],
          rir: [2, 1],
          order_index: 4,
        } as never,
        {
          exercise_name: 'Pushdown',
          reps: [15],
          weight: [50],
          rir: [3],
          order_index: 1,
        } as never,
      ],
    });

    expect(latestRemoteExerciseRecord([workout], 'pushdown')).toEqual({
      weight: 75,
      reps: 9,
      rir: 1,
    });
  });

  it('skips empty duplicate rows when looking for the newest committed remote set', () => {
    const workout = remote({
      exercises: [
        {
          exercise_name: 'Pushdown',
          reps: [12],
          weight: [65],
          rir: null,
          order_index: 1,
        } as never,
        {
          exercise_name: 'Pushdown',
          reps: [],
          weight: [],
          rir: null,
          order_index: 2,
        } as never,
      ],
    });

    expect(latestRemoteExerciseRecord([workout], 'Pushdown')).toEqual({
      weight: 65,
      reps: 12,
    });
  });

  it('uses the last matching local row and its final record across workout names', () => {
    const history = [
      {
        date: '2026-07-19T12:00:00Z',
        name: 'Arms B',
        exercises: [
          {
            name: 'Cable Curl',
            sets: 1,
            records: [{ weight: 35, reps: 12 }],
            notes: '',
          },
          {
            name: 'Cable Curl',
            sets: 2,
            records: [
              { weight: 40, reps: 10, rir: 2 },
              { weight: 45, reps: 8, rir: 1 },
            ],
            notes: '',
          },
        ],
      },
      {
        date: '2026-07-10T12:00:00Z',
        name: 'Pull A',
        exercises: [
          {
            name: 'Cable Curl',
            sets: 1,
            records: [{ weight: 50, reps: 6 }],
            notes: '',
          },
        ],
      },
    ] as CompletedWorkout[];

    expect(latestLocalExerciseRecord(history.reverse(), 'cable curl')).toEqual({
      weight: 45,
      reps: 8,
      rir: 1,
    });
  });

  it('prefers a newer unsynced local record over older remote history', () => {
    const workouts = [
      remote({
        completed_at: '2026-07-18T12:00:00Z',
        exercises: [
          {
            exercise_name: 'Pushdown',
            reps: [12],
            weight: [60],
            order_index: 0,
          } as never,
        ],
      }),
    ];
    const localHistory = [
      {
        date: '2026-07-19T12:00:00Z',
        name: 'Arms',
        exercises: [
          {
            name: 'Pushdown',
            sets: 1,
            records: [{ weight: 80, reps: 10 }],
            notes: '',
          },
        ],
        syncStatus: 'pending',
      },
    ] as CompletedWorkout[];

    expect(
      latestAuthenticatedExerciseRecord(workouts, localHistory, 'pushdown')
    ).toEqual({
      record: { weight: 80, reps: 10 },
      completedAt: new Date('2026-07-19T12:00:00Z').getTime(),
      source: 'local',
    });
  });

  it('prefers newer remote history over an older failed local record', () => {
    const workouts = [
      remote({
        completed_at: '2026-07-20T12:00:00Z',
        exercises: [
          {
            exercise_name: 'Pushdown',
            reps: [8],
            weight: [90],
            order_index: 0,
          } as never,
        ],
      }),
    ];
    const localHistory = [
      {
        date: '2026-07-19T12:00:00Z',
        name: 'Arms',
        exercises: [
          {
            name: 'Pushdown',
            sets: 1,
            records: [{ weight: 80, reps: 10 }],
            notes: '',
          },
        ],
        syncStatus: 'failed',
      },
    ] as CompletedWorkout[];

    expect(
      latestAuthenticatedExerciseRecord(workouts, localHistory, 'pushdown')
    ).toEqual({
      record: { weight: 90, reps: 8 },
      completedAt: new Date('2026-07-20T12:00:00Z').getTime(),
      source: 'remote',
    });
  });
});

describe('workout API serialization', () => {
  it('sends the deployed parallel-array contract with RIR and exercise notes', () => {
    const workout = {
      localId: 'workout-local-1',
      date: '2026-07-15T12:00:00Z',
      name: 'Push',
      durationMin: 42,
      splitId: 'split-1',
      sessionId: 'session-1',
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
      client_request_id: 'workout-local-1',
      session_id: 'session-1',
      split_id: 'split-1',
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

  it('requeues failed uploads without touching pending or synced workouts', () => {
    const history = [
      { localId: 'failed', syncStatus: 'failed', syncError: 'offline' },
      { localId: 'pending', syncStatus: 'pending' },
      { localId: 'synced', syncStatus: 'synced', remoteId: 'remote-1' },
    ] as CompletedWorkout[];

    expect(queueFailedWorkoutRetries(history)).toEqual([
      { localId: 'failed', syncStatus: 'pending', syncError: undefined },
      history[1],
      history[2],
    ]);
  });
});
