import {
  isProfileNotCreated,
  isValidUsername,
  normalizeUsername,
  socialApiUnavailableMessage,
} from '../src/social/usernames';

describe('social usernames', () => {
  it('normalizes the one public username field', () => {
    expect(normalizeUsername(' @New.User! ')).toBe('newuser');
    expect(normalizeUsername('Lift_Buddy')).toBe('lift_buddy');
  });

  it('enforces the persisted username contract', () => {
    expect(isValidUsername('lift_buddy')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('display name')).toBe(false);
  });

  it('distinguishes an uncreated profile from a missing preview route', () => {
    const missingProfile = Object.assign(new Error('Profile not created'), {
      status: 404,
      detail: { detail: 'Profile not created' },
    });
    const missingRoute = Object.assign(new Error('Not Found'), {
      status: 404,
      detail: { detail: 'Not Found' },
    });

    expect(isProfileNotCreated(missingProfile)).toBe(true);
    expect(isProfileNotCreated(missingRoute)).toBe(false);
    expect(socialApiUnavailableMessage(missingRoute)).toContain('without Friends support');
  });
});
