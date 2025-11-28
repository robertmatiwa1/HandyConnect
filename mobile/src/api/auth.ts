import api from './client';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'PROVIDER' | 'ADMIN' | string;
}

interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: 'CUSTOMER' | 'PROVIDER';
}

export async function login(email: string, password: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function register(payload: RegisterPayload) {
  const { data } = await api.post<LoginResponse>('/auth/register', payload);
  return data;
}

export async function fetchProfile() {
  const { data } = await api.get<AuthUser>('/auth/profile');
  return data;
}
