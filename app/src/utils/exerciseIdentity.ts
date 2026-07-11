/**
 * Returns the stable identity used for a named exercise inside a split.
 *
 * Exercise row UUIDs belong to a particular template session and are recreated
 * when a split is edited.  The normalized name is consequently the only
 * durable identity shared by the same exercise across multiple split days.
 */
export function normalizeExerciseIdentity(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}
