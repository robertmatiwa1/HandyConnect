import axios from 'axios';

import { useAuthStore } from '../store/auth';

export const api = axios.create({
  baseURL: 'https://handyconnect-api-production.up.railway.app',
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const state = useAuthStore.getState();

  if (!state.initialized) {
    await state.hydrate();
  }

  const token = useAuthStore.getState().token;

  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await useAuthStore.getState().clear();
    }

    return Promise.reject(error);
  },
);

export default api;
