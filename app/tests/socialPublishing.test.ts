import type { CompletedWorkout } from '../src/state/AppState';
import {
  liftTrendCandidates,
  weeklyActivityPublication,
} from '../src/social/publishing';

function workout(
  date: string,
  exerciseName: string,
  weight: number,
  reps: number
): CompletedWorkout {
  return {
    date,
    name: 'Training',
    exercises: [
      {
        name: exerciseName,
        sets: 1,
        records: [{ weight, reps, rir: 0 }],
        notes: 'private note',
      },
    ],
    stimulus: {},
    totalSets: 1,
    volume: weight * reps,
    durationMin: 45,
    edited: false,
  };
}

describe('social publication derivation', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('publishes a weekly aggregate without workout rows or exact times', () => {
    const publication = weeklyActivityPublication(
      [
        workout('2026-07-19T14:31:00.000Z', 'Bench Press', 185, 8),
        workout('2026-07-22T09:05:00.000Z', 'Squat', 225, 5),
        workout('2026-07-10T09:05:00.000Z', 'Deadlift', 315, 3),
      ],
      now
    );

    expect(publication).toEqual({
      week_start: '2026-07-18',
      week_end: '2026-07-24',
      workouts_completed: 2,
      planned_workouts: null,
      consistency_percent: 29,
      snapshot_date: '2026-07-24',
    });
    expect(JSON.stringify(publication)).not.toContain('private note');
    expect(JSON.stringify(publication)).not.toContain('14:31');
  });

  it('derives selectable lift percentages without exposing sets', () => {
    const candidates = liftTrendCandidates(
      [
        workout('2026-06-26T12:00:00.000Z', 'Bench Press', 185, 8),
        workout('2026-07-24T10:00:00.000Z', 'Bench Press', 205, 8),
        workout('2026-07-24T11:00:00.000Z', 'Squat', 225, 5),
      ],
      now
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      exercise_name: 'Bench Press',
      period_label: '4 weeks',
    });
    expect(candidates[0].change_percent).toBeCloseTo(10.81, 2);
    expect(candidates[0]).not.toHaveProperty('weight');
    expect(candidates[0]).not.toHaveProperty('reps');
  });
});
