import {
  Dataset,
  SplitRequest,
  SplitResponse,
  WorkoutLogResponse,
  workouts,
} from './backend';

const DATASETS: Dataset[] = ['schoenfeld', 'pelland', 'average'];

function datasetFromSplit(value: string): Dataset {
  return DATASETS.includes(value as Dataset) ? (value as Dataset) : 'pelland';
}

/** Preserve the saved split exactly when asking the analysis engine to score it. */
export function splitToAnalysisRequest(split: SplitResponse): SplitRequest {
  return {
    name: split.name,
    sessions: split.sessions.map((session) => ({
      name: session.name,
      day: session.day_number,
      exercises: session.exercises.map((exercise) => ({
        name: exercise.exercise_name,
        sets: exercise.sets,
        unilateral: exercise.unilateral,
        resistance_profile: exercise.resistance_profile as
          | 'ascending'
          | 'mid'
          | 'descending'
          | null,
      })),
    })),
    cycle_length: split.cycle_length,
    stimulus_duration: split.stimulus_duration,
    maintenance_volume: split.maintenance_volume,
    dataset: datasetFromSplit(split.dataset),
    include_breakdowns: false,
  };
}

export type WorkoutPageLoader = typeof workouts.list;

/** Fetch every workout in a range instead of silently truncating at one API page. */
export async function loadAllWorkouts(
  days?: number,
  loadPage: WorkoutPageLoader = workouts.list
): Promise<WorkoutLogResponse[]> {
  const pageSize = 500;
  const collected: WorkoutLogResponse[] = [];
  let offset = 0;
  let total = 0;

  do {
    const page = await loadPage({ limit: pageSize, offset, days });
    collected.push(...page.workouts);
    total = page.total;
    if (page.workouts.length === 0) break;
    offset += page.workouts.length;
  } while (offset < total);

  return collected;
}

export function workoutRangeKey(days?: number): string {
  return days === undefined ? 'all' : String(days);
}
