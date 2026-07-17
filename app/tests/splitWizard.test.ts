import type { SessionResponse, SessionTemplateResponse } from '../src/api/backend';
import type { AnalysisPreferences } from '../src/state/localPersistence';
import type { WizardWorkout } from '../src/workout/splitWizard';
import {
  MAX_CYCLE_LENGTH,
  assignWizardWorkout,
  clearWizardDay,
  createSplitWizardDraft,
  moveWizardDay,
  sessionToWizardWorkout,
  setWizardCycleLength,
  templateToWizardWorkout,
  wizardDraftError,
  wizardDraftToSplitCreate,
  wizardNameError,
  wizardWorkoutsBeyond,
} from '../src/workout/splitWizard';

const preferences: AnalysisPreferences = {
  stimulusDuration: 72,
  maintenanceVolume: 5,
  dataset: 'average',
};

const pushWorkout: WizardWorkout = {
  name: 'Push',
  exercises: [{ name: 'Bench Press', sets: 4, unilateral: false, resistance_profile: 'mid' }],
};

const pullWorkout: WizardWorkout = {
  name: 'Pull',
  exercises: [{ name: 'Barbell Row', sets: 4, unilateral: false, resistance_profile: null }],
};

describe('split wizard draft', () => {
  it('starts as a week of rest days seeded from analysis preferences', () => {
    const draft = createSplitWizardDraft(preferences);

    expect(draft.cycleLength).toBe(7);
    expect(draft.days).toHaveLength(7);
    expect(draft.days.every((day) => day.workout === null)).toBe(true);
    expect(new Set(draft.days.map((day) => day.key)).size).toBe(7);
    expect(draft).toMatchObject({
      stimulusDuration: 72,
      maintenanceVolume: 5,
      dataset: 'average',
    });
  });

  it('grows and shrinks the cycle while keeping assignments and unique keys', () => {
    let draft = createSplitWizardDraft(preferences);
    draft = assignWizardWorkout(draft, 0, pushWorkout);

    draft = setWizardCycleLength(draft, 10);
    expect(draft.days).toHaveLength(10);
    expect(draft.days[0].workout).toEqual(pushWorkout);
    expect(new Set(draft.days.map((day) => day.key)).size).toBe(10);

    draft = setWizardCycleLength(draft, 3);
    expect(draft.days).toHaveLength(3);
    expect(draft.cycleLength).toBe(3);
    expect(draft.days[0].workout).toEqual(pushWorkout);

    draft = setWizardCycleLength(draft, 99);
    expect(draft.cycleLength).toBe(MAX_CYCLE_LENGTH);
    expect(new Set(draft.days.map((day) => day.key)).size).toBe(MAX_CYCLE_LENGTH);
  });

  it('reports workouts that a shrink would drop', () => {
    let draft = createSplitWizardDraft(preferences);
    draft = assignWizardWorkout(draft, 6, pushWorkout);

    expect(wizardWorkoutsBeyond(draft, 6).map((workout) => workout.name)).toEqual(['Push']);
    expect(wizardWorkoutsBeyond(draft, 7)).toEqual([]);
  });

  it('assigns, clears, and moves day contents', () => {
    let draft = createSplitWizardDraft(preferences);
    draft = assignWizardWorkout(draft, 1, pushWorkout);
    draft = assignWizardWorkout(draft, 4, pullWorkout);

    draft = moveWizardDay(draft, 1, 0);
    expect(draft.days[0].workout).toEqual(pushWorkout);
    expect(draft.days[1].workout).toBeNull();
    expect(draft.days[4].workout).toEqual(pullWorkout);

    draft = clearWizardDay(draft, 4);
    expect(draft.days[4].workout).toBeNull();

    expect(moveWizardDay(draft, 0, 0)).toBe(draft);
    expect(moveWizardDay(draft, -1, 3)).toBe(draft);
    expect(moveWizardDay(draft, 0, 7)).toBe(draft);
  });

  it('validates the name step separately from the full draft', () => {
    const draft = createSplitWizardDraft(preferences);

    expect(wizardNameError(draft)).toBe('Enter a split name.');
    expect(wizardNameError({ ...draft, name: 'x'.repeat(201) })).toBe(
      'Split name must be 200 characters or fewer.'
    );
    expect(wizardNameError({ ...draft, name: 'PPL' })).toBeNull();
  });

  it('requires at least one named workout with exercises', () => {
    let draft = { ...createSplitWizardDraft(preferences), name: 'PPL' };

    expect(wizardDraftError(draft)).toBe('Add at least one workout before saving the split.');

    draft = assignWizardWorkout(draft, 0, { name: '  ', exercises: pushWorkout.exercises });
    expect(wizardDraftError(draft)).toBe('Every workout needs a name.');

    draft = assignWizardWorkout(draft, 0, { name: 'Push', exercises: [] });
    expect(wizardDraftError(draft)).toBe('Every workout needs at least one exercise.');

    draft = assignWizardWorkout(draft, 0, pushWorkout);
    expect(wizardDraftError(draft)).toBeNull();
  });

  it('builds a SplitCreate with positional days and rest days omitted', () => {
    let draft = { ...createSplitWizardDraft(preferences), name: '  PPL  ' };
    draft = setWizardCycleLength(draft, 9);
    draft = assignWizardWorkout(draft, 0, pushWorkout);
    draft = assignWizardWorkout(draft, 8, pullWorkout);

    expect(wizardDraftToSplitCreate(draft)).toEqual({
      name: 'PPL',
      cycle_length: 9,
      stimulus_duration: 72,
      maintenance_volume: 5,
      dataset: 'average',
      sessions: [
        { name: 'Push', day_number: 1, exercises: pushWorkout.exercises },
        { name: 'Pull', day_number: 9, exercises: pullWorkout.exercises },
      ],
    });
  });

  it('copies a split day into the wizard preserving order and null profiles', () => {
    const session: SessionResponse = {
      id: 'session-1',
      split_id: 'split-1',
      name: 'Upper',
      day_number: 3,
      exercises: [
        {
          id: 'ex-2',
          session_id: 'session-1',
          exercise_name: 'Barbell Row',
          sets: 4,
          order_index: 1,
          unilateral: false,
          resistance_profile: null,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'ex-1',
          session_id: 'session-1',
          exercise_name: 'Bench Press',
          sets: 4,
          order_index: 0,
          unilateral: false,
          resistance_profile: 'descending',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    expect(sessionToWizardWorkout(session)).toEqual({
      name: 'Upper',
      exercises: [
        { name: 'Bench Press', sets: 4, unilateral: false, resistance_profile: 'descending' },
        { name: 'Barbell Row', sets: 4, unilateral: false, resistance_profile: null },
      ],
    });
  });

  it('converts a saved template in persisted exercise order', () => {
    const template: SessionTemplateResponse = {
      id: 'template-1',
      user_id: 'user-1',
      name: 'Legs',
      source_session_id: null,
      source_split_id: null,
      notes: null,
      exercises: [
        {
          id: 'tex-2',
          template_id: 'template-1',
          exercise_name: 'Leg Press',
          sets: 3,
          order_index: 1,
          unilateral: false,
          resistance_profile: null,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'tex-1',
          template_id: 'template-1',
          exercise_name: 'Back Squat',
          sets: 4,
          order_index: 0,
          unilateral: false,
          resistance_profile: 'descending',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    expect(templateToWizardWorkout(template)).toEqual({
      name: 'Legs',
      exercises: [
        { name: 'Back Squat', sets: 4, unilateral: false, resistance_profile: 'descending' },
        { name: 'Leg Press', sets: 3, unilateral: false, resistance_profile: null },
      ],
    });
  });
});
