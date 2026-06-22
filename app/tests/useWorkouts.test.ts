import { invalidateWorkoutDerivedQueries } from '../src/hooks/useWorkouts';

describe('invalidateWorkoutDerivedQueries', () => {
  it('invalidates previous workout shadows after history changes', () => {
    const queryClient = {
      invalidateQueries: jest.fn(),
    };

    invalidateWorkoutDerivedQueries(queryClient as never);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workouts', 'previous'] });
  });
});
