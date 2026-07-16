import type {
  SessionCreate,
  SessionResponse,
  SplitCreate,
  SplitResponse,
} from '../api/backend';
import type { AnalysisPreferences } from '../state/localPersistence';

export interface NewSplitDraftSession {
  id: string;
  session: SessionCreate;
}

export interface NewSplitDraft {
  name: string;
  cycleLength: number;
  stimulusDuration: number;
  maintenanceVolume: number;
  dataset: AnalysisPreferences['dataset'];
  sessions: NewSplitDraftSession[];
}

/** Top-level creation starts a split; workout creation exists one level beneath a split. */
export function workoutsPrimaryCreateTarget(
  selectedSplitId: string | null
): 'split' | 'workout' {
  return selectedSplitId ? 'workout' : 'split';
}

export function createNewSplitDraft(preferences: AnalysisPreferences): NewSplitDraft {
  return {
    name: '',
    cycleLength: 7,
    stimulusDuration: preferences.stimulusDuration,
    maintenanceVolume: preferences.maintenanceVolume,
    dataset: preferences.dataset,
    sessions: [],
  };
}

export function upsertNewSplitDraftSession(
  draft: NewSplitDraft,
  sessionId: string | null,
  session: SessionCreate,
  newSessionId: string
): NewSplitDraft {
  const sessions = sessionId
    ? draft.sessions.map((candidate) =>
        candidate.id === sessionId ? { ...candidate, session } : candidate
      )
    : [...draft.sessions, { id: newSessionId, session }];
  return {
    ...draft,
    sessions: sessions.sort(
      (left, right) => left.session.day_number - right.session.day_number
    ),
  };
}

export function removeNewSplitDraftSession(
  draft: NewSplitDraft,
  sessionId: string
): NewSplitDraft {
  return {
    ...draft,
    sessions: draft.sessions.filter((candidate) => candidate.id !== sessionId),
  };
}

export function newSplitDraftError(draft: NewSplitDraft): string | null {
  if (!draft.name.trim()) return 'Enter a split name.';
  if (draft.name.trim().length > 200) return 'Split name must be 200 characters or fewer.';
  if (draft.sessions.length === 0) return 'Add at least one workout before saving the split.';
  if (draft.sessions.length > 7) {
    return 'A seven-day split cannot contain more than seven workout or rest days.';
  }

  const days = new Set<number>();
  for (const { session } of draft.sessions) {
    if (!session.name.trim()) return 'Every workout needs a name.';
    if (!Number.isInteger(session.day_number) || session.day_number < 1 || session.day_number > 7) {
      return 'Every workout day must be a whole number from 1 through 7.';
    }
    if (days.has(session.day_number)) {
      return `Day ${session.day_number} appears more than once.`;
    }
    days.add(session.day_number);
  }
  return null;
}

export function newSplitDraftToCreate(draft: NewSplitDraft): SplitCreate {
  return {
    name: draft.name.trim(),
    cycle_length: draft.cycleLength,
    stimulus_duration: draft.stimulusDuration,
    maintenance_volume: draft.maintenanceVolume,
    dataset: draft.dataset,
    sessions: draft.sessions
      .map(({ session }) => session)
      .sort((left, right) => left.day_number - right.day_number),
  };
}

function draftSessionResponse(
  splitId: string,
  draftSession: NewSplitDraftSession
): SessionResponse {
  return {
    id: draftSession.id,
    split_id: splitId,
    name: draftSession.session.name,
    day_number: draftSession.session.day_number,
    exercises: draftSession.session.exercises.map((exercise, index) => ({
      id: `${draftSession.id}:exercise:${index}`,
      session_id: draftSession.id,
      exercise_name: exercise.name,
      sets: exercise.sets,
      order_index: index,
      unilateral: Boolean(exercise.unilateral),
      resistance_profile: exercise.resistance_profile ?? 'mid',
      created_at: '',
    })),
    created_at: '',
    updated_at: '',
  };
}

/** Adapt an unsaved split to the existing workout editor without touching the API. */
export function newSplitDraftToEditorSplit(draft: NewSplitDraft): SplitResponse {
  const id = 'draft-split';
  return {
    id,
    user_id: 'draft-user',
    name: draft.name.trim() || 'New Split',
    cycle_length: draft.cycleLength,
    stimulus_duration: draft.stimulusDuration,
    maintenance_volume: draft.maintenanceVolume,
    dataset: draft.dataset,
    sessions: draft.sessions.map((session) => draftSessionResponse(id, session)),
    created_at: '',
    updated_at: '',
  };
}
