import type {
  ExerciseCreate,
  SessionResponse,
  SessionTemplateResponse,
  SplitCreate,
} from '../api/backend';
import type { AnalysisPreferences } from '../state/localPersistence';
import { MAX_SPLIT_DAYS, resistanceProfileOrNull } from './splitEditing';

export const MIN_CYCLE_LENGTH = 1;
export const MAX_CYCLE_LENGTH = MAX_SPLIT_DAYS;
export const DEFAULT_CYCLE_LENGTH = 7;

/** A workout placed on a wizard day; day numbers are positional, never stored. */
export interface WizardWorkout {
  name: string;
  exercises: ExerciseCreate[];
}

export interface SplitWizardDay {
  /** Stable identity for drag reordering; survives cycle-length changes. */
  key: string;
  workout: WizardWorkout | null;
}

export interface SplitWizardDraft {
  name: string;
  cycleLength: number;
  stimulusDuration: number;
  maintenanceVolume: number;
  dataset: AnalysisPreferences['dataset'];
  days: SplitWizardDay[];
  /** Monotonic counter for minting unique day keys. */
  nextKey: number;
}

export function clampCycleLength(value: number): number {
  if (!Number.isInteger(value)) return DEFAULT_CYCLE_LENGTH;
  return Math.min(Math.max(value, MIN_CYCLE_LENGTH), MAX_CYCLE_LENGTH);
}

export function createSplitWizardDraft(
  preferences: AnalysisPreferences
): SplitWizardDraft {
  const days: SplitWizardDay[] = [];
  for (let index = 0; index < DEFAULT_CYCLE_LENGTH; index += 1) {
    days.push({ key: `day-${index}`, workout: null });
  }
  return {
    name: '',
    cycleLength: DEFAULT_CYCLE_LENGTH,
    stimulusDuration: preferences.stimulusDuration,
    maintenanceVolume: preferences.maintenanceVolume,
    dataset: preferences.dataset,
    days,
    nextKey: DEFAULT_CYCLE_LENGTH,
  };
}

/** Resize the day list, keeping existing assignments; shrinking drops trailing days. */
export function setWizardCycleLength(
  draft: SplitWizardDraft,
  cycleLength: number
): SplitWizardDraft {
  const length = clampCycleLength(cycleLength);
  if (length === draft.days.length) return { ...draft, cycleLength: length };
  let nextKey = draft.nextKey;
  const days = draft.days.slice(0, length);
  while (days.length < length) {
    days.push({ key: `day-${nextKey}`, workout: null });
    nextKey += 1;
  }
  return { ...draft, cycleLength: length, days, nextKey };
}

/** Workouts that would be dropped by shrinking to the given length. */
export function wizardWorkoutsBeyond(
  draft: SplitWizardDraft,
  cycleLength: number
): WizardWorkout[] {
  const length = clampCycleLength(cycleLength);
  return draft.days
    .slice(length)
    .map((day) => day.workout)
    .filter((workout): workout is WizardWorkout => workout !== null);
}

export function assignWizardWorkout(
  draft: SplitWizardDraft,
  index: number,
  workout: WizardWorkout
): SplitWizardDraft {
  if (index < 0 || index >= draft.days.length) return draft;
  return {
    ...draft,
    days: draft.days.map((day, dayIndex) =>
      dayIndex === index ? { ...day, workout } : day
    ),
  };
}

export function clearWizardDay(draft: SplitWizardDraft, index: number): SplitWizardDraft {
  if (index < 0 || index >= draft.days.length) return draft;
  return {
    ...draft,
    days: draft.days.map((day, dayIndex) =>
      dayIndex === index ? { ...day, workout: null } : day
    ),
  };
}

/** Drag semantics: the moved day slides to the target; the rest shift over. */
export function moveWizardDay(
  draft: SplitWizardDraft,
  fromIndex: number,
  toIndex: number
): SplitWizardDraft {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= draft.days.length ||
    toIndex >= draft.days.length
  ) {
    return draft;
  }
  const days = [...draft.days];
  const [moved] = days.splice(fromIndex, 1);
  days.splice(toIndex, 0, moved);
  return { ...draft, days };
}

export function templateToWizardWorkout(
  template: SessionTemplateResponse
): WizardWorkout {
  return {
    name: template.name,
    exercises: [...template.exercises]
      .sort((left, right) => left.order_index - right.order_index)
      .map((exercise) => ({
        name: exercise.exercise_name,
        sets: exercise.sets,
        unilateral: exercise.unilateral,
        resistance_profile: resistanceProfileOrNull(exercise.resistance_profile),
      })),
  };
}

/** Copy a workout day from an existing split onto a wizard day. */
export function sessionToWizardWorkout(session: SessionResponse): WizardWorkout {
  return {
    name: session.name,
    exercises: [...session.exercises]
      .sort((left, right) => left.order_index - right.order_index)
      .map((exercise) => ({
        name: exercise.exercise_name,
        sets: exercise.sets,
        unilateral: exercise.unilateral,
        resistance_profile: resistanceProfileOrNull(exercise.resistance_profile),
      })),
  };
}

export function wizardNameError(draft: SplitWizardDraft): string | null {
  if (!draft.name.trim()) return 'Enter a split name.';
  if (draft.name.trim().length > 200) return 'Split name must be 200 characters or fewer.';
  return null;
}

export function wizardDraftError(draft: SplitWizardDraft): string | null {
  const nameError = wizardNameError(draft);
  if (nameError) return nameError;
  if (
    !Number.isInteger(draft.cycleLength) ||
    draft.cycleLength < MIN_CYCLE_LENGTH ||
    draft.cycleLength > MAX_CYCLE_LENGTH
  ) {
    return `Split length must be a whole number from ${MIN_CYCLE_LENGTH} through ${MAX_CYCLE_LENGTH} days.`;
  }
  if (draft.days.length !== draft.cycleLength) {
    return 'Split days are out of sync with the cycle length.';
  }
  const workoutDays = draft.days.filter((day) => day.workout !== null);
  if (workoutDays.length === 0) return 'Add at least one workout before saving the split.';
  for (const day of workoutDays) {
    if (!day.workout!.name.trim()) return 'Every workout needs a name.';
    if (day.workout!.exercises.length === 0) {
      return 'Every workout needs at least one exercise.';
    }
  }
  return null;
}

export function wizardDraftToSplitCreate(draft: SplitWizardDraft): SplitCreate {
  return {
    name: draft.name.trim(),
    cycle_length: draft.cycleLength,
    stimulus_duration: draft.stimulusDuration,
    maintenance_volume: draft.maintenanceVolume,
    dataset: draft.dataset,
    sessions: draft.days
      .map((day, index) =>
        day.workout
          ? {
              name: day.workout.name.trim(),
              day_number: index + 1,
              exercises: day.workout.exercises,
            }
          : null
      )
      .filter((session): session is NonNullable<typeof session> => session !== null),
  };
}
