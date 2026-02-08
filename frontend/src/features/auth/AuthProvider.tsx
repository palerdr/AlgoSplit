import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '@/lib/utils';
import * as authApi from '@/api/auth.api';
import type { UserInfo } from '@/types/api.types';

interface AuthState {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const navigate = useNavigate();

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = storage.get<string>('access_token');
      if (!token) {
        setState({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      try {
        const user = await authApi.getCurrentUser();
        setState({ user, isAuthenticated: true, isLoading: false });
      } catch {
        storage.remove('access_token');
        setState({ user: null, isAuthenticated: false, isLoading: false });
      }
    };

    checkAuth();
  }, []);

  // Listen for auth:logout events from API interceptor
  useEffect(() => {
    const handleLogout = () => {
      setState({ user: null, isAuthenticated: false, isLoading: false });
    };

    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login({ email, password });
    storage.set('access_token', response.access_token);
    setState({ user: response.user, isAuthenticated: true, isLoading: false });
    navigate('/dashboard');
  };

  const signup = async (email: string, password: string) => {
    const response = await authApi.signup({ email, password });
    storage.set('access_token', response.access_token);
    setState({ user: response.user, isAuthenticated: true, isLoading: false });
    navigate('/dashboard');
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors - logout anyway
    } finally {
      storage.remove('access_token');
      setState({ user: null, isAuthenticated: false, isLoading: false });
      navigate('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
