export interface SplitExerciseOccurrence<Session, Exercise> {
  session: Session;
  exercise: Exercise;
  sessionIndex: number;
  exerciseIndex: number;
  /** Stable position key for applying a split-wide change back to every row. */
  targetKey: string;
}

export interface SplitExerciseGroup<Session, Exercise> {
  /** Canonical movement identity, normalized for stable comparison. */
  identity: string;
  /** Display name from the first occurrence in split order. */
  name: string;
  occurrences: SplitExerciseOccurrence<Session, Exercise>[];
}

interface SplitExerciseGroupAccessors<Session, Exercise> {
  exercises: (session: Session) => readonly Exercise[];
  name: (exercise: Exercise) => string;
  /**
   * Prefer a catalog id when one exists. Saved rows may vary in spelling or
   * casing across sessions while still referring to the same movement.
   */
  identity?: (exercise: Exercise) => string | null | undefined;
}

function normalizedIdentity(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Treat one movement as one split-wide entity, regardless of how many
 * sessions contain it. Each occurrence remains addressable so a caller can
 * apply one decision back to every saved row.
 */
export function groupSplitExercises<Session, Exercise>(
  sessions: readonly Session[],
  accessors: SplitExerciseGroupAccessors<Session, Exercise>
): SplitExerciseGroup<Session, Exercise>[] {
  const groups = new Map<string, SplitExerciseGroup<Session, Exercise>>();

  sessions.forEach((session, sessionIndex) => {
    accessors.exercises(session).forEach((exercise, exerciseIndex) => {
      const name = accessors.name(exercise);
      const preferredIdentity = accessors.identity?.(exercise);
      const identity = normalizedIdentity(preferredIdentity || name);
      if (!identity) return;

      let group = groups.get(identity);
      if (!group) {
        group = { identity, name, occurrences: [] };
        groups.set(identity, group);
      }
      group.occurrences.push({
        session,
        exercise,
        sessionIndex,
        exerciseIndex,
        targetKey: `${sessionIndex}:${exerciseIndex}`,
      });
    });
  });

  return [...groups.values()];
}
