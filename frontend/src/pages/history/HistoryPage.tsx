import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronRight, Dumbbell } from 'lucide-react';
import { Card, Spinner, Button } from '@/components/ui';
import { getWorkouts, workoutKeys } from '@/api/workouts.api';
import { getRelativeTime, formatDuration } from '@/lib/utils';

export function HistoryPage() {
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: workoutKeys.list({ limit, offset }),
    queryFn: () => getWorkouts({ limit, offset }),
  });

  const loadMore = () => {
    setOffset((prev) => prev + limit);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">History</h1>
          <p className="text-secondary">
            {data?.total ?? 0} total workouts
          </p>
        </div>
        <Link to="/workout">
          <Button size="sm">
            <Dumbbell className="mr-2 h-4 w-4" />
            New Workout
          </Button>
        </Link>
      </div>

      {/* Workout list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : data?.workouts.length === 0 ? (
        <Card className="text-center py-12">
          <Calendar className="mx-auto h-12 w-12 text-muted mb-4" />
          <p className="text-muted mb-4">No workouts logged yet</p>
          <Link to="/workout">
            <Button>Start Your First Workout</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.workouts.map((workout) => (
            <Link key={workout.id} to={`/history/${workout.id}`}>
              <Card variant="interactive" className="p-0">
                <div className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground truncate">
                        {workout.session_name}
                      </h3>
                      <span className="text-xs text-muted">
                        {getRelativeTime(workout.completed_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-secondary">
                      <span>{workout.exercises.length} exercises</span>
                      <span>
                        {workout.exercises.reduce(
                          (acc, ex) => acc + ex.sets_completed,
                          0
                        )}{' '}
                        sets
                      </span>
                      {workout.duration_minutes && (
                        <span>{formatDuration(workout.duration_minutes)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {workout.exercises.slice(0, 4).map((ex, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-steel rounded text-xs text-muted"
                        >
                          {ex.exercise_name}
                        </span>
                      ))}
                      {workout.exercises.length > 4 && (
                        <span className="px-2 py-0.5 text-xs text-muted">
                          +{workout.exercises.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="text-muted ml-2" size={20} />
                </div>
              </Card>
            </Link>
          ))}

          {/* Load more */}
          {data && offset + limit < data.total && (
            <div className="text-center pt-4">
              <Button
                variant="secondary"
                onClick={loadMore}
                loading={isFetching}
              >
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
