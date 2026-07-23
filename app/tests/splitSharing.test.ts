jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => undefined),
}));
jest.mock('../src/ui/GlassRuntime', () => ({
  LiquidGlassView: null,
  liquidGlassAvailable: false,
}));

import {
  copyableSharedSplit,
  reviewExercisesFromConflict,
} from '../src/screens/SharedSplitScreen';
import {
  sharedSplitUrl,
  splitShareErrorMessage,
} from '../src/ui/SplitShareModal';
import { BackendError } from '../src/api/backend';

describe('split sharing', () => {
  it('builds a public preview URL without embedding split data', () => {
    expect(sharedSplitUrl('opaque_token-123', 'https://example.test/app/')).toBe(
      'https://example.test/app/share/opaque_token-123'
    );
  });

  it('allowlists only copyable split fields before an authenticated save', () => {
    const copied = copyableSharedSplit({
      name: 'Shared PPL',
      cycle_length: 7,
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
              resistance_profile: 'mid',
              id: 'must-not-copy',
            },
          ],
          id: 'must-not-copy',
        },
      ],
      user_id: 'must-not-copy',
      workout_history: [{ id: 'must-not-copy' }],
    } as never);

    expect(copied).toEqual({
      name: 'Shared PPL',
      cycle_length: 7,
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
              resistance_profile: 'mid',
            },
          ],
        },
      ],
    });
  });

  it('keeps active-link cap errors actionable', () => {
    expect(
      splitShareErrorMessage(
        new BackendError(
          409,
          'Revoke an existing share link before creating another'
        ),
        'fallback'
      )
    ).toContain('Revoke links');
  });

  it('extracts and deduplicates structured copy-review conflicts', () => {
    expect(
      reviewExercisesFromConflict(
        new BackendError(409, 'Review exercises', {
          detail: {
            message: 'Review these exercises before copying the shared split',
            review_exercises: [
              ' Custom Press ',
              'Custom Press',
              'Cable Fly',
            ],
          },
        })
      )
    ).toEqual(['Custom Press', 'Cable Fly']);
  });
});
