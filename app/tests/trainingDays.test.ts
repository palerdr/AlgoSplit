import {
  buildTrainingDayCells,
  localTrainingDayKey,
  TRAINING_GRID_DAYS,
} from '../src/analysis/trainingDays';

describe('training-day calendar', () => {
  const now = new Date(2026, 6, 24, 12);

  it('maps actual workout timestamps into the last five weeks', () => {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const outsideWindow = new Date(now);
    outsideWindow.setDate(outsideWindow.getDate() - TRAINING_GRID_DAYS);

    const cells = buildTrainingDayCells(
      [
        now.toISOString(),
        yesterday.toISOString(),
        yesterday.toISOString(),
        outsideWindow.toISOString(),
        'not-a-date',
      ],
      now
    );

    expect(cells).toHaveLength(TRAINING_GRID_DAYS);
    expect(cells[0].key).toBe(localTrainingDayKey(new Date(2026, 5, 20, 12)));
    expect(cells.at(-1)).toMatchObject({
      key: localTrainingDayKey(now),
      workoutCount: 1,
    });
    expect(cells.find((cell) => cell.key === localTrainingDayKey(yesterday))).toMatchObject({
      workoutCount: 2,
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
