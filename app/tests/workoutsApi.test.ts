jest.mock('../src/api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

import { apiClient } from '../src/api/client';
import { getAllWorkouts } from '../src/api/workouts.api';

describe('getAllWorkouts', () => {
  it('pages until the reported total is loaded', async () => {
    const getMock = apiClient.get as jest.Mock;

    getMock
      .mockResolvedValueOnce({
        data: {
          workouts: Array.from({ length: 500 }, (_, i) => ({
            id: `w${i}`,
            exercises: [],
          })),
          total: 750,
        },
      })
      .mockResolvedValueOnce({
        data: {
          workouts: Array.from({ length: 250 }, (_, i) => ({
            id: `w${500 + i}`,
            exercises: [],
          })),
          total: 750,
        },
      });

    const result = await getAllWorkouts();

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock).toHaveBeenNthCalledWith(
      1,
      '/api/workouts',
      { params: { limit: 500, offset: 0 } },
    );
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      '/api/workouts',
      { params: { limit: 500, offset: 500 } },
    );
    expect(result.total).toBe(750);
    expect(result.workouts).toHaveLength(750);
  });
});
