import axios from 'axios';
import { toast } from 'react-hot-toast';
import { getCsrfToken } from './csrf';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';
export const adminApi = axios.create({ baseURL: API_URL, withCredentials: true });

adminApi.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase();
  if (!['get', 'head', 'options'].includes(method)) {
    config.headers['X-CSRF-Token'] = await getCsrfToken();
  }
  return config;
});

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !String(error.config?.url).includes('/admin/auth/login')
    ) {
      window.location.href = '/admin/login';
    } else {
      const raw = error.response?.data?.error?.message;
      toast.error(Array.isArray(raw) ? raw.join('، ') : raw || 'حدث خطأ غير متوقع');
    }
    return Promise.reject(error);
  }
);
