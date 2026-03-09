import React from 'react';
import { render, screen } from '@testing-library/react-native';

import AuthLayout from '../../app/(auth)/_layout';
import { useAuth } from '../../src/hooks/useAuth';


jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../src/components/ui', () => ({
  Spinner: () => {
    const ReactNative = require('react-native');
    return <ReactNative.Text testID="spinner">Loading</ReactNative.Text>;
  },
}));

jest.mock('expo-router', () => {
  const ReactNative = require('react-native');
  const React = require('react');

  const MockStack = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  MockStack.Screen = ({ name }: { name: string }) => <ReactNative.Text>{`screen:${name}`}</ReactNative.Text>;

  return {
    Stack: MockStack,
    Redirect: ({ href }: { href: string }) => <ReactNative.Text>{`redirect:${href}`}</ReactNative.Text>,
  };
});


const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;


describe('AuthLayout route guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders full-screen spinner while auth state is loading', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: jest.fn(),
      signup: jest.fn(),
      logout: jest.fn(),
    });

    render(<AuthLayout />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('redirects authenticated users to tabs', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'x@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: jest.fn(),
      signup: jest.fn(),
      logout: jest.fn(),
    });

    render(<AuthLayout />);
    expect(screen.getByText('redirect:/(tabs)')).toBeTruthy();
  });

  it('shows auth screens for unauthenticated users', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: jest.fn(),
      signup: jest.fn(),
      logout: jest.fn(),
    });

    render(<AuthLayout />);
    expect(screen.getByText('screen:login')).toBeTruthy();
    expect(screen.getByText('screen:signup')).toBeTruthy();
  });
});
