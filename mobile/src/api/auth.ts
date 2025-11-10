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

export async function login(email: string, password: string) {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function fetchProfile() {
  const { data } = await api.get('/auth/profile');
  return data;
}
