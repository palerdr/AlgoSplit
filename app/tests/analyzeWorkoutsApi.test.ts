jest.mock('../src/api/client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

import { apiClient } from '../src/api/client';
import { analyzeWorkouts } from '../src/api/workouts.api';

describe('analyzeWorkouts', () => {
  it('forwards global analysis defaults and snapshot params to the backend', async () => {
    const postMock = apiClient.post as jest.Mock;
    postMock.mockResolvedValueOnce({ data: { summary: { total_sets: 0 } } });

    await analyzeWorkouts({
      days: 7,
      endDate: '2026-03-11',
      timezoneOffsetMinutes: 300,
      stimulusDuration: 72,
      maintenanceVolume: 5,
      dataset: 'average',
    });

    expect(postMock).toHaveBeenCalledWith(
      '/api/analyze-workouts',
      null,
      {
        params: {
          days: 7,
          stimulus_duration: 72,
          maintenance_volume: 5,
          dataset: 'average',
          end_date: '2026-03-11',
          timezone_offset_minutes: 300,
        },
      },
    );
  });
});
