import {
  Dataset,
  MuscleStats,
  SplitRequest,
  SplitResponse,
  WorkoutLogResponse,
  WorkoutProgressWorkout,
  AnalysisResponse,
  analysis,
  workouts,
} from './backend';

export function workoutAnalysisNetStimulus(
  muscles: readonly Pick<MuscleStats, 'region_id' | 'net_stimulus'>[]
): Record<string, number> {
  return Object.fromEntries(
    muscles.map((muscle) => [muscle.region_id, muscle.net_stimulus])
  );
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

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

export function workoutProgressKey(exerciseName: string, days?: number): string {
  return `${exerciseName.trim().toLocaleLowerCase()}::${workoutRangeKey(days)}`;
}

export async function loadAllWorkoutProgress(
  exerciseName: string,
  days?: number,
  loadPage: typeof workouts.progress = workouts.progress
): Promise<WorkoutProgressWorkout[]> {
  const pageSize = 100;
  const collected: WorkoutProgressWorkout[] = [];
  let offset = 0;
  let total = 0;
  do {
    const page = await loadPage({
      exerciseName,
      days,
      limit: pageSize,
      offset,
    });
    collected.push(...page.workouts);
    total = page.total;
    if (page.workouts.length === 0) break;
    offset += page.workouts.length;
  } while (offset < total);
  return collected;
}

const SPLIT_ANALYSIS_TTL_MS = 10 * 60_000;
const splitAnalysisCache = new Map<
  string,
  { data?: AnalysisResponse; fetchedAt?: number; promise?: Promise<AnalysisResponse> }
>();

function splitAnalysisKey(split: SplitResponse): string {
  return JSON.stringify(splitToAnalysisRequest(split));
}

export function loadSplitAnalysis(
  split: SplitResponse,
  analyze: typeof analysis.analyzeSplit = analysis.analyzeSplit
): Promise<AnalysisResponse> {
  const key = splitAnalysisKey(split);
  const cached = splitAnalysisCache.get(key);
  if (cached?.data && cached.fetchedAt && Date.now() - cached.fetchedAt < SPLIT_ANALYSIS_TTL_MS) {
    return Promise.resolve(cached.data);
  }
  if (cached?.promise) return cached.promise;
  const promise = analyze(splitToAnalysisRequest(split))
    .then((data) => {
      splitAnalysisCache.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .catch((error) => {
      splitAnalysisCache.delete(key);
      throw error;
    });
  splitAnalysisCache.set(key, { ...cached, promise });
  return promise;
}

export function clearSplitAnalysisCache(): void {
  splitAnalysisCache.clear();
}
