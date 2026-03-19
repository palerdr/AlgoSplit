import { apiClient, setRefreshToken } from './client';
import type {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  UserInfo,
} from '@/types/api.types';

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', data);
  if (response.data.refresh_token) {
    setRefreshToken(response.data.refresh_token);
  }
  return response.data;
}

export async function signup(data: SignupRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/signup', data);
  if (response.data.refresh_token) {
    setRefreshToken(response.data.refresh_token);
  }
  return response.data;
}

export async function getCurrentUser(): Promise<UserInfo> {
  const response = await apiClient.get<UserInfo>('/auth/user');
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/auth/account');
}
