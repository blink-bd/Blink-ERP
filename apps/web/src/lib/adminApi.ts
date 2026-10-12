import axios from 'axios';
import { toast } from 'react-hot-toast';
import { getCsrfToken } from './csrf';

const API_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';
export const adminApi = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000,
});

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
    const url = String(error.config?.url || '');
    const code = error.response?.data?.error?.code;
    if (error.response?.status === 401 && !url.includes('/admin/auth/login')) {
      window.location.href = '/admin/login';
    } else if (code === 'OTP_REQUIRED' || code === 'OTP_INVALID') {
      // The login page handles OTP challenges inline.
    } else {
      const raw = error.response?.data?.error?.message;
      toast.error(Array.isArray(raw) ? raw.join('، ') : raw || 'حدث خطأ غير متوقع');
    }
    return Promise.reject(error);
  }
);
