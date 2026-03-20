import {
  normalizeSessionsForSave,
  parseCycleLengthInput,
} from '../src/utils/splitEditHelpers';

describe('splitEditHelpers', () => {
  const baseSessions = [
    { id: 'a', name: 'Push', day: 1, exercises: [{ name: 'Bench Press', sets: 3 }] },
    { id: 'b', name: 'Pull', day: 3, exercises: [{ name: 'Row', sets: 3 }] },
    { id: 'c', name: 'Legs', day: 5, exercises: [{ name: 'Squat', sets: 3 }] },
  ];

  it('keeps day gaps when cycle length is auto', () => {
    expect(normalizeSessionsForSave(baseSessions)).toMatchObject([
      { day: 1 },
      { day: 3 },
      { day: 5 },
    ]);
  });

  it('compacts days when explicit cycle length is shorter than max session day', () => {
    expect(normalizeSessionsForSave(baseSessions, 3)).toMatchObject([
      { day: 1 },
      { day: 2 },
      { day: 3 },
    ]);
  });

  it('keeps original spacing when explicit cycle length is longer than max session day', () => {
    expect(normalizeSessionsForSave(baseSessions, 7)).toMatchObject([
      { day: 1 },
      { day: 3 },
      { day: 5 },
    ]);
  });

  it('filters unnamed exercises but keeps validation responsibility to callers', () => {
    const sessions = [
      {
        id: 'x',
        name: 'Upper',
        day: 2,
        exercises: [{ name: 'Incline Press', sets: 3 }, { name: '   ', sets: 2 }],
      },
    ];
    expect(normalizeSessionsForSave(sessions)).toMatchObject([
      { exercises: [{ name: 'Incline Press' }] },
    ]);
  });

  it('treats blank cycle length as auto', () => {
    expect(parseCycleLengthInput('')).toBeUndefined();
    expect(parseCycleLengthInput('   ')).toBeUndefined();
  });
});
