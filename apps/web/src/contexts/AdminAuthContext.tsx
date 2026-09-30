import React, { createContext, useContext, useEffect, useState } from 'react';
import { adminApi } from '@/lib/adminApi';

interface Admin { id: string; email: string; fullName: string }
interface Ctx {
  admin: Admin | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<Ctx>({
  admin: null, isLoading: true, login: async () => {}, logout: () => {},
});
export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('masterToken')) { setIsLoading(false); return; }
    adminApi.get('/admin/auth/me')
      .then((r) => setAdmin(r.data.data))
      .catch(() => localStorage.removeItem('masterToken'))
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await adminApi.post('/admin/auth/login', { email, password });
    localStorage.setItem('masterToken', r.data.data.accessToken);
    setAdmin(r.data.data.admin);
  };

  const logout = () => {
    localStorage.removeItem('masterToken');
    setAdmin(null);
  };

  return <AdminAuthContext.Provider value={{ admin, isLoading, login, logout }}>{children}</AdminAuthContext.Provider>;
};
