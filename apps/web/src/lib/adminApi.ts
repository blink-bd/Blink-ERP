import axios from 'axios';
import { toast } from 'react-hot-toast';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';

export const adminApi = axios.create({ baseURL: API_URL });

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('masterToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

adminApi.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && !String(error.config?.url).includes('/admin/auth/login')) {
      localStorage.removeItem('masterToken');
      window.location.href = '/admin/login';
    } else {
      const raw = error.response?.data?.error?.message;
      toast.error(Array.isArray(raw) ? raw.join('، ') : raw || 'حدث خطأ غير متوقع');
    }
    return Promise.reject(error);
  }
);
