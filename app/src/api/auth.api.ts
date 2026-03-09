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

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}
