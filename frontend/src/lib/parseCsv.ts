export interface ParsedExercise {
  name: string;
  sets: number;
}

export interface ParsedSession {
  name: string;
  day: number;
  exercises: ParsedExercise[];
}

export interface ParsedSplit {
  sessions: ParsedSession[];
  errors: string[];
}

/**
 * Splits a CSV line respecting quoted fields.
 * e.g. `"Bench Press, Wide Grip",4,8` → ["Bench Press, Wide Grip", "4", "8"]
 */
function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current.trim());
  return cols;
}

/**
 * Parses a CSV where only the first ~3 columns matter:
 *   Column 1: Day/session header OR exercise name ("Rest" = rest day)
 *   Column 2: Number of sets (if exercise row) — blank/non-numeric = header row
 *   Column 3+: Ignored (reps, weight, etc.)
 *
 * Sessions are separated by blank lines OR by a new header row.
 *
 * Example:
 *   Push
 *   Bench Press, 4, 8, 8, 8, 8
 *   Incline DB Press, 3, 10, 10, 10
 *
 *   Pull
 *   Lat Pulldown, 4, 10, 10, 10, 10
 *   Barbell Row, 3, 8, 8, 8
 *
 *   Rest
 */
export function parseHeaderBlocksCsv(raw: string): ParsedSplit {
  const errors: string[] = [];
  const sessions: ParsedSession[] = [];

  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  let currentSession: { name: string; exercises: ParsedExercise[] } | null = null;
  let dayNumber = 1;

  function finalizeSession() {
    if (!currentSession) return;
    if (currentSession.exercises.length > 0) {
      sessions.push({
        name: currentSession.name,
        day: dayNumber++,
        exercises: currentSession.exercises,
      });
    }
    currentSession = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Blank line: finalize current session
    if (!line) {
      finalizeSession();
      continue;
    }

    const cols = splitCsvLine(line);
    const col1 = cols[0] || '';
    const col2 = cols[1] || '';

    // Skip empty first column
    if (!col1) continue;

    // Distinguish header vs exercise:
    // - Headers often repeat the day name across columns (e.g. "Chest,Chest,Chest,Chest")
    // - Exercise rows have a number (sets) in column 2
    const setsNum = parseInt(col2, 10);
    const isRepeatedName = col2 !== '' && col1.toLowerCase() === col2.toLowerCase();
    const isExerciseRow = !isRepeatedName && col2 !== '' && !isNaN(setsNum) && setsNum > 0;

    if (isExerciseRow) {
      // Exercise row: col1 = name, col2 = sets
      if (!currentSession) {
        // No header yet — create an unnamed session
        currentSession = { name: `Day ${dayNumber}`, exercises: [] };
      }
      currentSession.exercises.push({ name: col1, sets: setsNum });
    } else {
      // Header row — finalize previous session, start new one
      finalizeSession();

      // "Rest" header = rest day, skip it (just bump day number)
      if (col1.toLowerCase() === 'rest') {
        dayNumber++;
        continue;
      }

      currentSession = { name: col1, exercises: [] };
    }
  }

  // Finalize last session
  finalizeSession();

  if (sessions.length === 0 && errors.length === 0) {
    errors.push('No valid sessions found in file');
  }

  return { sessions, errors };
}
