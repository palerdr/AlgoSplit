import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { ProtectedRoute } from './ProtectedRoute';
import { useAuth } from './AuthProvider';


vi.mock('./AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/ui', () => ({
  PageLoader: () => <div>Loading...</div>,
}));


const mockedUseAuth = vi.mocked(useAuth);

function renderProtected(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard</div>} />
        </Route>
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>
  );
}


describe('ProtectedRoute', () => {
  it('shows loader while auth is loading', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    });

    renderProtected('/dashboard');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to login when user is not authenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    });

    renderProtected('/dashboard');
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders protected content when user is authenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'user@example.com' },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    });

    renderProtected('/dashboard');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
