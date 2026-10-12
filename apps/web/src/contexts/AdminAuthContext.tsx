import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { adminApi } from '@/lib/adminApi';

export interface Admin {
  id: string;
  email: string;
  fullName: string;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
}

interface Ctx {
  admin: Admin | null;
  isLoading: boolean;
  login: (email: string, password: string, otp?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<Ctx>({
  admin: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  refresh: async () => {},
});

export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  const refresh = useCallback(async () => {
    const response = await adminApi.get('/admin/auth/me');
    setAdmin(response.data.data);
  }, []);

  useEffect(() => {
    if (!location.pathname.startsWith('/admin') || location.pathname === '/admin/login') {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void refresh()
      .catch(() => setAdmin(null))
      .finally(() => setIsLoading(false));
  }, [location.pathname, refresh]);

  const login = async (email: string, password: string, otp?: string) => {
    const response = await adminApi.post('/admin/auth/login', {
      email,
      password,
      otp: otp || undefined,
    });
    // The access token is set by the server as an HttpOnly cookie.
    setAdmin(response.data.data.admin);
  };

  const logout = () => {
    void adminApi.post('/admin/auth/logout').catch(() => undefined);
    setAdmin(null);
  };

  return (
    <AdminAuthContext.Provider value={{ admin, isLoading, login, logout, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
