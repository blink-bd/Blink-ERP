import axios, { AxiosInstance, AxiosError } from 'axios';
import { toast } from 'react-hot-toast';
import { getCsrfToken } from './csrf';

// استخدم مساراً نسبياً افتراضياً حتى يعمل التطبيق من نفس النطاق أو خلف proxy.
const API_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';
const SAFE_METHODS = new Set(['get', 'head', 'options']);
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/csrf'];

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<void> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      withCredentials: true,
      headers: { 'Content-Type': 'application/json' },
    });
    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.client.interceptors.request.use(
      async (config) => {
        const method = (config.method || 'get').toLowerCase();
        if (!SAFE_METHODS.has(method)) {
          config.headers['X-CSRF-Token'] = await getCsrfToken();
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;
        const requestUrl = String(originalRequest?.url || '');
        const isAuthEndpoint = NO_REFRESH_PATHS.some((path) => requestUrl.includes(path));

        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          !isAuthEndpoint
        ) {
          originalRequest._retry = true;
          try {
            if (!this.refreshPromise) {
              this.refreshPromise = this.client
                .post('/auth/refresh')
                .then(() => undefined)
                .finally(() => {
                  this.refreshPromise = null;
                });
            }
            await this.refreshPromise;
            return this.client(originalRequest);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }

        const message = (error.response?.data as any)?.error?.message || 'حدث خطأ غير متوقع';
        // أخطاء جلسة الدخول الأولية لا تظهر كرسالة منبثقة للمستخدم.
        if (!isAuthEndpoint || requestUrl.includes('/auth/login')) toast.error(message);
        return Promise.reject(error);
      }
    );
  }

  public getInstance(): AxiosInstance {
    return this.client;
  }
}

export const api = new ApiClient().getInstance();
