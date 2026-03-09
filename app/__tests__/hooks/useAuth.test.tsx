import React from 'react';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '../../src/hooks/useAuth';
import * as authApi from '../../src/api/auth.api';


const mockSetToken = jest.fn();
const mockClearToken = jest.fn();
const mockGetToken = jest.fn().mockResolvedValue(null);
const mockStorageGetItem = jest.fn().mockResolvedValue(null);
const mockStorageSetItem = jest.fn().mockResolvedValue(undefined);
const mockStorageRemoveItem = jest.fn().mockResolvedValue(undefined);
let authLogoutListener: (() => void) | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockStorageGetItem(...args),
  setItem: (...args: unknown[]) => mockStorageSetItem(...args),
  removeItem: (...args: unknown[]) => mockStorageRemoveItem(...args),
}));

jest.mock('../../src/api/client', () => ({
  tokenStore: {
    getToken: (...args: unknown[]) => mockGetToken(...args),
    setToken: (...args: unknown[]) => mockSetToken(...args),
    clearToken: (...args: unknown[]) => mockClearToken(...args),
  },
  onAuthLogout: jest.fn((listener: () => void) => {
    authLogoutListener = listener;
    return () => {
      authLogoutListener = null;
    };
  }),
  getErrorMessage: jest.fn(),
}));

jest.mock('../../src/api/auth.api');


let latestAuth: ReturnType<typeof useAuth> | null = null;

function Probe() {
  latestAuth = useAuth();
  const status = latestAuth.isLoading
    ? 'loading'
    : latestAuth.isAuthenticated
      ? 'authed'
      : 'anon';
  return <Text testID="auth-status">{status}</Text>;
}

function renderWithProvider() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>
  );
}


describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(null);
    mockStorageGetItem.mockResolvedValue(null);
    latestAuth = null;
    authLogoutListener = null;
  });

  it('bootstraps authenticated state when current user request succeeds', async () => {
    mockGetToken.mockResolvedValue('token-123');
    jest.mocked(authApi.getCurrentUser).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('authed');
    });
    expect(latestAuth?.user?.email).toBe('user@example.com');
    expect(mockStorageSetItem).toHaveBeenCalled();
  });

  it('restores cached user while refreshing auth on native startup', async () => {
    mockGetToken.mockResolvedValue('token-123');
    mockStorageGetItem.mockResolvedValue(JSON.stringify({
      id: 'user-cached',
      email: 'cached@example.com',
    }));
    jest.mocked(authApi.getCurrentUser).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        id: 'user-fresh',
        email: 'fresh@example.com',
      }), 0))
    );

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('authed');
    });
    expect(latestAuth?.user?.email).toBe('fresh@example.com');
  });

  it('stores token and authenticates on login', async () => {
    jest.mocked(authApi.getCurrentUser).mockRejectedValue(new Error('unauthenticated'));
    jest.mocked(authApi.login).mockResolvedValue({
      access_token: 'token-123',
      token_type: 'bearer',
      expires_in: 3600,
      user: { id: 'user-2', email: 'login@example.com' },
    });

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('anon');
    });

    await act(async () => {
      await latestAuth?.login('login@example.com', 'Password123!');
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('authed');
    });
    expect(mockSetToken).toHaveBeenCalledWith('token-123');
    expect(latestAuth?.user?.email).toBe('login@example.com');
  });

  it('handles interceptor-driven logout events', async () => {
    mockGetToken.mockResolvedValue('token-123');
    jest.mocked(authApi.getCurrentUser).mockResolvedValue({
      id: 'user-3',
      email: 'persisted@example.com',
    });

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('authed');
    });

    act(() => {
      authLogoutListener?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('anon');
    });
  });

  it('clears local token on logout even if server logout fails', async () => {
    mockGetToken.mockResolvedValue('token-123');
    jest.mocked(authApi.getCurrentUser).mockResolvedValue({
      id: 'user-4',
      email: 'logout@example.com',
    });
    jest.mocked(authApi.logout).mockRejectedValue(new Error('server unavailable'));

    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('authed');
    });

    await act(async () => {
      await latestAuth?.logout();
    });

    expect(mockClearToken).toHaveBeenCalled();
    expect(mockStorageRemoveItem).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('auth-status').props.children).toBe('anon');
    });
  });
});
