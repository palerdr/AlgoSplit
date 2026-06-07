import {
  parseCycleLengthInput,
  parseStimulusDurationInput,
  parseMaintenanceVolumeInput,
  STIMULUS_DURATION_DEFAULT,
  MAINTENANCE_VOLUME_DEFAULT,
} from '../../src/utils/splitEditHelpers';

// These clamps are the guard that stops an out-of-range analysis setting from
// being persisted. Before they existed, a typo (e.g. stimulus "999") was saved
// as-is, then 422'd every analysis call — which took down the whole Analysis
// tab and, because the error replaced the settings, locked the user out of
// fixing it. The bounds mirror the backend SplitRequest schema.
describe('parseStimulusDurationInput (24-96h)', () => {
  it('clamps a ridiculous value down to the max', () => {
    expect(parseStimulusDurationInput('999')).toBe(96);
    expect(parseStimulusDurationInput(100000)).toBe(96);
  });

  it('clamps below-range values up to the min', () => {
    expect(parseStimulusDurationInput('1')).toBe(24);
    expect(parseStimulusDurationInput(0)).toBe(24);
    expect(parseStimulusDurationInput(-50)).toBe(24);
  });

  it('passes through in-range values', () => {
    expect(parseStimulusDurationInput('48')).toBe(48);
    expect(parseStimulusDurationInput(72)).toBe(72);
  });

  it('falls back to the default for unparseable / empty input', () => {
    expect(parseStimulusDurationInput('abc')).toBe(STIMULUS_DURATION_DEFAULT);
    expect(parseStimulusDurationInput('')).toBe(STIMULUS_DURATION_DEFAULT);
    expect(parseStimulusDurationInput(null)).toBe(STIMULUS_DURATION_DEFAULT);
    expect(parseStimulusDurationInput(undefined)).toBe(STIMULUS_DURATION_DEFAULT);
    expect(parseStimulusDurationInput(NaN)).toBe(STIMULUS_DURATION_DEFAULT);
  });
});

describe('parseMaintenanceVolumeInput (1-9 sets)', () => {
  it('clamps a ridiculous value down to the max', () => {
    expect(parseMaintenanceVolumeInput('999')).toBe(9);
    expect(parseMaintenanceVolumeInput(42)).toBe(9);
  });

  it('clamps below-range values (including 0) up to the min', () => {
    expect(parseMaintenanceVolumeInput('0')).toBe(1);
    expect(parseMaintenanceVolumeInput(-3)).toBe(1);
  });

  it('passes through in-range values', () => {
    expect(parseMaintenanceVolumeInput('3')).toBe(3);
    expect(parseMaintenanceVolumeInput(9)).toBe(9);
  });

  it('falls back to the default for unparseable / empty input', () => {
    expect(parseMaintenanceVolumeInput('abc')).toBe(MAINTENANCE_VOLUME_DEFAULT);
    expect(parseMaintenanceVolumeInput('')).toBe(MAINTENANCE_VOLUME_DEFAULT);
    expect(parseMaintenanceVolumeInput(null)).toBe(MAINTENANCE_VOLUME_DEFAULT);
  });
});

describe('parseCycleLengthInput (1-7 days, optional)', () => {
  it('clamps out-of-range values into 1-7', () => {
    expect(parseCycleLengthInput('999')).toBe(7);
    expect(parseCycleLengthInput('0')).toBe(1);
    expect(parseCycleLengthInput(20)).toBe(7);
  });

  it('returns undefined for blank / unparseable input (field is optional "Auto")', () => {
    expect(parseCycleLengthInput('')).toBeUndefined();
    expect(parseCycleLengthInput('  ')).toBeUndefined();
    expect(parseCycleLengthInput('abc')).toBeUndefined();
    expect(parseCycleLengthInput(null)).toBeUndefined();
  });

  it('passes through in-range values', () => {
    expect(parseCycleLengthInput('4')).toBe(4);
    expect(parseCycleLengthInput(7)).toBe(7);
  });
});
