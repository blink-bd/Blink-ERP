import React, { createContext, useContext, useEffect, useState } from 'react';
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
  /** بعد تغيير كلمة المرور/تفعيل 2FA السيرفر بيلغي الجلسات القديمة ويرجع توكن جديد */
  replaceToken: (token: string) => void;
}

const AdminAuthContext = createContext<Ctx>({
  admin: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  refresh: async () => {},
  replaceToken: () => {},
});
export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    const r = await adminApi.get('/admin/auth/me');
    setAdmin(r.data.data);
  };

  useEffect(() => {
    if (!localStorage.getItem('masterToken')) {
      setIsLoading(false);
      return;
    }
    refresh()
      .catch(() => localStorage.removeItem('masterToken'))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string, otp?: string) => {
    const r = await adminApi.post('/admin/auth/login', { email, password, otp: otp || undefined });
    localStorage.setItem('masterToken', r.data.data.accessToken);
    setAdmin(r.data.data.admin);
  };

  const logout = () => {
    localStorage.removeItem('masterToken');
    setAdmin(null);
  };

  const replaceToken = (token: string) => localStorage.setItem('masterToken', token);

  return (
    <AdminAuthContext.Provider value={{ admin, isLoading, login, logout, refresh, replaceToken }}>
      {children}
    </AdminAuthContext.Provider>
  );
};
