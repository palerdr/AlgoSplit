import {
  buildTrainingDayCells,
  localTrainingDayKey,
  TRAINING_GRID_DAYS,
} from '../src/analysis/trainingDays';

describe('training-day calendar', () => {
  const now = new Date(2026, 6, 24, 12);

  it('maps actual workout timestamps and volume into the last 15 weeks', () => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const outsideWindow = new Date(now);
    outsideWindow.setDate(outsideWindow.getDate() - TRAINING_GRID_DAYS);

    const cells = buildTrainingDayCells(
      [
        { completedAt: now.toISOString(), volume: 8_000 },
        { completedAt: yesterday.toISOString(), volume: 6_000 },
        { completedAt: yesterday.toISOString(), volume: 4_000 },
        { completedAt: outsideWindow.toISOString(), volume: 20_000 },
        { completedAt: 'not-a-date', volume: 50_000 },
      ],
      now
    );

    expect(cells).toHaveLength(TRAINING_GRID_DAYS);
    const oldestDay = new Date(now);
    oldestDay.setDate(oldestDay.getDate() - (TRAINING_GRID_DAYS - 1));
    expect(cells[0].key).toBe(localTrainingDayKey(oldestDay));
    expect(cells.at(-1)).toMatchObject({
      key: localTrainingDayKey(now),
      workoutCount: 1,
      volume: 8_000,
    });
    expect(cells.find((cell) => cell.key === localTrainingDayKey(yesterday))).toMatchObject({
      workoutCount: 2,
      volume: 10_000,
    });
    expect(cells.some((cell) => cell.key === localTrainingDayKey(outsideWindow))).toBe(false);
  });

  it('uses local calendar arithmetic across daylight-saving transitions', () => {
    const dstWindow = buildTrainingDayCells([], new Date(2026, 2, 10, 12), 5);

    expect(dstWindow.map((cell) => cell.key)).toEqual([
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
  });
});
