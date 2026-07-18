import React from 'react';

const mockUseAccountState = jest.fn();

jest.mock('../src/state/AccountState', () => ({
  useAccountState: () => mockUseAccountState(),
}));
jest.mock('../src/ui/GlassRuntime', () => ({
  LiquidGlassView: null,
  liquidGlassAvailable: false,
}));

import AuthScreen from '../src/screens/AuthScreen';
import { authCardWidth } from '../src/auth/authLayout';

const TestRenderer = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => {
    root: {
      findByProps: (props: Record<string, unknown>) => {
        props: Record<string, unknown> & {
          disabled?: boolean;
          onPress?: () => Promise<void>;
        };
      };
    };
    unmount: () => void;
  };
};

describe('AuthScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAccountState.mockReturnValue({
      status: 'signedOut',
      sessionError: null,
      appleProviderEnabled: false,
      login: jest.fn(),
      signup: jest.fn(),
      forgotPassword: jest.fn(),
      refreshSession: jest.fn(),
      signInWithProvider: jest.fn(async () => undefined),
    });
  });

  it('keeps Google actionable without Expo-bundled Supabase variables', async () => {
    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(AuthScreen));
    });

    const google = renderer!.root.findByProps({ accessibilityLabel: 'Continue with Google' });
    expect(google.props.disabled).toBe(false);

    await TestRenderer.act(async () => {
      await google.props.onPress?.();
    });
    expect(mockUseAccountState().signInWithProvider).toHaveBeenCalledWith('google');
    await TestRenderer.act(async () => {
      renderer!.unmount();
    });
  });

  it('locks the provider buttons while a social launch is pending', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const signInWithProvider = jest.fn(() => pending);
    mockUseAccountState.mockReturnValue({
      ...mockUseAccountState(),
      signInWithProvider,
    });

    let renderer: ReturnType<typeof TestRenderer.create> | undefined;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(AuthScreen));
    });
    const google = renderer!.root.findByProps({ accessibilityLabel: 'Continue with Google' });
    let press: Promise<void> | undefined;
    await TestRenderer.act(async () => {
      press = google.props.onPress?.();
      await Promise.resolve();
    });

    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Continue with Google' }).props.disabled
    ).toBe(true);

    await TestRenderer.act(async () => {
      finish();
      await press;
    });
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Continue with Google' }).props.disabled
    ).toBe(false);
    await TestRenderer.act(async () => {
      renderer!.unmount();
    });
  });
});

describe('authCardWidth', () => {
  it.each([
    [320, 272],
    [390, 342],
    [1024, 420],
    [40, 0],
  ])('bounds a %ipx viewport to %ipx', (viewport, expected) => {
    expect(authCardWidth(viewport)).toBe(expected);
  });
});
