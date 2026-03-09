import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { createSplit, replaceSplit } from './splits.api';


vi.mock('./client', () => ({
  apiClient: {
    post: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));


describe('splits.api payload mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps SplitRequest to backend create payload shape', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: {
        id: 'split-1',
        sessions: [],
      },
    } as never);

    await createSplit({
      name: 'Test Split',
      sessions: [
        {
          name: 'Push',
          day: 1,
          exercises: [
            { name: 'Bench Press', sets: 4, unilateral: false, resistance_profile: null },
          ],
        },
      ],
      cycle_length: 4,
      stimulus_duration: 48,
      maintenance_volume: 4,
      dataset: 'average',
    });

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/api/splits', {
      name: 'Test Split',
      cycle_length: 4,
      stimulus_duration: 48,
      maintenance_volume: 4,
      dataset: 'average',
      sessions: [
        {
          name: 'Push',
          day_number: 1,
          exercises: [
            {
              name: 'Bench Press',
              sets: 4,
              unilateral: false,
              resistance_profile: null,
            },
          ],
        },
      ],
    });
  });

  it('uses full replacement endpoint for replaceSplit', async () => {
    vi.mocked(apiClient.put).mockResolvedValue({
      data: {
        id: 'split-2',
        sessions: [],
      },
    } as never);

    await replaceSplit('split-2', {
      name: 'Updated Split',
      sessions: [
        {
          name: 'Legs',
          day: 2,
          exercises: [{ name: 'Squat', sets: 5 }],
        },
      ],
      stimulus_duration: 36,
      maintenance_volume: 3,
      dataset: 'pelland',
    });

    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect(apiClient.put).toHaveBeenCalledWith('/api/splits/split-2/full', {
      name: 'Updated Split',
      cycle_length: null,
      stimulus_duration: 36,
      maintenance_volume: 3,
      dataset: 'pelland',
      sessions: [
        {
          name: 'Legs',
          day_number: 2,
          exercises: [
            {
              name: 'Squat',
              sets: 5,
              unilateral: false,
              resistance_profile: null,
            },
          ],
        },
      ],
    });
  });
});
