import api from './client';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface RegisterPayload {
  name: string;
  phone: string;
  email: string;
  password: string;
  role: 'CUSTOMER' | 'PROVIDER';
}

interface RegisterResponse extends LoginResponse {}

export async function login(email: string, password: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function registerUser(payload: RegisterPayload) {
  const { data } = await api.post<RegisterResponse>('/auth/register', payload);
  return data;
}

export async function fetchProfile() {
  const { data } = await api.get('/auth/profile');
  return data;
}
