import type { AnalysisPreferences } from '../src/state/localPersistence';
import {
  createNewSplitDraft,
  newSplitDraftError,
  newSplitDraftToCreate,
  newSplitDraftToEditorSplit,
  removeNewSplitDraftSession,
  upsertNewSplitDraftSession,
  workoutsPrimaryCreateTarget,
} from '../src/workout/newSplitDraft';

const preferences: AnalysisPreferences = {
  stimulusDuration: 72,
  maintenanceVolume: 5,
  dataset: 'average',
};

const upper = {
  name: 'Upper',
  day_number: 1,
  exercises: [
    {
      name: 'Bench Press',
      sets: 3,
      unilateral: false,
      resistance_profile: 'mid' as const,
    },
  ],
};

const lower = {
  name: 'Lower',
  day_number: 3,
  exercises: [
    {
      name: 'Back Squat',
      sets: 4,
      unilateral: false,
      resistance_profile: 'descending' as const,
    },
  ],
};

describe('new split workflow', () => {
  it('routes top-level creation to a split and nests workout creation beneath a split', () => {
    expect(workoutsPrimaryCreateTarget(null)).toBe('split');
    expect(workoutsPrimaryCreateTarget('split-1')).toBe('workout');
  });

  it('starts a seven-day split with the account analysis defaults', () => {
    expect(createNewSplitDraft(preferences)).toEqual({
      name: '',
      cycleLength: 7,
      stimulusDuration: 72,
      maintenanceVolume: 5,
      dataset: 'average',
      sessions: [],
    });
  });

  it('requires a name and at least one nested workout before creating the split', () => {
    const draft = createNewSplitDraft(preferences);
    expect(newSplitDraftError(draft)).toBe('Enter a split name.');
    draft.name = 'Strength';
    expect(newSplitDraftError(draft)).toBe(
      'Add at least one workout before saving the split.'
    );
  });

  it('adds, edits, sorts, and serializes nested workouts without an API placeholder', () => {
    let draft = { ...createNewSplitDraft(preferences), name: 'Strength' };
    draft = upsertNewSplitDraftSession(draft, null, lower, 'draft-lower');
    draft = upsertNewSplitDraftSession(draft, null, upper, 'draft-upper');
    draft = upsertNewSplitDraftSession(
      draft,
      'draft-upper',
      { ...upper, name: 'Upper Revised' },
      'unused-id'
    );

    expect(draft.sessions.map(({ id, session }) => [id, session.name])).toEqual([
      ['draft-upper', 'Upper Revised'],
      ['draft-lower', 'Lower'],
    ]);
    expect(newSplitDraftError(draft)).toBeNull();
    expect(newSplitDraftToCreate(draft)).toMatchObject({
      name: 'Strength',
      cycle_length: 7,
      stimulus_duration: 72,
      maintenance_volume: 5,
      dataset: 'average',
      sessions: [
        { name: 'Upper Revised', day_number: 1 },
        { name: 'Lower', day_number: 3 },
      ],
    });

    const editorSplit = newSplitDraftToEditorSplit(draft);
    expect(editorSplit.sessions[0]).toMatchObject({
      id: 'draft-upper',
      split_id: 'draft-split',
      name: 'Upper Revised',
      day_number: 1,
    });
    expect(editorSplit.sessions[0].exercises[0]).toMatchObject({
      exercise_name: 'Bench Press',
      order_index: 0,
      resistance_profile: 'mid',
    });
  });

  it('rejects duplicate days and can remove a draft workout', () => {
    let draft = { ...createNewSplitDraft(preferences), name: 'Strength' };
    draft = upsertNewSplitDraftSession(draft, null, upper, 'upper');
    draft = upsertNewSplitDraftSession(
      draft,
      null,
      { ...lower, day_number: 1 },
      'lower'
    );
    expect(newSplitDraftError(draft)).toBe('Day 1 appears more than once.');

    draft = removeNewSplitDraftSession(draft, 'lower');
    expect(newSplitDraftError(draft)).toBeNull();
    expect(draft.sessions.map(({ id }) => id)).toEqual(['upper']);
  });
});
