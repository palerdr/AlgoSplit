export interface WorkoutSet {
  id: string;
  weight: string;
  reps: string;
  rpe: string;
  completed: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  sets: WorkoutSet[];
  notes: string;
  restSeconds: number;
}

export interface ActiveWorkoutData {
  splitId: string;
  splitName: string;
  exercises: Exercise[];
  startedAt: number;
}

let _data: ActiveWorkoutData | null = null;
const _listeners = new Set<() => void>();

export function setActiveWorkout(data: ActiveWorkoutData | null) {
  _data = data;
  _listeners.forEach(fn => fn());
}

export function getActiveWorkout(): ActiveWorkoutData | null {
  return _data;
}

export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
