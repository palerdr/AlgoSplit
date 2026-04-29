import { apiClient } from './client';
import type {
  AuthResponse,
  LoginRequest,
  SignupRequest,
  UserInfo,
} from '../types/api.types';

export async function login(data: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', data);
  return response.data;
}

export async function signup(data: SignupRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/signup', data);
  return response.data;
}

export async function getCurrentUser(): Promise<UserInfo> {
  const response = await apiClient.get<UserInfo>('/auth/user');
  return response.data;
}

export async function refreshToken(refresh_token: string): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/refresh', { refresh_token });
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/auth/account');
}

export async function forgotPassword(email: string): Promise<void> {
  await apiClient.post('/auth/forgot-password', { email });
}

export async function resetPassword(access_token: string, new_password: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { access_token, new_password });
}
